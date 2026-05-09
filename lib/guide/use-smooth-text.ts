'use client';

import { useEffect, useRef, useState } from 'react';

const FLUSH_INTERVAL_MS = 20;
const CHARS_PER_FLUSH = 10;

/**
 * Renders incoming `target` text gradually so token bursts read at a steady
 * pace.
 *
 * One Effect, one dependency (`target`). Reading `output.length` as a dep
 * would tear down and rebuild the interval on every flush; the interval
 * already self-clears once it catches up, so we don't need that signal in
 * the dep array. The shrink-reset for regenerate happens at the top of the
 * Effect — refs and `setState` are both legal there.
 */
export function useSmoothText(target: string): string {
  const [output, setOutput] = useState('');
  const indexRef = useRef(0);

  useEffect(() => {
    if (target.length < indexRef.current) {
      indexRef.current = 0;
      setOutput('');
    }
    if (indexRef.current >= target.length) return;
    const timer = setInterval(() => {
      const next = Math.min(indexRef.current + CHARS_PER_FLUSH, target.length);
      indexRef.current = next;
      setOutput(target.slice(0, next));
      if (next >= target.length) clearInterval(timer);
    }, FLUSH_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [target]);

  return output;
}
