/**
 * Parse the Send "BTC" field into integer satoshis using string math (no floating‑point
 * BTC scaling), so values like 0.00001 always map to exactly 1000 sats.
 */
export function btcInputToSats(input: string): number {
  const raw = input.trim().replace(/\s+/g, "");
  if (!raw) throw new Error("Enter a BTC amount.");
  if (raw.startsWith("-") || raw.startsWith("+")) throw new Error("Enter amount without a +/− sign.");
  if (!/^\d+(\.\d+)?$/.test(raw)) throw new Error("Use digits and at most one decimal point.");
  const [w, frac = ""] = raw.split(".");
  if (frac.length > 8) throw new Error("At most 8 decimal places.");
  const whole = parseInt(w || "0", 10);
  if (!Number.isFinite(whole) || whole < 0) throw new Error("Enter a valid BTC amount.");
  const fracPad = (frac + "00000000").slice(0, 8);
  const fracSats = parseInt(fracPad, 10);
  if (!Number.isFinite(fracSats)) throw new Error("Enter a valid BTC amount.");
  const sats = whole * 100_000_000 + fracSats;
  if (!Number.isSafeInteger(sats)) throw new Error("Amount too large for this wallet.");
  if (sats <= 0) throw new Error("Amount must be positive.");
  return sats;
}
