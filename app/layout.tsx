import type { ReactNode } from "react";
import { ConvexClientProvider } from "@/components/ConvexClientProvider";
import "./globals.css";

type Props = {
  children: ReactNode;
};

/**
 * Minimal shell — `<html>` / `<body>` live under `[locale]/layout.tsx`.
 * The Convex provider mounts here so it covers both locale-aware and
 * locale-free routes (e.g. /map until we move it under [locale]).
 */
export default function RootLayout({ children }: Props) {
  return <ConvexClientProvider>{children}</ConvexClientProvider>;
}
