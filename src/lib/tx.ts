import * as bitcoin from "bitcoinjs-lib";
import { HDKey } from "@scure/bip32";
import { broadcastTx, getFeeRateBtcPerKb } from "./api";
import { network } from "./bitcoin";
import { changeKey, keypairForSigning, receiveKey } from "./wallet";
import type { ScannedUtxo } from "./scan";

const DUST_SATS = 294;

/**
 * Segwit amounts must be UInt53 numbers. Coerce so fee math and signing never see
 * `bigint` (some deps stringify errors with plain `JSON.stringify` and crash).
 */
function satsUInt53(n: number | bigint): number {
  const raw = typeof n === "bigint" ? Number(n) : n;
  if (typeof raw !== "number" || !Number.isFinite(raw)) throw new Error("Invalid satoshi amount");
  const v = Math.floor(raw);
  if (!Number.isSafeInteger(v) || v < 0) throw new Error("Invalid satoshi amount");
  return v;
}

function feerateToFeeSats(feerateBtcPerKb: number, vbytes: number): number {
  return Math.max(1, Math.ceil(feerateBtcPerKb * 1e8 * (vbytes / 1000)));
}

function estimateVbytes(inputCount: number, outputCount: number): number {
  return 10 + inputCount * 68 + outputCount * 31;
}

function findSigningKey(root: HDKey, pubkeyHex: string, receiveGap: number, changeGap: number): HDKey {
  const want = pubkeyHex.toLowerCase();
  for (let i = 0; i < receiveGap; i++) {
    const k = receiveKey(root, i);
    const pk = Buffer.from(k.publicKey!).toString("hex").toLowerCase();
    if (pk === want) return k;
  }
  for (let i = 0; i < changeGap; i++) {
    const k = changeKey(root, i);
    const pk = Buffer.from(k.publicKey!).toString("hex").toLowerCase();
    if (pk === want) return k;
  }
  throw new Error("No private key for one of the selected inputs");
}

function planSpend(
  selected: ScannedUtxo[],
  amountSats: number,
  feerate: number,
): { fee: number; change: number } | null {
  const totalIn = selected.reduce((s, x) => s + x.amountSats, 0);
  const n = selected.length;
  const v2 = estimateVbytes(n, 2);
  const fee2 = feerateToFeeSats(feerate, v2);
  const change2 = totalIn - amountSats - fee2;
  if (change2 >= DUST_SATS) return { fee: fee2, change: change2 };
  if (change2 < 0) return null;
  const v1 = estimateVbytes(n, 1);
  const fee1 = feerateToFeeSats(feerate, v1);
  const rem1 = totalIn - amountSats - fee1;
  if (rem1 < 0) return null;
  return { fee: totalIn - amountSats, change: 0 };
}

function selectUtxos(
  sorted: ScannedUtxo[],
  amountSats: number,
  feerate: number,
): { selected: ScannedUtxo[]; fee: number; change: number } {
  const selected: ScannedUtxo[] = [];
  for (const u of sorted) {
    selected.push(u);
    const plan = planSpend(selected, amountSats, feerate);
    if (plan) return { selected: [...selected], ...plan };
  }
  throw new Error("Insufficient funds for amount plus fee");
}

export async function buildSignBroadcastP2wpkh(params: {
  root: HDKey;
  utxos: ScannedUtxo[];
  toAddress: string;
  amountSats: number;
  receiveGap: number;
  changeGap: number;
  feeTargetBlocks?: number;
}): Promise<string> {
  const { root, utxos, toAddress, receiveGap, changeGap } = params;
  const amountSats = satsUInt53(params.amountSats);
  if (amountSats <= 0) throw new Error("Amount must be positive");
  try {
    bitcoin.address.toOutputScript(toAddress, network);
  } catch {
    throw new Error("Invalid destination address for this network");
  }

  const sorted = [...utxos]
    .map((u) => ({ ...u, amountSats: satsUInt53(u.amountSats) }))
    .sort((a, b) => b.amountSats - a.amountSats);
  const feerate = await getFeeRateBtcPerKb(params.feeTargetBlocks ?? 6);
  const { selected, fee, change } = selectUtxos(sorted, amountSats, feerate);
  const totalIn = selected.reduce((s, x) => s + x.amountSats, 0);
  if (totalIn !== amountSats + fee + change) throw new Error("Inconsistent fee plan");

  // Build + sign without PSBT/bip174: their validation errors use JSON.stringify and
  // blow up if any nested value is a BigInt (common pain with PSBT tooling).
  const tx = new bitcoin.Transaction();
  tx.version = 2;
  for (const u of selected) {
    tx.addInput(Buffer.from(u.txid, "hex").reverse(), u.vout, 0xffffffff);
  }
  tx.addOutput(bitcoin.address.toOutputScript(toAddress, network), amountSats);
  if (change >= DUST_SATS) {
    const chAddr = bitcoin.payments.p2wpkh({
      pubkey: Buffer.from(changeKey(root, 0).publicKey!),
      network,
    }).address!;
    tx.addOutput(bitcoin.address.toOutputScript(chAddr, network), satsUInt53(change));
  }

  const sighashType = bitcoin.Transaction.SIGHASH_ALL;
  for (let i = 0; i < selected.length; i++) {
    const u = selected[i]!;
    const prevOutScript = Buffer.from(u.scriptHex, "hex");
    const signingScript = bitcoin.payments.p2pkh({ hash: prevOutScript.subarray(2) }).output!;
    const kp = keypairForSigning(findSigningKey(root, u.pubkeyHex, receiveGap, changeGap));
    const hash = tx.hashForWitnessV0(i, signingScript, u.amountSats, sighashType);
    const sig = bitcoin.script.signature.encode(kp.sign(hash), sighashType);
    tx.setWitness(i, [sig, Buffer.from(kp.publicKey)]);
  }

  return broadcastTx(tx.toHex());
}
