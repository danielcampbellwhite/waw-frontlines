import { useEffect, useRef, useState } from 'react';
import type { Engine, GameState } from '../../core/types';
import { shallowEqual } from '../store';

export const ENGINE_UI_HZ = 10;

/**
 * Subscribes to the engine and re-renders at most ~10 Hz, and only when the selector's result changed
 * (shallow equality by default). Engines may mutate state in place, so selectors must derive new values;
 * when no selector is given the hook returns the state and re-renders on each (throttled) notification.
 */
export function useEngineState<T = Readonly<GameState>>(
  engine: Engine,
  selector?: (s: Readonly<GameState>) => T,
  equals: (a: T, b: T) => boolean = shallowEqual,
  hz: number = ENGINE_UI_HZ,
): T {
  const sel = useRef(selector); sel.current = selector;
  const eq = useRef(equals); eq.current = equals;
  const compute = (): T => (sel.current ? sel.current(engine.getState()) : (engine.getState() as unknown as T));
  const [value, setValue] = useState<{ v: T }>(() => ({ v: compute() }));
  const [, force] = useState(0);

  useEffect(() => {
    const minGap = 1000 / hz;
    let last = 0;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let dirty = false;
    const flush = () => {
      timer = null; dirty = false; last = performance.now();
      const next = compute();
      setValue(prev => {
        if (sel.current) { if (eq.current(prev.v, next)) return prev; return { v: next }; }
        return prev;
      });
      if (!sel.current) force(n => n + 1);
    };
    const unsub = engine.subscribe(() => {
      dirty = true;
      if (timer) return;
      const wait = Math.max(0, minGap - (performance.now() - last));
      timer = setTimeout(flush, wait);
    });
    // state may have changed between render and subscription
    flush();
    return () => { unsub(); if (timer) clearTimeout(timer); void dirty; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [engine, hz]);

  return sel.current ? value.v : (engine.getState() as unknown as T);
}

/** Convenience: current sim minute (re-renders when it changes). */
export const useSimMinutes = (engine: Engine) => useEngineState(engine, s => s.clock.minutes, Object.is);
