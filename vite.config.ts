import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import { nodePolyfills } from "vite-plugin-node-polyfills";

const rootDir = dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(readFileSync(resolve(rootDir, "package.json"), "utf8")) as { version: string };
const appVersion = pkg.version;
const appBuildTime = new Date().toISOString();

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const apiTarget = env.VITE_DEV_API_PROXY || "http://127.0.0.1:3000";
  return {
    define: {
      __APP_VERSION__: JSON.stringify(appVersion),
      __APP_BUILD_TIME__: JSON.stringify(appBuildTime),
    },
    plugins: [
      {
        name: "inject-html-build-stamp",
        transformIndexHtml(html) {
          const stamp = JSON.stringify({ version: appVersion, buildTime: appBuildTime });
          return html
            .replace("<head>", `<head><script>window.__HTML_STAMP__=${stamp}</script>`)
            .replace("<title>Mutinynet ☢</title>", `<title>Mutinynet v${appVersion} ☢</title>`);
        },
      },
      nodePolyfills({
        globals: {
          Buffer: true,
          global: true,
          process: true,
        },
        protocolImports: true,
      }),
      react(),
    ],
    server: {
      port: 5173,
      proxy: {
        "/api": {
          target: apiTarget,
          changeOrigin: true,
          rewrite: (p) => p.replace(/^\/api/, ""),
        },
      },
    },
  };
});
