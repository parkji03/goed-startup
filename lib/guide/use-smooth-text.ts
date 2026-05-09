'use client';

import { useEffect, useRef, useState } from 'react';

const FLUSH_INTERVAL_MS = 30;
const CHARS_PER_FLUSH = 3;

/**
 * Renders incoming `target` text gradually so token bursts read at a steady
 * pace. When `target` shrinks (e.g., on regenerate), output snaps back.
 */
export function useSmoothText(target: string): string {
  const [output, setOutput] = useState('');
  const indexRef = useRef(0);

  useEffect(() => {
    if (target.length < indexRef.current) {
      indexRef.current = 0;
      setOutput('');
    }
  }, [target]);

  useEffect(() => {
    if (output.length >= target.length) return;
    const timer = setInterval(() => {
      const next = Math.min(indexRef.current + CHARS_PER_FLUSH, target.length);
      indexRef.current = next;
      setOutput(target.slice(0, next));
      if (next >= target.length) clearInterval(timer);
    }, FLUSH_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [target, output.length]);

  return output;
}
