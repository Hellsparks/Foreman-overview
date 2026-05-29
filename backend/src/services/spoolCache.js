/**
 * Spool data caching — extracted from poller.js so it can be imported
 * by any code that needs to evict or fetch spool data without depending
 * on the polling loop itself.
 */

// spoolId → { data, fetchedAt }
const spoolCache = new Map();
const SPOOL_CACHE_TTL_MS = 30_000; // 30 seconds

// printerId → { spoolId, fetchedAt }
// Avoids hitting Moonraker's /server/spoolman/spool_id every poll cycle
const activeSpoolIdCache = new Map();
const ACTIVE_SPOOL_ID_TTL_MS = 15_000; // 15 seconds — spool changes are rare

/**
 * Fetch full spool details from Spoolman, with TTL caching.
 *
 * @param {number|string} spoolId
 * @param {string} spoolmanUrl - base Spoolman URL e.g. "http://spoolman:7912"
 * @returns {Promise<object|null>}
 */
async function getSpoolDetails(spoolId, spoolmanUrl) {
  if (!spoolId || !spoolmanUrl) return null;
  const cached = spoolCache.get(spoolId);
  if (cached && Date.now() - cached.fetchedAt < SPOOL_CACHE_TTL_MS) return cached.data;
  try {
    const r = await fetch(`${spoolmanUrl}/api/v1/spool/${spoolId}`, {
      signal: AbortSignal.timeout(5000),
    });
    if (!r.ok) return null;
    const spool = await r.json();
    const data = {
      id: spool.id,
      filament_name: spool.filament?.name ?? '',
      material: spool.filament?.material ?? '',
      color_hex: spool.filament?.color_hex ?? '',
      vendor: spool.filament?.vendor?.name ?? '',
      remaining_weight: Math.round(spool.remaining_weight ?? 0),
      initial_weight: Math.round(spool.initial_weight ?? 0),
    };
    spoolCache.set(spoolId, { data, fetchedAt: Date.now() });
    return data;
  } catch {
    return null;
  }
}

/**
 * Get the active spool ID for a printer, with TTL caching to avoid
 * hitting the printer's API every poll cycle.
 *
 * @param {object} client - Printer client instance (must implement getActiveSpoolId())
 * @param {number} printerId
 * @returns {Promise<number|string|null>}
 */
async function getActiveSpoolId(client, printerId) {
  const cached = activeSpoolIdCache.get(printerId);
  if (cached && Date.now() - cached.fetchedAt < ACTIVE_SPOOL_ID_TTL_MS) {
    return cached.spoolId;
  }
  const spoolId = await client.getActiveSpoolId();
  activeSpoolIdCache.set(printerId, { spoolId, fetchedAt: Date.now() });
  return spoolId;
}

/**
 * Evict entries from the spool and active-spool-ID caches.
 * Call when the active spool changes so the next poll fetches fresh data.
 *
 * @param {number|string|null} spoolId   - spool detail cache key to evict (or null to skip)
 * @param {number|null}        printerId - active-spool-ID cache key to evict (or null to skip)
 */
function clearSpoolCache(spoolId, printerId) {
  if (spoolId != null) spoolCache.delete(spoolId);
  if (printerId != null) activeSpoolIdCache.delete(printerId);
}

module.exports = { getSpoolDetails, getActiveSpoolId, clearSpoolCache };
