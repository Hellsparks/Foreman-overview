const { getSpoolDetails, getActiveSpoolId, clearSpoolCache } = require('../../services/spoolCache');

// ---------------------------------------------------------------------------
// getSpoolDetails — TTL caching
// ---------------------------------------------------------------------------

describe('getSpoolDetails', () => {
  it('returns null when spoolId is falsy', async () => {
    expect(await getSpoolDetails(null, 'http://spoolman:7912')).toBeNull();
    expect(await getSpoolDetails(undefined, 'http://spoolman:7912')).toBeNull();
    expect(await getSpoolDetails(0, 'http://spoolman:7912')).toBeNull();
  });

  it('returns null when spoolmanUrl is falsy', async () => {
    expect(await getSpoolDetails(1, '')).toBeNull();
    expect(await getSpoolDetails(1, null)).toBeNull();
  });

  it('returns null when fetch fails', async () => {
    // Non-existent host → fetch throws / network error
    const result = await getSpoolDetails(1, 'http://127.0.0.1:19999');
    expect(result).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// clearSpoolCache — eviction
// ---------------------------------------------------------------------------

describe('clearSpoolCache', () => {
  it('does not throw when called with nulls', () => {
    expect(() => clearSpoolCache(null, null)).not.toThrow();
  });

  it('does not throw when called with valid ids', () => {
    expect(() => clearSpoolCache(42, 7)).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// getActiveSpoolId — delegates to client and caches
// ---------------------------------------------------------------------------

describe('getActiveSpoolId', () => {
  it('calls client.getActiveSpoolId() and returns the result', async () => {
    let callCount = 0;
    const mockClient = {
      async getActiveSpoolId() {
        callCount++;
        return 99;
      },
    };

    // Use a unique printerId to avoid cross-test cache collision
    const printerId = Math.floor(Math.random() * 1e9);
    const id = await getActiveSpoolId(mockClient, printerId);

    expect(id).toBe(99);
    expect(callCount).toBe(1);
  });

  it('returns cached value on second call within TTL', async () => {
    let callCount = 0;
    const mockClient = {
      async getActiveSpoolId() {
        callCount++;
        return 55;
      },
    };

    const printerId = Math.floor(Math.random() * 1e9);
    await getActiveSpoolId(mockClient, printerId);
    const second = await getActiveSpoolId(mockClient, printerId);

    expect(second).toBe(55);
    expect(callCount).toBe(1); // only fetched once
  });

  it('re-fetches after clearSpoolCache evicts the active-spool entry', async () => {
    let callCount = 0;
    const mockClient = {
      async getActiveSpoolId() {
        callCount++;
        return 77;
      },
    };

    const printerId = Math.floor(Math.random() * 1e9);
    await getActiveSpoolId(mockClient, printerId);
    clearSpoolCache(null, printerId); // evict just the active-spool entry
    await getActiveSpoolId(mockClient, printerId);

    expect(callCount).toBe(2);
  });
});
