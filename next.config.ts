import type { NextConfig } from "next";
import path from "path";
import { fileURLToPath } from "url";
import createNextIntlPlugin from "next-intl/plugin";

const projectRoot = path.dirname(fileURLToPath(import.meta.url));

const withNextIntl = createNextIntlPlugin("./i18n/request.ts");

const nextConfig: NextConfig = {
  turbopack: {
    root: projectRoot,
  },
  // Portless gives each worktree a stable HTTPS host like
  // `https://<worktree-or-app>.goed-startup.localhost`. Next 16 treats any
  // host that isn't `localhost`/`127.0.0.1` as cross-origin in dev and
  // refuses to serve HMR + dev assets, which leaves the page hydrated but
  // dead (no event handlers attach). Whitelist the portless pattern so dev
  // works through the proxy.
  allowedDevOrigins: ["*.goed-startup.localhost"],
};

export default withNextIntl(nextConfig);
