const KEY = "mutinynet-web-wallet-v1";

export type StoredWallet = {
  version: 1;
  /** AES-GCM payload (base64) of UTF-8 mnemonic phrase */
  ciphertext: string;
};

export function loadWallet(): StoredWallet | null {
  const raw = localStorage.getItem(KEY);
  if (!raw) return null;
  try {
    const j = JSON.parse(raw) as StoredWallet;
    if (j?.version !== 1 || typeof j.ciphertext !== "string") return null;
    return j;
  } catch {
    return null;
  }
}

export function saveWallet(w: StoredWallet): void {
  localStorage.setItem(KEY, JSON.stringify(w));
}

export function clearWallet(): void {
  localStorage.removeItem(KEY);
}
