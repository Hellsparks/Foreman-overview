const STATE_LABELS = {
  printing: 'Printing',
  paused:   'Paused',
  standby:  'Idle',
  error:    'Error',
  offline:  'Offline',
  complete: 'Complete',
};

export default function StatusBadge({ state, live = false }) {
  const label = STATE_LABELS[state] || state;
  const cls = `chip chip--filled chip--${state}${live ? ' chip--live' : ''}`;
  return (
    <span className={cls}>
      {live && <span className="chip-dot"></span>}
      {label}
    </span>
  );
}
