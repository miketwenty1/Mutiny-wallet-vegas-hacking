const KEY = "mutinynet-web-wallet-v2";
const LEGACY_KEY = "mutinynet-web-wallet-v1";

/** Plain mnemonic in localStorage (no password). */
export function loadMnemonic(): string | null {
  const raw = localStorage.getItem(KEY);
  if (!raw) return null;
  try {
    const j = JSON.parse(raw) as { version?: number; mnemonic?: string };
    if (j?.version === 2 && typeof j.mnemonic === "string" && j.mnemonic.trim()) return j.mnemonic.trim();
  } catch {
    /* ignore */
  }
  return null;
}

export function saveMnemonic(mnemonic: string): void {
  localStorage.removeItem(LEGACY_KEY);
  localStorage.setItem(KEY, JSON.stringify({ version: 2, mnemonic: mnemonic.trim() }));
}

export function clearMnemonic(): void {
  localStorage.removeItem(KEY);
}
