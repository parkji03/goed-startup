import type { NextConfig } from "next";
import path from "path";
import { fileURLToPath } from "url";

// Pin Turbopack’s root so it doesn’t walk up to a parent lockfile (e.g. ~/pnpm-lock.yaml).
const projectRoot = path.dirname(fileURLToPath(import.meta.url));

const nextConfig: NextConfig = {
  turbopack: {
    root: projectRoot,
  },
};

export default nextConfig;
