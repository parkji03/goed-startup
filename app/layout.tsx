import type { ReactNode } from "react";
import "./globals.css";

type Props = {
  children: ReactNode;
};

/** Minimal shell — `<html>` / `<body>` and all client providers live under `[locale]/layout.tsx`. */
export default function RootLayout({ children }: Props) {
  return children;
}
