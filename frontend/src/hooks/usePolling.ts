import { useEffect, useRef } from 'react';

export function usePolling(callback: () => void, interval: number, active: boolean) {
  const savedCallback = useRef(callback);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => { savedCallback.current = callback; }, [callback]);

  useEffect(() => {
    if (!active) {
      if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
      return;
    }
    timerRef.current = setInterval(() => savedCallback.current(), interval);
    return () => { if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; } };
  }, [active, interval]);
}
