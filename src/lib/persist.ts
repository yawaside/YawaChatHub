import { useCallback, useEffect, useState } from "react";
import { settingGet, settingSet } from "./bridge";

/** Общая шина для мгновенной синхронизации настроек между всеми компонентами */
const memoryBus = typeof EventTarget !== "undefined" ? new EventTarget() : null;

/** Настройка, которая сохраняется мгновенно — в WebView2 в settings.json, в браузере в localStorage */
export function usePersisted<T>(key: string, fallback: T): [T, (v: T | ((p: T) => T)) => void, boolean] {
  const [value, setValue] = useState<T>(fallback);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let alive = true;
    void settingGet(key, fallback).then((v) => {
      if (alive) {
        setValue(v);
        setLoaded(true);
      }
    });

    const onMemoryChange = (e: Event) => {
      const detail = (e as CustomEvent<T>).detail;
      if (alive) {
        setValue(detail);
        setLoaded(true);
      }
    };

    memoryBus?.addEventListener(key, onMemoryChange);

    return () => {
      alive = false;
      memoryBus?.removeEventListener(key, onMemoryChange);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const set = useCallback(
    (v: T | ((p: T) => T)) => {
      setValue((prev) => {
        const next = typeof v === "function" ? (v as (p: T) => T)(prev) : v;
        void settingSet(key, next);
        memoryBus?.dispatchEvent(new CustomEvent(key, { detail: next }));
        return next;
      });
    },
    [key]
  );

  return [value, set, loaded];
}

/** простая строковая настройка */
export function useSetting<T>(key: string, fallback: T): [T, (v: T) => void] {
  const [value, set, loaded] = usePersisted<T>(key, fallback);
  useEffect(() => {
    if (loaded) void settingSet(key, value);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded]);
  return [value, set as (v: T) => void];
}
