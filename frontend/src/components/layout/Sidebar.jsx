import { NavLink, useMatch, Link } from 'react-router-dom';
import { usePrinters } from '../../hooks/usePrinters';
import { usePrinterStatus } from '../../contexts/PrinterStatusContext';
import { isEmbedded } from '../../utils/embedded';

// Lucide-style icon wrapper
function Icon({ children, size = 16 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
         stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      {children}
    </svg>
  );
}

const IconPlay        = ({ size }) => <svg width={size || 13} height={size || 13} viewBox="0 0 24 24" fill="currentColor" stroke="none"><path d="M6 4L6 20L20 12Z"/></svg>;
const IconDashboard   = (p) => <Icon {...p}><rect width="7" height="9" x="3" y="3" rx="1"/><rect width="7" height="5" x="14" y="3" rx="1"/><rect width="7" height="9" x="14" y="12" rx="1"/><rect width="7" height="5" x="3" y="16" rx="1"/></Icon>;
const IconFiles       = (p) => <Icon {...p}><path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z"/></Icon>;
const IconSpoolman    = (p) => <Icon {...p}><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="3.5"/><path d="M12 3v6"/><path d="M12 15v6"/><path d="M3 12h6"/><path d="M15 12h6"/></Icon>;
const IconHistory     = (p) => <Icon {...p}><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></Icon>;
const IconMaintenance = (p) => <Icon {...p}><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></Icon>;
const IconSettings    = (p) => <Icon {...p}><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></Icon>;
const IconExtras      = (p) => <Icon {...p}><circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M2 12h3M19 12h3M4.9 19.1l2.1-2.1M17 7l2.1-2.1"/></Icon>;

const embeddedLinks = [
  { to: '/', label: 'Dashboard', icon: '▦', end: true },
  { to: '/files', label: 'Files', icon: '📁', end: true },
  { to: '/files/templates', label: 'Templates', icon: null, end: true },
  { to: '/files/projects', label: 'Projects', icon: null, end: true },
  { to: '/files/archive', label: 'Archive', icon: null, end: true },
  { to: '/spoolman', label: 'Spoolman', icon: '🧵', end: true },
  { to: '/spoolman/filaments', label: 'Filaments', icon: null, end: true },
  { to: '/spoolman/manufacturers', label: 'Manufacturers', icon: null, end: true },
  { to: '/spoolman/inventory', label: 'Inventory', icon: null, end: true },
  { to: '/history', label: 'History', icon: '🕒', end: true },
  { to: '/maintenance', label: 'Maintenance', icon: '🔧', end: true },
  { to: '/settings/printers', label: 'Settings', icon: '⚙', end: false },
  { to: '/extras', label: 'Extras', icon: '✦', end: true },
];

