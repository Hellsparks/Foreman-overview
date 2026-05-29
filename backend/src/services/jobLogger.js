/**
 * Shared print-job logging primitives used by poller.js (HTTP firmware) and
 * bambuManager.js (Bambu MQTT).  Both callers detect state transitions and write
 * to gcode_print_jobs; extracting the logic here prevents the two copies from
 * drifting.
 *
 * Callers are responsible for any surrounding bookkeeping (clearing
 * printer_active_jobs, updating printers.runtime_s) — those are caller-specific.
 */

/**
 * Detect whether a state transition marks a terminal print event.
 *
 * @param {string} prevState  - Previous normalized state
 * @param {string} currentState - Current normalized state
 * @param {object} opts
 * @param {number}  [opts.durationAfter=0]   - print_stats duration after transition (for crash detection)
 * @param {string}  [opts.currentFilename=''] - current filename (for crash detection)
 * @param {string}  [opts.firmware]           - 'bambu' for Bambu-specific transition rules
 * @returns {'complete'|'cancelled'|'error'|null}
 */
function detectTerminalStatus(prevState, currentState, { durationAfter = 0, currentFilename = '', firmware } = {}) {
  if (firmware === 'bambu') {
    // Bambu state machine differs: RUNNING→IDLE (standby) is treated as complete
    // because Bambu may skip the FINISH state when cancelling via stop command.
    // This mirrors the pre-refactor bambuManager.js transition block.
    if (prevState === 'printing') {
      if (currentState === 'complete') return 'complete';
      if (currentState === 'error') return 'error';
      if (currentState === 'standby') return 'complete'; // RUNNING→IDLE without FINISH
    }
    if (prevState === 'paused' && currentState === 'standby') return 'cancelled';
    return null;
  }

  // Default rules: Moonraker / OctoPrint / Duet
  //   Firmware notes:
  //     Moonraker:   printing/paused → complete | cancelled | error
  //     OctoPrint:   printing → complete (via "Finishing" mapping), cancelling → standby
  //     Duet:        printing → standby (natural finish), cancelling → standby
  if (prevState === 'printing' || prevState === 'paused') {
    if (currentState === 'complete') return 'complete';
    if (currentState === 'cancelled') return 'cancelled';
    if (currentState === 'error') return 'error';
    if (currentState === 'standby') {
      if (prevState === 'paused') return 'cancelled'; // cancelled while paused
      // printing → standby: distinguish firmware restart from natural finish.
      // Klipper resets print_stats on restart: filename → "" AND duration → 0.
      // A natural finish (Duet, etc.) leaves the filename intact with duration > 0.
      if (durationAfter === 0 && !currentFilename) return 'error'; // firmware restart / crash
      return 'complete'; // natural finish
    }
  }

  if (prevState === 'cancelling') {
    if (currentState === 'standby') return 'cancelled';
    if (currentState === 'error') return 'error';
  }

  return null;
}

/**
 * Insert one row into gcode_print_jobs and, when a plate is linked, update
 * the corresponding project_plates row.
 *
 * @param {object} db - DatabaseSync instance from getDb()
 * @param {object} opts
 * @param {number}  opts.printerId
 * @param {string}  opts.filename
 * @param {number}  opts.durationS       - total print duration in seconds
 * @param {number}  opts.filamentUsedMm  - filament consumed in mm
 * @param {object|null} opts.spool       - spool details object or null
 * @param {string}  opts.status          - 'complete' | 'cancelled' | 'error'
 * @param {number|null} opts.plateId     - project_plates.id, or null if not project-linked
 * @returns {number} lastInsertRowid
 */
function logJob(db, { printerId, filename, durationS, filamentUsedMm, spool, status, plateId }) {
  const result = db.prepare(`
    INSERT INTO gcode_print_jobs
    (printer_id, filename, total_duration_s, filament_used_mm, spool_id, spool_name, material, color_hex, vendor, status, plate_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    printerId,
    filename,
    Math.round(durationS),
    filamentUsedMm,
    spool?.id ?? null,
    spool?.filament_name ?? null,
    spool?.material ?? null,
    spool?.color_hex ?? null,
    spool?.vendor ?? null,
    status,
    plateId ?? null,
  );

  if (plateId) {
    const plateStatus = status === 'complete' ? 'done'
      : status === 'cancelled' ? 'pending'
      : 'failed';
    db.prepare(`
      UPDATE project_plates
      SET status = ?, print_job_id = ?, completed_at = datetime('now')
      WHERE id = ?
    `).run(plateStatus, result.lastInsertRowid, plateId);
  }

  return result.lastInsertRowid;
}

module.exports = { detectTerminalStatus, logJob };
