/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE: string;
  readonly VITE_DEV_API_PROXY: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

interface Window {
  /** Injected in index.html at build time — visible before JS loads (View Source). */
  __HTML_STAMP__?: { version: string; buildTime: string };
  /** Set in main.tsx for quick checks: `window.__MUTINYNET_WALLET__` in DevTools. */
  __MUTINYNET_WALLET__?: { version: string; buildTime: string };
}
