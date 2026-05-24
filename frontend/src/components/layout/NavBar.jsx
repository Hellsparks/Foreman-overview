import { useState } from 'react';
import ThemePicker from './ThemePicker';
import GitHubLinks from './GitHubLinks';
import UpdateNotification from './UpdateNotification';
import BugReportDialog from './BugReportDialog';
import { useUpdateCheck } from '../../hooks/useUpdateCheck';

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

export default function NavBar({ isMobile, onMenuToggle }) {
  const { updateInfo, dismiss } = useUpdateCheck();
  const [showBugReport, setShowBugReport] = useState(false);
  const [query, setQuery] = useState('');

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

      <label className="search">
        <span className="search-icon">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>
          </svg>
        </span>
        <input
          type="text"
          placeholder="Search files, printers, spools…"
          value={query}
          onChange={e => setQuery(e.target.value)}
        />
        <kbd>⌘ K</kbd>
      </label>

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
