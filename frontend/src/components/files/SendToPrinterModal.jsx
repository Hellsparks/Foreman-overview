import { useState, useEffect } from 'react';
import { usePrinters } from '../../hooks/usePrinters';
import { useStatus } from '../../hooks/useStatus';
import { sendFile } from '../../api/files';
import { checkCompatibility } from '../../api/presets';
import { getSpools, setActiveSpool } from '../../api/spoolman';
import { useFilamentGuard } from '../../hooks/useFilamentGuard';

function hl(text, q) {
  if (!q || !text) return text;
  const i = text.toLowerCase().indexOf(q.toLowerCase());
  if (i === -1) return text;
  return <>{text.slice(0, i)}<mark className="inv-match">{text.slice(i, i + q.length)}</mark>{text.slice(i + q.length)}</>;
}

export default function SendToPrinterModal({ file, onClose }) {
  const { printers } = usePrinters();
  const { status: statuses } = useStatus();
  const [printerId, setPrinterId] = useState('');
  const [action, setAction] = useState('upload');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [compat, setCompat] = useState(null);
  const [checkingCompat, setCheckingCompat] = useState(false);

  const [spools, setSpools] = useState([]);
  const [spoolsLoaded, setSpoolsLoaded] = useState(false);
  const [spoolAction, setSpoolAction] = useState('ignore'); // 'ignore', 'clear', 'active', or spool.id
  const [spoolSearch, setSpoolSearch] = useState('');

  const { startGuard, renderGuardDialog } = useFilamentGuard({
    onConfirm: async (spool, printer, _trayId, act) => {
      setBusy(true);
      setError(null);
      try {
        // Pre-print spool Hook (using the confirmed spoolAction)
        if (act === 'clear') {
          await setActiveSpool(printer.id, null);
        } else if (typeof act === 'number') {
          await setActiveSpool(printer.id, spool.id);
        }

        await sendFile(file.id, printer.id, {
          autoStart: action === 'start',
          addToQueue: action === 'queue',
        });
        onClose?.();
      } catch (e) {
        setError(e.message);
      } finally {
        setBusy(false);
      }
    }
  });

  // Run compatibility check when printer is selected
  useEffect(() => {
    if (!printerId) { setCompat(null); return; }
    let cancelled = false;
    setCheckingCompat(true);
    checkCompatibility(file.id, printerId)
      .then(result => { if (!cancelled) setCompat(result); })
      .catch(() => { if (!cancelled) setCompat(null); })
      .finally(() => { if (!cancelled) setCheckingCompat(false); });

    // Fetch spools when a printer is first selected (if not already fetched)
    if (!spoolsLoaded) {
      getSpools()
        .then(data => { if (!cancelled) { setSpools(data || []); setSpoolsLoaded(true); } })
        .catch(() => { });
    }

    // Reset spool action when changing printer
    setSpoolAction('ignore');

    return () => { cancelled = true; };
  }, [printerId, file.id, spoolsLoaded]);

  async function handleSend() {
    if (!printerId) return;

    // If we're setting a new spool, pass it through the guard
    if (typeof spoolAction === 'number') {
      const spool = spools.find(s => s.id === spoolAction);
      if (spool) {
        startGuard(spool, printerId, undefined, spoolAction);
        return;
      }
    }

    // If no spool is being explicitly assigned (ignore, clear, active), proceed directly
    setBusy(true);
    setError(null);
    try {
      if (spoolAction === 'clear') {
        await setActiveSpool(printerId, null);
      }

      await sendFile(file.id, printerId, {
        autoStart: action === 'start',
        addToQueue: action === 'queue',
      });
      onClose?.();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  const hasErrors = compat?.warnings?.some(w => w.severity === 'error');
  const hasWarnings = compat?.warnings?.some(w => w.severity === 'warning');

  const status = statuses[printerId];
  const activeSpool = status?._active_spool;

  // Filter spools to only show ones matching the file's material
  const targetMaterial = (file.filament_type || '').toUpperCase();
  const compatibleSpools = spools.filter(s =>
    s.filament?.material?.toUpperCase() === targetMaterial && s.remaining_weight > 0
  ).sort((a, b) => b.remaining_weight - a.remaining_weight); // sort with most remaining first

  const q = spoolSearch.trim().toLowerCase();
  const filteredSpools = q
    ? compatibleSpools.filter(s =>
        (s.filament?.name || '').toLowerCase().includes(q) ||
        (s.filament?.vendor?.name || '').toLowerCase().includes(q) ||
        (s.filament?.color_hex || '').toLowerCase().includes(q)
      )
    : compatibleSpools;

  return (
    <div className="dialog-overlay" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className={`dialog ${printerId ? 'dialog-expanded' : ''}`}>
        <div className={printerId ? 'dialog-split-pane' : ''}>

          <div className="dialog-left">
            <h2>Send to Printer</h2>
            <p className="dialog-filename">{file.display_name}</p>

            {/* File metadata summary */}
            {(file.filament_type || file.max_z != null) && (
              <div className="compat-file-info">
                {file.filament_type && <span className={`badge badge-filament filament-${file.filament_type}`}>{file.filament_type}</span>}
                {file.max_z != null && (
                  <span className="text-muted" style={{ fontSize: '0.85em' }}>
                    Height: {(file.max_z - (file.min_z || 0)).toFixed(1)}mm
                  </span>
                )}
              </div>
            )}

            <label className="form-label">
              Printer
              <select
                className="form-select"
                value={printerId}
                onChange={e => setPrinterId(e.target.value)}
              >
                <option value="">Select printer…</option>
                {printers.map(p => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                    {p.bed_width ? ` (${p.bed_width}×${p.bed_depth}mm)` : ''}
                  </option>
                ))}
              </select>
            </label>

            {/* Compatibility check results */}
            {checkingCompat && <p className="compat-checking">Checking compatibility…</p>}
            {compat && compat.warnings.length > 0 && (
              <div className="compat-warnings">
                {compat.warnings.map((w, i) => (
                  <div key={i} className={`compat-warning compat-${w.severity}`}>
                    <span className="compat-icon">
                      {w.severity === 'error'
                        ? <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="4.9" y1="4.9" x2="19.1" y2="19.1"/></svg>
                        : w.severity === 'warning'
                          ? <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
                          : <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                      }
                    </span>
                    {w.message}
                  </div>
                ))}
              </div>
            )}
            {compat && compat.warnings.length === 0 && (
              <div className="compat-warning compat-ok">
                <span className="compat-icon">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
                </span>
                File is compatible with this printer
              </div>
            )}

            <fieldset className="form-fieldset">
              <legend>After upload</legend>
              {[
                { value: 'upload', label: 'Upload only' },
                { value: 'queue', label: 'Add to print queue' },
                { value: 'start', label: 'Start printing immediately' },
              ].map(opt => (
                <label key={opt.value} className="radio-label">
                  <input
                    type="radio"
                    name="action"
                    value={opt.value}
                    checked={action === opt.value}
                    onChange={() => setAction(opt.value)}
                  />
                  {opt.label}
                </label>
              ))}
            </fieldset>

            {error && <p className="form-error">{error}</p>}

            <div className="dialog-actions">
              <button
                className={`btn ${hasErrors ? 'btn-danger' : 'btn-primary'}`}
                onClick={handleSend}
                disabled={!printerId || busy}
              >
                {busy ? 'Sending…' : hasErrors ? 'Send Anyway (Size Mismatch)' : 'Send'}
              </button>
              <button className="btn" onClick={onClose}>Cancel</button>
            </div>
          </div>

          {printerId && (
            <div className="dialog-right">
              <div className="dialog-right-title">Spool Selection</div>
              <p className="text-muted" style={{ fontSize: '13px', marginBottom: '16px' }}>
                Choose which filament spool to use for this print, or ignore Spoolman tracking.
              </p>

              <div className="mini-spools-list">
                <button
                  className={`spool-action-btn ${spoolAction === 'ignore' ? 'selected' : ''}`}
                  onClick={() => setSpoolAction('ignore')}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="8" y1="12" x2="16" y2="12"/></svg>
                  Ignore Spool Tracking
                </button>
                <button
                  className={`spool-action-btn ${spoolAction === 'clear' ? 'selected' : ''}`}
                  onClick={() => setSpoolAction('clear')}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>
                  Clear Active Spool
                </button>
                <button
                  className={`spool-action-btn ${spoolAction === 'active' ? 'selected' : ''}`}
                  onClick={() => setSpoolAction('active')}
                  disabled={!activeSpool}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 12a9 9 0 0 1 15.5-6.3L21 8"/><polyline points="21 3 21 8 16 8"/><path d="M21 12a9 9 0 0 1-15.5 6.3L3 16"/><polyline points="3 21 3 16 8 16"/></svg>
                  Use Currently Active Spool {activeSpool ? `(${activeSpool.filament_name})` : '(None active)'}
                </button>

                {targetMaterial && (
                  <>
                    <div style={{ marginTop: '12px', marginBottom: '6px', fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)' }}>
                      COMPATIBLE INVENTORY ({targetMaterial})
                    </div>

                    <label className="inv-search">
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, color: 'var(--text-muted)' }}><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
                      <input
                        type="text"
                        placeholder="Search filament, vendor, colour…"
                        value={spoolSearch}
                        onChange={e => setSpoolSearch(e.target.value)}
                      />
                      {spoolSearch && (
                        <button className="inv-search-clear" onClick={() => setSpoolSearch('')}>
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                        </button>
                      )}
                    </label>

                    <span className="inv-count">{filteredSpools.length} of {compatibleSpools.length}</span>

                    <div className="inv-scroll">
                      {filteredSpools.map(spool => {
                        const isActive = activeSpool?.id === spool.id;
                        return (
                          <div
                            key={spool.id}
                            className={`mini-spool-card ${spoolAction === spool.id ? 'selected' : ''} ${isActive && spoolAction !== spool.id ? 'active-spool-marker' : ''}`}
                            onClick={() => setSpoolAction(spool.id)}
                          >
                            <div className="spool-color-dot" style={{ '--spool-color': `#${spool.filament?.color_hex || '888'}` }}></div>
                            <div className="mini-spool-info">
                              <div className="mini-spool-name">{hl(spool.filament?.name || 'Unnamed Filament', q)}</div>
                              <div className="mini-spool-vendor">{hl(spool.filament?.vendor?.name || 'Unknown Vendor', q)}</div>
                            </div>
                            <div className="mini-spool-weight">
                              {spool.remaining_weight ? `${Math.round(spool.remaining_weight)}g` : '?'}
                            </div>
                            {isActive && <span className="inv-loaded-badge">Loaded</span>}
                          </div>
                        );
                      })}

                      {compatibleSpools.length === 0 && (
                        <p className="text-muted" style={{ fontSize: '12px', textAlign: 'center', padding: '12px 0' }}>
                          No spools matching '{targetMaterial}' found in Spoolman with weight remaining.
                        </p>
                      )}
                      {compatibleSpools.length > 0 && filteredSpools.length === 0 && (
                        <p className="text-muted" style={{ fontSize: '12px', textAlign: 'center', padding: '12px 0' }}>
                          No spools match "{spoolSearch}"
                        </p>
                      )}
                    </div>
                  </>
                )}
              </div>
            </div>
          )}

        </div> {/* end of split-pane wrapper */}
        {renderGuardDialog()}
      </div>
    </div>
  );
}
