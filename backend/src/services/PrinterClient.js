/**
 * Abstract base class for printer firmware clients.
 *
 * All four clients (MoonrakerClient, OctoPrintClient, DuetClient, BambuClient)
 * extend this class.  Stubs throw so that adding a new firmware type surfaces
 * missing methods immediately rather than silently returning undefined.
 *
 * To add a new firmware type:
 *   1. Create a class that extends PrinterClient in services/
 *   2. Override every method your firmware supports
 *   3. Override the `capabilities` getter to reflect what it supports
 *   4. Register it in clientFactory.js
 */
class PrinterClient {
  constructor(printer) {
    this.printer = printer;
  }

  /**
   * Feature flags for this firmware type.
   * Routes use these to skip operations the firmware doesn't support.
   *
   * @returns {{ hasQueue: boolean, hasMacros: boolean, hasAMS: boolean, hasSpoolman: boolean, hasWebcams: boolean }}
   */
  get capabilities() {
    return {
      hasQueue: false,
      hasMacros: false,
      hasAMS: false,
      hasSpoolman: false,
      hasWebcams: false,
    };
  }

  async getStatus()            { throw new Error(`${this.constructor.name}.getStatus() not implemented`); }
  async startPrint(filename)   { throw new Error(`${this.constructor.name}.startPrint() not implemented`); }
  async pausePrint()           { throw new Error(`${this.constructor.name}.pausePrint() not implemented`); }
  async resumePrint()          { throw new Error(`${this.constructor.name}.resumePrint() not implemented`); }
  async cancelPrint()          { throw new Error(`${this.constructor.name}.cancelPrint() not implemented`); }
  async sendGcode(script)      { throw new Error(`${this.constructor.name}.sendGcode() not implemented`); }
  async uploadFile(filename, buffer) { throw new Error(`${this.constructor.name}.uploadFile() not implemented`); }
  async getQueue()             { throw new Error(`${this.constructor.name}.getQueue() not implemented`); }
  async addToQueue(filenames)  { throw new Error(`${this.constructor.name}.addToQueue() not implemented`); }
  async removeFromQueue(jobIds){ throw new Error(`${this.constructor.name}.removeFromQueue() not implemented`); }
  async startQueue()           { throw new Error(`${this.constructor.name}.startQueue() not implemented`); }
  async getMacros()            { throw new Error(`${this.constructor.name}.getMacros() not implemented`); }
  async getWebcams()           { throw new Error(`${this.constructor.name}.getWebcams() not implemented`); }
  async getActiveSpoolId()     { throw new Error(`${this.constructor.name}.getActiveSpoolId() not implemented`); }
}

module.exports = PrinterClient;