export default function Sidebar({ onNavigate }) {
  const { printers } = usePrinters();
  const { status } = usePrinterStatus();

  const matchRoot    = useMatch({ path: '/', end: true });
  const matchPrinter = useMatch({ path: '/printer/:id', end: false });
  const matchFiles   = useMatch({ path: '/files', end: false });
  const matchSpoolman = useMatch({ path: '/spoolman', end: false });
  const matchSettings = useMatch({ path: '/settings', end: false });

  const onDashboardExact = !!matchRoot;
  const onDashboard = !!(matchRoot || matchPrinter);
  const onFiles = !!matchFiles;
  const onSpoolman = !!matchSpoolman;
  const onSettings = !!matchSettings;

  const onlineCount = Object.values(status).filter(s => s?._online).length;
  const printerCount = printers.length;
  const allOnline = printerCount > 0 && onlineCount === printerCount;
  const pulseColor = printerCount === 0 ? 'var(--text-muted)'
    : allOnline ? 'var(--success)'
    : onlineCount > 0 ? 'var(--warning)'
    : 'var(--danger)';
  const statusLine1 = printerCount === 0 ? 'No printers configured'
    : allOnline ? 'All printers online'
    : `${onlineCount}/${printerCount} printers online`;

  const handleClick = () => { if (onNavigate) onNavigate(); };

  if (isEmbedded) {
    return (
      <nav className="sidebar v-navigation-drawer v-navigation-drawer--fixed v-navigation-drawer--open">
        <div className="v-navigation-drawer__content" style={{ width: '100%' }}>
          <ul className="navi v-list" style={{ listStyle: 'none', padding: 0, margin: 0 }}>
            {embeddedLinks.map(({ to, label, icon, end }) => (
              <li key={to} style={{ width: '100%' }}>
                <NavLink to={to} end={end} className={({ isActive }) =>
                  `sidebar-link nav-link v-list-item v-list-item--link${isActive ? ' active v-list-item--active router-link-active' : ''}`
                }>
                  <span className="sidebar-icon">{icon ?? ''}</span>
                  {label}
                </NavLink>
              </li>
            ))}
          </ul>
        </div>
      </nav>
    );
  }

  return (
    <aside className="sidebar">
      <Link className="sb-cta" to="/files" onClick={handleClick}>
        <IconPlay size={13} />
        Start a print
        <span className="sb-cta-kbd">N</span>
      </Link>

      <div className="sb-scroll">
        {/* Fleet */}
        <div className="sb-section">
          <div className="sb-section-label">
            Fleet
            <span className="sb-section-count">{onlineCount}/{printerCount}</span>
          </div>

          <NavLink
            to="/"
            end
            onClick={handleClick}
            className={() => `sb-item${onDashboardExact ? ' active' : ''}`}
          >
            <span className="sb-icon"><IconDashboard size={16} /></span>
            <span className="sb-label">Dashboard</span>
          </NavLink>

          {onDashboard && printers.filter(p => p.firmware_type !== 'bambu').length > 0 && (
            <div className="sb-sub">
              {printers.filter(p => p.firmware_type !== 'bambu').map(p => {
                const st = status[p.id];
                const online = st?._online;
                const state = online ? (st?.print_stats?.state ?? 'standby') : 'offline';
                return (
                  <NavLink
                    key={p.id}
                    to={`/printer/${p.id}`}
                    className={({ isActive }) => `sb-subitem${isActive ? ' active' : ''}`}
                    onClick={handleClick}
                  >
                    <span className="sb-sub-dot"></span>
                    {p.name}
                    <span style={{
                      marginLeft: 'auto',
                      fontSize: 10,
                      color: state === 'printing' ? 'var(--primary)'
                        : state === 'offline' ? 'var(--text-muted)'
                        : state === 'error' ? 'var(--danger)'
                        : 'var(--success)',
                      fontVariantNumeric: 'tabular-nums',
                    }}>
                      {state}
                    </span>
                  </NavLink>
                );
              })}
            </div>
          )}

          <NavLink
            to="/history"
            onClick={handleClick}
            className={({ isActive }) => `sb-item${isActive ? ' active' : ''}`}
          >
            <span className="sb-icon"><IconHistory size={16} /></span>
            <span className="sb-label">History</span>
          </NavLink>
        </div>

        {/* Library */}
        <div className="sb-section">
          <div className="sb-section-label">Library</div>

          <NavLink
            to="/files"
            onClick={handleClick}
            className={() => `sb-item${onFiles ? ' active' : ''}`}
          >
            <span className="sb-icon"><IconFiles size={16} /></span>
            <span className="sb-label">Files</span>
          </NavLink>
          {onFiles && (
            <div className="sb-sub">
              {[
                { to: '/files', label: 'All files', end: true },
                { to: '/files/templates', label: 'Templates' },
                { to: '/files/projects', label: 'Projects' },
                { to: '/files/archive', label: 'Archive' },
              ].map(({ to, label, end }) => (
                <NavLink
                  key={to}
                  to={to}
                  end={end}
                  className={({ isActive }) => `sb-subitem${isActive ? ' active' : ''}`}
                  onClick={handleClick}
                >
                  <span className="sb-sub-dot"></span>
                  {label}
                </NavLink>
              ))}
            </div>
          )}

          <NavLink
            to="/spoolman"
            onClick={handleClick}
            className={() => `sb-item${onSpoolman ? ' active' : ''}`}
          >
            <span className="sb-icon"><IconSpoolman size={16} /></span>
            <span className="sb-label">Spoolman</span>
          </NavLink>
          {onSpoolman && (
            <div className="sb-sub">
              {[
                { to: '/spoolman', label: 'Spools', end: true },
                { to: '/spoolman/filaments', label: 'Filaments' },
                { to: '/spoolman/manufacturers', label: 'Manufacturers' },
                { to: '/spoolman/inventory', label: 'Inventory' },
                { to: '/spoolman/calibration', label: 'Calibration' },
              ].map(({ to, label, end }) => (
                <NavLink
                  key={to}
                  to={to}
                  end={end}
                  className={({ isActive }) => `sb-subitem${isActive ? ' active' : ''}`}
                  onClick={handleClick}
                >
                  <span className="sb-sub-dot"></span>
                  {label}
                </NavLink>
              ))}
            </div>
          )}
        </div>

        {/* System */}
        <div className="sb-section">
          <div className="sb-section-label">System</div>
          <NavLink to="/maintenance" onClick={handleClick} className={({ isActive }) => `sb-item${isActive ? ' active' : ''}`}>
            <span className="sb-icon"><IconMaintenance size={16} /></span>
            <span className="sb-label">Maintenance</span>
          </NavLink>
          <NavLink to="/extras" onClick={handleClick} className={({ isActive }) => `sb-item${isActive ? ' active' : ''}`}>
            <span className="sb-icon"><IconExtras size={16} /></span>
            <span className="sb-label">Extras</span>
          </NavLink>
          <NavLink to="/settings/printers" onClick={handleClick} className={() => `sb-item${onSettings ? ' active' : ''}`}>
            <span className="sb-icon"><IconSettings size={16} /></span>
            <span className="sb-label">Settings</span>
          </NavLink>
          {onSettings && (
            <div className="sb-sub">
              {[
                { to: '/settings/printers', label: 'Printers' },
                { to: '/settings/connections', label: 'Connections' },
                { to: '/settings/spoolman', label: 'Spoolman' },
                { to: '/settings/scale', label: 'Scale' },
                { to: '/settings/projects', label: 'Projects' },
                { to: '/settings/backup', label: 'Backup & Restore' },
                { to: '/settings/integrations', label: 'Integrations' },
                { to: '/settings/github', label: 'GitHub' },
                { to: '/settings/setup', label: 'Setup' },
                { to: '/settings/updates', label: 'Updates' },
              ].map(({ to, label }) => (
                <NavLink
                  key={to}
                  to={to}
                  className={({ isActive }) => `sb-subitem${isActive ? ' active' : ''}`}
                  onClick={handleClick}
                >
                  <span className="sb-sub-dot"></span>
                  {label}
                </NavLink>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="sb-foot">
        <div className="sb-status">
          <span className="sb-pulse" style={{ '--sb-pulse-color': pulseColor }}></span>
          <div className="sb-status-text">
            <div className="sb-status-line1">{statusLine1}</div>
            <div className="sb-status-line2">Polling every 3s</div>
          </div>
        </div>
      </div>
    </aside>
  );
}
