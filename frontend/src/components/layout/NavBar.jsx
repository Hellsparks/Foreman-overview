import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import ThemePicker from './ThemePicker';
import GitHubLinks from './GitHubLinks';
import UpdateNotification from './UpdateNotification';
import BugReportDialog from './BugReportDialog';
import { useUpdateCheck } from '../../hooks/useUpdateCheck';
import { useFiles } from '../../hooks/useFiles';
import { usePrinters } from '../../hooks/usePrinters';

function ForemanMark({ size = 16 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40"
         fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="square" strokeLinejoin="miter">
      <path d="M7 11 L7 5 L18 5"/>
      <path d="M33 11 L33 5 L22 5"/>
      <path d="M7 29 L7 35 L18 35"/>
      <path d="M33 29 L33 35 L22 35"/>
      <line x1="13" y1="20" x2="27" y2="20" strokeWidth="4"/>
    </svg>
  );
}

function buildSpoolmanResults(q, spoolmanSpools, spoolmanFilaments, spoolmanVendors, navigate) {
  const out = [];
  const seenFilamentIds = new Set();
  const matchingSpools = spoolmanSpools.filter(s => {
    const f = s.filament || {};
    return (f.name || '').toLowerCase().includes(q) ||
      (f.material || '').toLowerCase().includes(q) ||
      (f.vendor?.name || '').toLowerCase().includes(q);
  });
  for (const s of matchingSpools) {
    const f = s.filament || {};
    if (!seenFilamentIds.has(f.id)) {
      seenFilamentIds.add(f.id);
      out.push({ key: `filament-${f.id}`, label: f.name || `Filament #${f.id}`, meta: 'Filament', action: () => navigate('/spoolman/filaments', { state: { filamentId: f.id } }) });
    }
    out.push({ key: `spool-${s.id}`, label: `${f.name || `Spool #${s.id}`}${s.remaining_weight != null ? ` · ${Math.round(s.remaining_weight)}g` : ''}`, meta: 'Spool', action: () => navigate('/spoolman', { state: { spoolId: s.id } }) });
  }
  spoolmanFilaments
    .filter(f => !seenFilamentIds.has(f.id) && ((f.name || '').toLowerCase().includes(q) || (f.material || '').toLowerCase().includes(q) || (f.vendor?.name || '').toLowerCase().includes(q)))
    .slice(0, 3)
    .forEach(f => out.push({ key: `filament-cat-${f.id}`, label: f.name, meta: 'Filament', action: () => navigate('/spoolman/filaments', { state: { filamentId: f.id } }) }));
  spoolmanVendors
    .filter(v => (v.name || '').toLowerCase().includes(q))
    .slice(0, 3)
    .forEach(v => out.push({ key: `vendor-${v.id}`, label: v.name, meta: 'Manufacturer', action: () => navigate('/spoolman/manufacturers', { state: { vendorId: v.id } }) }));
  return out.slice(0, 8);
}

function SearchBar() {
  const navigate = useNavigate();
  const { files } = useFiles();
  const { printers } = usePrinters();
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [activeIdx, setActiveIdx] = useState(0);
  const inputRef = useRef(null);
  const wrapRef = useRef(null);
  const [spoolmanSpools, setSpoolmanSpools] = useState([]);
  const [spoolmanFilaments, setSpoolmanFilaments] = useState([]);
  const [spoolmanVendors, setSpoolmanVendors] = useState([]);

  useEffect(() => {
    fetch('/api/spoolman/spools').then(r => r.ok ? r.json() : []).then(d => setSpoolmanSpools(Array.isArray(d) ? d.filter(s => !s.archived) : [])).catch(() => {});
    fetch('/api/spoolman/filaments').then(r => r.ok ? r.json() : []).then(d => setSpoolmanFilaments(Array.isArray(d) ? d : [])).catch(() => {});
    fetch('/api/spoolman/vendors').then(r => r.ok ? r.json() : []).then(d => setSpoolmanVendors(Array.isArray(d) ? d : [])).catch(() => {});
  }, []);

  // ⌘K / Ctrl+K focuses the search input
  useEffect(() => {
    const handler = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        inputRef.current?.focus();
        inputRef.current?.select();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const q = query.trim().toLowerCase();

  const results = q.length < 1 ? [] : [
    ...printers
      .filter(p => p.name.toLowerCase().includes(q))
      .slice(0, 4)
      .map(p => ({
        key: `printer-${p.id}`,
        label: p.name,
        meta: 'Printer',
        action: () => navigate(`/printer/${p.id}`),
      })),
    ...files
      .filter(f => (f.display_name || f.filename).toLowerCase().includes(q))
      .slice(0, 6)
      .map(f => ({
        key: `file-${f.id}`,
        label: f.display_name || f.filename,
        meta: 'File',
        action: () => navigate('/files', { state: { fileId: f.id, folderId: f.folder_id ?? null } }),
      })),
    ...buildSpoolmanResults(q, spoolmanSpools, spoolmanFilaments, spoolmanVendors, navigate),
  ];

  const commit = (item) => {
    item.action();
    setQuery('');
    setOpen(false);
    inputRef.current?.blur();
  };

  const onKeyDown = (e) => {
    if (!open || results.length === 0) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); setActiveIdx(i => Math.min(i + 1, results.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActiveIdx(i => Math.max(i - 1, 0)); }
    else if (e.key === 'Enter') { e.preventDefault(); commit(results[activeIdx]); }
    else if (e.key === 'Escape') { setOpen(false); inputRef.current?.blur(); }
  };

  const handleChange = (e) => {
    setQuery(e.target.value);
    setOpen(true);
    setActiveIdx(0);
  };

  return (
    <div ref={wrapRef} style={{ position: 'relative' }}>
      <label className="search">
        <span className="search-icon">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>
          </svg>
        </span>
        <input
          ref={inputRef}
          type="search"
          name="foreman-search"
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
          spellCheck="false"
          placeholder="Search files, printers…"
          value={query}
          onChange={handleChange}
          onFocus={() => { if (q) setOpen(true); }}
          onKeyDown={onKeyDown}
        />
        <kbd>⌘ K</kbd>
      </label>

      {open && results.length > 0 && (
        <div style={{
          position: 'absolute',
          top: 'calc(100% + 6px)',
          left: 0,
          right: 0,
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius)',
          boxShadow: 'var(--shadow)',
          zIndex: 9999,
          overflow: 'hidden',
        }}>
          {results.map((item, idx) => (
            <div
              key={item.key}
              onMouseDown={(e) => { e.preventDefault(); commit(item); }}
              onMouseEnter={() => setActiveIdx(idx)}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '9px 14px',
                cursor: 'pointer',
                background: idx === activeIdx ? 'var(--surface2)' : 'transparent',
                borderBottom: idx < results.length - 1 ? '1px solid var(--border)' : 'none',
                fontSize: '13px',
              }}
            >
              <span style={{ fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.label}</span>
              <span style={{ fontSize: '11px', color: 'var(--text-muted)', flexShrink: 0, marginLeft: '12px', textTransform: 'uppercase', letterSpacing: '.05em', fontWeight: 600 }}>{item.meta}</span>
            </div>
          ))}
        </div>
      )}

      {open && q.length > 0 && results.length === 0 && (
        <div style={{
          position: 'absolute',
          top: 'calc(100% + 6px)',
          left: 0,
          right: 0,
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius)',
          boxShadow: 'var(--shadow)',
          zIndex: 9999,
          padding: '12px 14px',
          fontSize: '13px',
          color: 'var(--text-muted)',
        }}>
          No results for "{query}"
        </div>
      )}
    </div>
  );
}

export default function NavBar({ isMobile, onMenuToggle }) {
  const { updateInfo, dismiss } = useUpdateCheck();
  const [showBugReport, setShowBugReport] = useState(false);

  if (isMobile) {
    return (
      <header className="navbar navbar--mobile">
        <button className="mobile-hamburger" onClick={onMenuToggle} aria-label="Menu">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="3" y1="6" x2="21" y2="6"/>
            <line x1="3" y1="12" x2="21" y2="12"/>
            <line x1="3" y1="18" x2="21" y2="18"/>
          </svg>
        </button>
        <div className="brand">
          <div className="brand-mark"><ForemanMark size={16} /></div>
          <span className="brand-name">Foreman</span>
        </div>
        <div className="navbar-right">
          <UpdateNotification updateInfo={updateInfo} onDismiss={dismiss} />
        </div>
        {showBugReport && <BugReportDialog onClose={() => setShowBugReport(false)} />}
      </header>
    );
  }

  return (
    <header className="navbar">
      <div className="brand">
        <div className="brand-mark"><ForemanMark size={16} /></div>
        <span className="brand-name">Foreman</span>
      </div>

      <SearchBar />

      <div className="navbar-right">
        <UpdateNotification updateInfo={updateInfo} onDismiss={dismiss} />
        <ThemePicker />
        <button
          className="btn-icon"
          onClick={() => setShowBugReport(true)}
          title="Report a bug or request a feature"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect width="8" height="14" x="8" y="6" rx="4"/>
            <path d="m19 7-3 2"/><path d="m5 7 3 2"/>
            <path d="m19 19-3-2"/><path d="m5 19 3-2"/>
            <path d="M20 13h-4"/><path d="M4 13h4"/>
            <path d="m10 4 1 2"/><path d="m14 4-1 2"/>
          </svg>
        </button>
        <GitHubLinks />
      </div>

      {showBugReport && <BugReportDialog onClose={() => setShowBugReport(false)} />}
    </header>
  );
}
