import { createContext, useContext, useState, useEffect } from 'react';
import { getAllStatus } from '../api/status';

const PrinterStatusContext = createContext({ status: {}, error: null });

export function PrinterStatusProvider({ children, intervalMs = 3000 }) {
  const [status, setStatus] = useState({});
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;

    async function poll() {
      try {
        const data = await getAllStatus();
        if (!cancelled) {
          setStatus(data.printers);
          setError(null);
        }
      } catch (e) {
        if (!cancelled) setError(e.message);
      }
    }

    poll();
    const timer = setInterval(poll, intervalMs);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [intervalMs]);

  return (
    <PrinterStatusContext.Provider value={{ status, error }}>
      {children}
    </PrinterStatusContext.Provider>
  );
}

/**
 * Returns { status, error } from the nearest PrinterStatusProvider.
 * status is a map of printerId → printer status object.
 */
export function usePrinterStatus() {
  return useContext(PrinterStatusContext);
}
