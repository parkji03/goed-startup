"use client";

import { useEffect } from "react";

/**
 * Last-resort error boundary. Replaces the entire `<html>` tree when the
 * root layout itself throws — at this level the locale layout has already
 * blown up so we can't rely on the design-system theme/fonts being mounted.
 * Plain HTML/inline styles only.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Global error boundary caught:", error);
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          fontFamily:
            "ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
          background: "#0b0b0c",
          color: "#fafafa",
          display: "grid",
          placeItems: "center",
          padding: "2rem",
        }}
      >
        <div style={{ maxWidth: 520, lineHeight: 1.5 }}>
          <h1 style={{ fontSize: "1.5rem", marginBottom: "0.5rem" }}>
            Something went badly wrong
          </h1>
          <p style={{ color: "#a1a1aa", marginTop: 0 }}>
            The app couldn&apos;t recover from an error in the root layout.
            Try reloading; if it keeps happening, share the reference below
            with the team.
          </p>
          {error.message && (
            <pre
              style={{
                background: "#1a1a1c",
                border: "1px solid #2a2a2c",
                borderRadius: 8,
                padding: "0.75rem 1rem",
                fontSize: "0.75rem",
                color: "#d4d4d8",
                whiteSpace: "pre-wrap",
                overflowX: "auto",
              }}
            >
              {error.message}
            </pre>
          )}
          <div style={{ marginTop: "1rem", display: "flex", gap: "0.5rem" }}>
            <button
              type="button"
              onClick={() => reset()}
              style={{
                background: "#fafafa",
                color: "#0b0b0c",
                border: 0,
                borderRadius: 6,
                padding: "0.5rem 0.875rem",
                cursor: "pointer",
                fontWeight: 600,
              }}
            >
              Try again
            </button>
            {/* Plain anchor: global-error replaces the whole document so
                the Next router context isn't mounted — `next/link` doesn't
                work here, hard navigation is the right call. */}
            {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
            <a
              href="/"
              style={{
                background: "transparent",
                color: "#fafafa",
                border: "1px solid #2a2a2c",
                borderRadius: 6,
                padding: "0.5rem 0.875rem",
                textDecoration: "none",
                fontWeight: 500,
              }}
            >
              Reload
            </a>
          </div>
          {error.digest && (
            <p style={{ color: "#71717a", fontSize: "0.75rem", marginTop: "1rem" }}>
              Error reference: <code>{error.digest}</code>
            </p>
          )}
        </div>
      </body>
    </html>
  );
}
