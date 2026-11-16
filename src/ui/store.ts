import { useRef, useSyncExternalStore } from 'react';

/** Minimal external store (no dependency). */
export interface Store<T> {
  get(): T;
  set(patch: Partial<T> | ((s: T) => Partial<T>)): void;
  subscribe(fn: () => void): () => void;
}

export function createStore<T extends object>(init: T): Store<T> {
  let state = init;
  const subs = new Set<() => void>();
  return {
    get: () => state,
    set(patch) {
      const p = typeof patch === 'function' ? patch(state) : patch;
      state = { ...state, ...p };
      subs.forEach(f => f());
    },
    subscribe(fn) { subs.add(fn); return () => { subs.delete(fn); }; },
  };
}

export function shallowEqual(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (typeof a !== 'object' || typeof b !== 'object' || !a || !b) return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const ka = Object.keys(a), kb = Object.keys(b);
  if (ka.length !== kb.length) return false;
  for (const k of ka) if (!Object.is((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k])) return false;
  return true;
}

export function useStore<T extends object, S>(store: Store<T>, selector: (s: T) => S, eq: (a: S, b: S) => boolean = shallowEqual): S {
  const last = useRef<{ v: S } | null>(null);
  const get = () => {
    const next = selector(store.get());
    if (last.current && eq(last.current.v, next)) return last.current.v;
    last.current = { v: next };
    return next;
  };
  return useSyncExternalStore(store.subscribe, get, get);
}
