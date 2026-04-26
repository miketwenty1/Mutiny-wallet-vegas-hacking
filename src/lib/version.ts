declare const __APP_VERSION__: string | undefined;
declare const __APP_BUILD_TIME__: string | undefined;

/** Semver from package.json, baked in at `vite build` / dev server start. */
export function appVersion(): string {
  return typeof __APP_VERSION__ === "string" ? __APP_VERSION__ : "0.0.0-dev";
}

/** ISO UTC timestamp when this bundle was produced. */
export function appBuildTime(): string {
  return typeof __APP_BUILD_TIME__ === "string" ? __APP_BUILD_TIME__ : "unknown";
}

export function versionSummary(): string {
  return `v${appVersion()} · ${appBuildTime()}`;
}
