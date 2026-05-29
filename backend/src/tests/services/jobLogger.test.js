const { resetDb, getDb } = require('../helpers/db');
const { detectTerminalStatus, logJob } = require('../../services/jobLogger');

beforeEach(() => resetDb());

// ---------------------------------------------------------------------------
// detectTerminalStatus — default firmware (Moonraker / OctoPrint / Duet)
// ---------------------------------------------------------------------------

describe('detectTerminalStatus (default firmware)', () => {
  it('printing → complete = complete', () => {
    expect(detectTerminalStatus('printing', 'complete')).toBe('complete');
  });

  it('printing → cancelled = cancelled', () => {
    expect(detectTerminalStatus('printing', 'cancelled')).toBe('cancelled');
  });

  it('printing → error = error', () => {
    expect(detectTerminalStatus('printing', 'error')).toBe('error');
  });

  it('paused → complete = complete', () => {
    expect(detectTerminalStatus('paused', 'complete')).toBe('complete');
  });

  it('paused → standby = cancelled (cancelled while paused)', () => {
    expect(detectTerminalStatus('paused', 'standby')).toBe('cancelled');
  });

  it('cancelling → standby = cancelled', () => {
    expect(detectTerminalStatus('cancelling', 'standby')).toBe('cancelled');
  });

  it('cancelling → error = error', () => {
    expect(detectTerminalStatus('cancelling', 'error')).toBe('error');
  });

  it('printing → standby with duration+filename = complete (natural finish on Duet etc.)', () => {
    expect(detectTerminalStatus('printing', 'standby', {
      durationAfter: 3600,
      currentFilename: 'benchy.gcode',
    })).toBe('complete');
  });

  it('printing → standby with no duration + no filename = error (firmware restart / crash)', () => {
    expect(detectTerminalStatus('printing', 'standby', {
      durationAfter: 0,
      currentFilename: '',
    })).toBe('error');
  });

  it('standby → printing = null (no terminal transition)', () => {
    expect(detectTerminalStatus('standby', 'printing')).toBeNull();
  });

  it('printing → paused = null (not terminal)', () => {
    expect(detectTerminalStatus('printing', 'paused')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// detectTerminalStatus — Bambu firmware
// ---------------------------------------------------------------------------

describe('detectTerminalStatus (bambu firmware)', () => {
  const opts = { firmware: 'bambu' };

  it('printing → complete = complete', () => {
    expect(detectTerminalStatus('printing', 'complete', opts)).toBe('complete');
  });

  it('printing → error = error', () => {
    expect(detectTerminalStatus('printing', 'error', opts)).toBe('error');
  });

  it('printing → standby = complete (RUNNING→IDLE without FINISH)', () => {
    expect(detectTerminalStatus('printing', 'standby', opts)).toBe('complete');
  });

  it('paused → standby = cancelled', () => {
    expect(detectTerminalStatus('paused', 'standby', opts)).toBe('cancelled');
  });

  it('standby → standby = null', () => {
    expect(detectTerminalStatus('standby', 'standby', opts)).toBeNull();
  });

  it('printing → cancelled = null (Bambu does not emit cancelled state)', () => {
    expect(detectTerminalStatus('printing', 'cancelled', opts)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// logJob
// ---------------------------------------------------------------------------

describe('logJob', () => {
  function insertPrinter() {
    const db = getDb();
    return db.prepare(
      "INSERT INTO printers (name, host, port, firmware_type) VALUES ('Test', 'localhost', 7125, 'moonraker')"
    ).run().lastInsertRowid;
  }

  it('inserts a row and returns the new rowid', () => {
    const db = getDb();
    const printerId = insertPrinter();

    const rowid = logJob(db, {
      printerId,
      filename: 'test.gcode',
      durationS: 120,
      filamentUsedMm: 500,
      spool: null,
      status: 'complete',
      plateId: null,
    });

    expect(typeof rowid).toBe('number');
    expect(rowid).toBeGreaterThan(0);

    const row = db.prepare('SELECT * FROM gcode_print_jobs WHERE id = ?').get(rowid);
    expect(row.filename).toBe('test.gcode');
    expect(row.total_duration_s).toBe(120);
    expect(row.filament_used_mm).toBe(500);
    expect(row.status).toBe('complete');
    expect(row.spool_id).toBeNull();
    expect(row.plate_id).toBeNull();
  });

  it('rounds fractional durationS', () => {
    const db = getDb();
    const printerId = insertPrinter();

    const rowid = logJob(db, {
      printerId,
      filename: 'f.gcode',
      durationS: 99.7,
      filamentUsedMm: 0,
      spool: null,
      status: 'complete',
      plateId: null,
    });

    const row = db.prepare('SELECT total_duration_s FROM gcode_print_jobs WHERE id = ?').get(rowid);
    expect(row.total_duration_s).toBe(100);
  });

  it('stores spool fields when spool is provided', () => {
    const db = getDb();
    const printerId = insertPrinter();

    const spool = {
      id: 42,
      filament_name: 'Prusament PLA',
      material: 'PLA',
      color_hex: 'FF6600',
      vendor: 'Prusa',
    };

    const rowid = logJob(db, {
      printerId,
      filename: 'x.gcode',
      durationS: 60,
      filamentUsedMm: 200,
      spool,
      status: 'complete',
      plateId: null,
    });

    const row = db.prepare('SELECT * FROM gcode_print_jobs WHERE id = ?').get(rowid);
    expect(row.spool_id).toBe(42);
    expect(row.spool_name).toBe('Prusament PLA');
    expect(row.material).toBe('PLA');
    expect(row.color_hex).toBe('FF6600');
    expect(row.vendor).toBe('Prusa');
  });

  it('stores NULL spool fields when spool is null (Bambu case)', () => {
    const db = getDb();
    const printerId = insertPrinter();

    const rowid = logJob(db, {
      printerId,
      filename: 'bambu.gcode',
      durationS: 0,
      filamentUsedMm: 0,
      spool: null,
      status: 'complete',
      plateId: null,
    });

    const row = db.prepare('SELECT * FROM gcode_print_jobs WHERE id = ?').get(rowid);
    expect(row.spool_id).toBeNull();
    expect(row.spool_name).toBeNull();
  });

  function insertPlate(db) {
    db.prepare("INSERT INTO project_templates (name) VALUES ('T')").run();
    const templateId = db.prepare("SELECT id FROM project_templates WHERE name='T'").get().id;
    db.prepare("INSERT INTO projects (name, template_id) VALUES ('P', ?)").run(templateId);
    const projectId = db.prepare("SELECT id FROM projects WHERE name='P'").get().id;
    db.prepare(
      "INSERT INTO project_plates (project_id, filename, display_name, status) VALUES (?, 'p.gcode', 'Plate 1', 'printing')"
    ).run(projectId);
    return db.prepare("SELECT id FROM project_plates WHERE project_id=?").get(projectId).id;
  }

  it('updates project_plates to done when status=complete and plateId is set', () => {
    const db = getDb();
    const printerId = insertPrinter();
    const plateId = insertPlate(db);

    const rowid = logJob(db, {
      printerId,
      filename: 'plate.gcode',
      durationS: 300,
      filamentUsedMm: 1000,
      spool: null,
      status: 'complete',
      plateId,
    });

    const plate = db.prepare('SELECT status, print_job_id FROM project_plates WHERE id = ?').get(plateId);
    expect(plate.status).toBe('done');
    expect(plate.print_job_id).toBe(rowid);
  });

  it('updates project_plates to pending when status=cancelled', () => {
    const db = getDb();
    const printerId = insertPrinter();
    const plateId = insertPlate(db);

    logJob(db, {
      printerId,
      filename: 'cancel.gcode',
      durationS: 60,
      filamentUsedMm: 100,
      spool: null,
      status: 'cancelled',
      plateId,
    });

    const plate = db.prepare('SELECT status FROM project_plates WHERE id = ?').get(plateId);
    expect(plate.status).toBe('pending');
  });

  it('updates project_plates to failed when status=error', () => {
    const db = getDb();
    const printerId = insertPrinter();
    const plateId = insertPlate(db);

    logJob(db, {
      printerId,
      filename: 'error.gcode',
      durationS: 10,
      filamentUsedMm: 50,
      spool: null,
      status: 'error',
      plateId,
    });

    const plate = db.prepare('SELECT status FROM project_plates WHERE id = ?').get(plateId);
    expect(plate.status).toBe('failed');
  });

  it('does not touch project_plates when plateId is null', () => {
    const db = getDb();
    const printerId = insertPrinter();

    // Just verifying no error is thrown and the INSERT succeeds
    expect(() => logJob(db, {
      printerId,
      filename: 'noplates.gcode',
      durationS: 10,
      filamentUsedMm: 0,
      spool: null,
      status: 'complete',
      plateId: null,
    })).not.toThrow();
  });
});
