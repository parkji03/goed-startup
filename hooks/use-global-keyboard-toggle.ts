"use client";

import { useEffect } from "react";

function isTypingTarget(target: EventTarget | null): boolean {
  if (!target || !(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  return target.isContentEditable;
}

/**
 * Subscribe to a global Meta/Ctrl + key shortcut. Uses an effect because this
 * syncs with the browser (external system), not for deriving render state —
 * see https://react.dev/learn/synchronizing-with-effects and
 * https://react.dev/learn/you-might-not-need-an-effect
 */
export function useGlobalMetaCtrlKeyToggle(options: {
  /** When false, no listener is attached (e.g. admin layouts). */
  enabled: boolean;
  /** Lowercase `event.key` value, e.g. `"l"`. */
  key: string;
  /** Prefer `useCallback` in the caller so the listener is not reattached each render. */
  onToggle: () => void;
}) {
  const { enabled, key, onToggle } = options;

  useEffect(() => {
    if (!enabled) return;

    const handler = (event: KeyboardEvent) => {
      if (event.repeat) return;
      if (!(event.metaKey || event.ctrlKey) || event.altKey) return;
      if (event.key.toLowerCase() !== key) return;
      if (isTypingTarget(event.target)) return;
      event.preventDefault();
      onToggle();
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [enabled, key, onToggle]);
}
