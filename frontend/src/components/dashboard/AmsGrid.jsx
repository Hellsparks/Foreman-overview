// Renders one or more AMS units as slot tiles.
// Adapts size variant based on total slot count:
//   ≤4  → default (full detail)
//   5–9 → slot--md (drops vendor)
//   >9  → slot--sm (just swatch + material + bar)
export default function AmsGrid({ units = [], trayNow = '255' }) {
  const activeIdx = parseInt(trayNow, 10);

  const totalSlots = units.reduce((sum, u) => sum + (u.tray?.length ?? 0), 0);
  const sizeClass = totalSlots > 9 ? 'slot--sm' : totalSlots > 4 ? 'slot--md' : '';
  const gridClass = totalSlots > 4 ? (totalSlots > 9 ? 'ams-grid-9' : 'ams-grid-5') : 'ams-grid-4';

  const activeTray = units.flatMap(u => u.tray ?? []).find(t => parseInt(t.id, 10) === activeIdx);

  return (
    <div className="ams-block">
      <div className="ams-block-head">
        <span>AMS{units.length > 1 ? ` · ${units.length} units` : ''}</span>
        {activeTray && (
          <span className="ams-block-active">
            <span className="arrow">→</span>
            Slot {activeIdx + 1} · {activeTray.tray_type || ''}
          </span>
        )}
      </div>
      <div className="ams-card-body">
        {units.map((unit, ui) => {
          const trays = unit.tray ?? [];
          const slotCount = trays.length;
          const unitGrid = slotCount > 4 ? 'ams-grid-5' : gridClass;
          const showLabel = units.length > 1;
          return (
            <div key={ui} className="ams-unit">
              {showLabel && (
                <div className="ams-unit-label">Unit {ui + 1}</div>
              )}
              <div className={unitGrid}>
                {trays.map(tray => {
                  const i = parseInt(tray.id, 10);
                  const hasFilament = !!tray.tray_color;
                  const color = hasFilament ? `#${tray.tray_color.slice(0, 6)}` : null;
                  const material = tray.tray_type || '';
                  const remain = tray.remain ?? -1;
                  const isActive = i === activeIdx;

                  if (!hasFilament) {
                    return (
                      <div key={i} className={`slot empty${sizeClass ? ' ' + sizeClass : ''}`} title={`Slot ${i + 1}: Empty`}>
                        <span className="slot-num">{i + 1}</span>
                        <div className="slot-head">
                          <span className="slot-sw"></span>
                          <span className="slot-mat">Empty</span>
                        </div>
                      </div>
                    );
                  }
                  return (
                    <div key={i}
                      className={`slot${isActive ? ' active' : ''}${sizeClass ? ' ' + sizeClass : ''}`}
                      title={`${material}${remain >= 0 ? ` — ${remain}%` : ''}`}
                    >
                      <span className="slot-num">{i + 1}</span>
                      <div className="slot-head">
                        <span className="slot-sw" style={{ background: color }}></span>
                        <span className="slot-mat">{material}</span>
                      </div>
                      {remain >= 0 && (
                        <div className="slot-bar-row">
                          <div className="slot-bar">
                            <div className="slot-bar-fill" style={{ width: `${remain}%`, background: color }}></div>
                          </div>
                          <span className="slot-mass">{remain}%</span>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
