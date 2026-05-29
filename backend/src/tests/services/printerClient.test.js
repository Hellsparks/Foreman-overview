const PrinterClient = require('../../services/PrinterClient');
const MoonrakerClient = require('../../services/moonraker');
const OctoPrintClient = require('../../services/octoprint');
const DuetClient = require('../../services/duet');
const BambuClient = require('../../services/bambu');

const STUB_PRINTER = { id: 1, host: '192.168.1.1', port: 7125, api_key: null, firmware_type: 'moonraker' };

// ---------------------------------------------------------------------------
// Base class stubs
// ---------------------------------------------------------------------------

describe('PrinterClient base class', () => {
  it('calling a stub method throws a descriptive error', async () => {
    const client = new PrinterClient(STUB_PRINTER);
    await expect(client.getStatus()).rejects.toThrow('PrinterClient.getStatus() not implemented');
  });

  it('stub error message includes the subclass name when overridden', async () => {
    class MyFirmware extends PrinterClient {}
    const client = new MyFirmware(STUB_PRINTER);
    await expect(client.startPrint('test.gcode')).rejects.toThrow('MyFirmware.startPrint() not implemented');
  });

  it('default capabilities are all false', () => {
    const client = new PrinterClient(STUB_PRINTER);
    const caps = client.capabilities;
    expect(caps.hasQueue).toBe(false);
    expect(caps.hasMacros).toBe(false);
    expect(caps.hasAMS).toBe(false);
    expect(caps.hasSpoolman).toBe(false);
    expect(caps.hasWebcams).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// instanceof checks
// ---------------------------------------------------------------------------

describe('Printer clients are instances of PrinterClient', () => {
  it('MoonrakerClient instanceof PrinterClient', () => {
    const c = new MoonrakerClient(STUB_PRINTER);
    expect(c).toBeInstanceOf(PrinterClient);
  });

  it('OctoPrintClient instanceof PrinterClient', () => {
    const c = new OctoPrintClient(STUB_PRINTER);
    expect(c).toBeInstanceOf(PrinterClient);
  });

  it('DuetClient instanceof PrinterClient', () => {
    const c = new DuetClient(STUB_PRINTER);
    expect(c).toBeInstanceOf(PrinterClient);
  });

  it('BambuClient instanceof PrinterClient', () => {
    const c = new BambuClient(STUB_PRINTER);
    expect(c).toBeInstanceOf(PrinterClient);
  });
});

// ---------------------------------------------------------------------------
// Capabilities
// ---------------------------------------------------------------------------

describe('capabilities', () => {
  it('Moonraker has queue, macros, spoolman, webcams', () => {
    const caps = new MoonrakerClient(STUB_PRINTER).capabilities;
    expect(caps.hasQueue).toBe(true);
    expect(caps.hasMacros).toBe(true);
    expect(caps.hasSpoolman).toBe(true);
    expect(caps.hasWebcams).toBe(true);
    expect(caps.hasAMS).toBe(false);
  });

  it('Bambu has AMS, not queue or macros', () => {
    const caps = new BambuClient(STUB_PRINTER).capabilities;
    expect(caps.hasAMS).toBe(true);
    expect(caps.hasQueue).toBe(false);
    expect(caps.hasMacros).toBe(false);
  });

  it('OctoPrint has no extended capabilities', () => {
    const caps = new OctoPrintClient(STUB_PRINTER).capabilities;
    expect(Object.values(caps).every(v => v === false)).toBe(true);
  });

  it('Duet has no extended capabilities', () => {
    const caps = new DuetClient(STUB_PRINTER).capabilities;
    expect(Object.values(caps).every(v => v === false)).toBe(true);
  });
});
