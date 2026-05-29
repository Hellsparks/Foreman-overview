const { getDb } = require('../db');
const { getClient } = require('./clientFactory');
const bambuManager = require('./bambuManager');
const printerCache = require('./printerCache');
const { detectTerminalStatus, logJob } = require('./jobLogger');
const { getSpoolDetails, getActiveSpoolId, clearSpoolCache } = require('./spoolCache');

const POLL_INTERVAL_ACTIVE_MS = 3000;  // When any printer is printing
const POLL_INTERVAL_IDLE_MS   = 10000; // When all printers are idle
let pollTimer = null;
let polling = false; // stacking guard

// Printer state tracking to log finished/cancelled jobs
// Maps printerId -> { state, filename, startTime, activeSpool }
const previousStates = new Map();

async function pollAll() {
  // Stacking guard: if previous poll hasn't finished, skip this cycle entirely.
  // This prevents request pile-up that can starve Klipper's MCU scheduler.
  if (polling) return;
  polling = true;

  try {
    await _pollAllInner();
  } finally {
    polling = false;
  }
}

async function _pollAllInner() {
  const db = getDb();
  const printers = db.prepare('SELECT * FROM printers WHERE enabled = 1').all();

  // Get Spoolman URL once per poll cycle
  const settingsRow = db.prepare("SELECT value FROM settings WHERE key = 'spoolman_url'").get();
  const spoolmanUrl = settingsRow?.value || '';

  await Promise.allSettled(
    printers.map(async (printer) => {
      // Bambu printers are managed entirely by bambuManager (MQTT).
      // The manager writes to printerCache and handles job logging itself.
      if (printer.firmware_type === 'bambu') {
        bambuManager.ensureConnected(printer);
        return;
      }

      const client = getClient(printer);
      try {
        const status = await client.getStatus();

        // Fetch active spool from Moonraker → Spoolman (Moonraker-only)
        // Both lookups are TTL-cached to avoid extra HTTP round-trips every cycle
        let activeSpool = null;
        if (spoolmanUrl && (!printer.firmware_type || printer.firmware_type === 'moonraker')) {
          const spoolId = await getActiveSpoolId(client, printer.id);
          if (spoolId) {
            activeSpool = await getSpoolDetails(spoolId, spoolmanUrl);
          }
        }

        // --- Print Job Tracking Logic ---
        const currentState = status.print_stats?.state;
        const currentFilename = status.print_stats?.filename;

        // Guard: if state is missing (Moonraker startup race, Klippy disconnect, etc.)
        // do NOT update previousStates — preserve last known good state so we don't
        // poison the tracker with undefined and permanently miss future transitions.
        if (!currentState) {
          printerCache.set(printer.id, {
            ...status,
            _online: true,
            _polled_at: Date.now(),
            _active_spool: activeSpool,
          });
          return;
        }

        const prevStateObj = previousStates.get(printer.id);

        // Startup recovery: if we have no previousState for this printer but there's an
        // active job record in the DB and the printer is in a terminal state, the backend
        // must have restarted during a print. Log the job now so the plate gets updated.
        if (!prevStateObj) {
          const TERMINAL = ['complete', 'cancelled', 'error', 'standby'];
          const durationNow = status.print_stats?.total_duration || status.print_stats?.print_duration || 0;
          // Only recover if there's evidence a print actually finished (duration > 0 or non-standby terminal state)
          const shouldRecover = TERMINAL.includes(currentState) && (currentState !== 'standby' || durationNow > 0);
          if (shouldRecover) {
            try {
              const staleJob = db.prepare('SELECT * FROM printer_active_jobs WHERE printer_id = ?').get(printer.id);
              if (staleJob) {
                const terminalStatus = currentState === 'complete' ? 'complete'
                  : currentState === 'cancelled' ? 'cancelled'
                  : currentState === 'error' ? 'error'
                  : 'complete'; // standby after active job = assume complete
                const duration = status.print_stats?.total_duration || status.print_stats?.print_duration || 0;
                const filamentUsed = status.print_stats?.filament_used || 0;
                logJob(db, {
                  printerId: printer.id,
                  filename: staleJob.filename,
                  durationS: duration,
                  filamentUsedMm: filamentUsed,
                  spool: null,
                  status: terminalStatus,
                  plateId: staleJob.plate_id || null,
                });
                db.prepare('DELETE FROM printer_active_jobs WHERE printer_id = ?').run(printer.id);
                if (duration > 0) db.prepare('UPDATE printers SET runtime_s = runtime_s + ? WHERE id = ?').run(Math.round(duration), printer.id);
                console.log(`[Poller] Startup recovery: logged stale job "${staleJob.filename}" (${terminalStatus}) on Printer ${printer.id}`);
              }
            } catch (e) {
              console.error('[Poller] Startup recovery failed:', e.message);
            }
          }
        }

        if (prevStateObj) {
          const prevState = prevStateObj.state;

          const durationAfter = status.print_stats?.total_duration
            || status.print_stats?.print_duration || 0;
          const terminalStatus = detectTerminalStatus(prevState, currentState, {
            durationAfter,
            currentFilename,
          });

          if (terminalStatus) {
            const duration = status.print_stats?.total_duration || status.print_stats?.print_duration || 0;
            const filamentUsed = status.print_stats?.filament_used || 0;
            const spoolUsed = prevStateObj.activeSpool || activeSpool;
            const loggedFilename = prevStateObj.filename || currentFilename || 'Unknown';

            try {
              // Check if this print was associated with a project plate.
              // Wrapped separately so a missing table never blocks job logging.
              let activeJob = null;
              try {
                activeJob = db.prepare(
                  'SELECT plate_id FROM printer_active_jobs WHERE printer_id = ? AND filename = ?'
                ).get(printer.id, loggedFilename);
              } catch { /* table may not exist yet */ }

              logJob(db, {
                printerId: printer.id,
                filename: loggedFilename,
                durationS: duration,
                filamentUsedMm: filamentUsed,
                spool: spoolUsed,
                status: terminalStatus,
                plateId: activeJob?.plate_id || null,
              });

              // Always clear the active job record (prevents stale entries triggering false startup recovery)
              db.prepare('DELETE FROM printer_active_jobs WHERE printer_id = ?').run(printer.id);

              console.log(`[Poller] Logged print job (${terminalStatus}): "${loggedFilename}" on Printer ${printer.id}`);
              if (duration > 0) {
                db.prepare('UPDATE printers SET runtime_s = runtime_s + ? WHERE id = ?').run(Math.round(duration), printer.id);
              }
            } catch (jobErr) {
              console.error(`[Poller] Failed to log print job:`, jobErr.message);
            }
          }
        }

        // Only update previousStates with valid, known states
        previousStates.set(printer.id, {
          state: currentState,
          filename: currentFilename,
          activeSpool: activeSpool
        });

        printerCache.set(printer.id, {
          ...status,
          _online: true,
          _polled_at: Date.now(),
          _active_spool: activeSpool,
        });
      } catch (err) {
        printerCache.set(printer.id, {
          _online: false,
          _error: err.message,
          _polled_at: Date.now(),
        });
      }
    })
  );
}

function scheduleNext() {
  // Adaptive interval: poll faster when any printer is actively printing
  const anyActive = Object.values(printerCache.getAll()).some(s => {
    const st = s?.print_stats?.state;
    return st === 'printing' || st === 'paused' || st === 'cancelling';
  });
  const interval = anyActive ? POLL_INTERVAL_ACTIVE_MS : POLL_INTERVAL_IDLE_MS;
  pollTimer = setTimeout(async () => {
    await pollAll();
    if (pollTimer !== null) scheduleNext(); // only continue if not stopped
  }, interval);
}

function startPolling() {
  stopPolling();
  pollAll().then(() => scheduleNext()); // immediate first poll, then chain
  console.log(`[Poller] Started polling (active: ${POLL_INTERVAL_ACTIVE_MS}ms, idle: ${POLL_INTERVAL_IDLE_MS}ms)`);
}

function stopPolling() {
  if (pollTimer) {
    clearTimeout(pollTimer);
    pollTimer = null;
  }
}

module.exports = { startPolling, stopPolling, pollAll };
