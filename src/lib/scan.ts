import * as bitcoin from "bitcoinjs-lib";
import { HDKey } from "@scure/bip32";
import { rpc } from "./api";
import { changeKey, pubkeyHexCompressed, receiveKey } from "./wallet";

export type ScannedUtxo = {
  txid: string;
  vout: number;
  amountBtc: number;
  amountSats: number;
  scriptHex: string;
  pubkeyHex: string;
};

type RpcUnspent = {
  txid: string;
  vout: number;
  amount: number | string;
  scriptPubKey?: string | { hex?: string; asm?: string };
  desc?: string;
};

type ScanTxOutSetResult = {
  success: boolean;
  unspents: RpcUnspent[];
  total_amount: number;
};

function scriptHex(u: RpcUnspent): string | null {
  const sp = u.scriptPubKey;
  if (!sp) return null;
  if (typeof sp === "string") {
    const t = sp.trim();
    return /^[0-9a-fA-F]+$/.test(t) && t.length >= 4 ? t : null;
  }
  return sp.hex ?? null;
}

function extractPubkeyFromDesc(desc: string | undefined): string | null {
  if (!desc) return null;
  const m = desc.match(/wpkh\(([0-9a-fA-F]{66})\)/);
  return m ? m[1]!.toLowerCase() : null;
}

/** Witness v0 keyhash script: 0x00 0x14 <20-byte hash160(pubkey)> */
function p2wpkhPubkeyHash(scriptHexStr: string): Buffer | null {
  try {
    const b = Buffer.from(scriptHexStr, "hex");
    if (b.length !== 22 || b[0] !== 0x00 || b[1] !== 0x14) return null;
    return b.subarray(2);
  } catch {
    return null;
  }
}

async function descriptorsForPubkeys(pubkeys: string[]): Promise<string[]> {
  const out: string[] = [];
  const chunk = 6;
  for (let i = 0; i < pubkeys.length; i += chunk) {
    const slice = pubkeys.slice(i, i + chunk);
    const part = await Promise.all(
      slice.map(async (pk) => {
        const r = await rpc<{ descriptor: string }>("getdescriptorinfo", [`wpkh(${pk})`]);
        return r.descriptor;
      }),
    );
    out.push(...part);
  }
  return out;
}

export async function scanWalletUtxos(
  root: HDKey,
  opts: { receiveGap: number; changeGap: number },
): Promise<{ utxos: ScannedUtxo[]; receiveUsed: number; changeUsed: number }> {
  const recv: { index: number; pk: string }[] = [];
  for (let i = 0; i < opts.receiveGap; i++) {
    recv.push({ index: i, pk: pubkeyHexCompressed(receiveKey(root, i)) });
  }
  const chg: { index: number; pk: string }[] = [];
  for (let i = 0; i < opts.changeGap; i++) {
    chg.push({ index: i, pk: pubkeyHexCompressed(changeKey(root, i)) });
  }
  const all = [...recv, ...chg];
  const pkByHash = new Map<string, string>();
  for (const { pk } of all) {
    const buf = Buffer.from(pk, "hex");
    const h = bitcoin.crypto.hash160(buf).toString("hex");
    pkByHash.set(h, pk.toLowerCase());
  }

  const descs = await descriptorsForPubkeys(all.map((x) => x.pk));
  const res = await rpc<ScanTxOutSetResult>("scantxoutset", ["start", descs]);
  if (!res.success) throw new Error("scantxoutset did not succeed");

  const utxos: ScannedUtxo[] = [];
  for (const u of res.unspents) {
    const sh = scriptHex(u);
    if (!sh) continue;

    let pk = extractPubkeyFromDesc(u.desc);
    if (!pk) {
      const h20 = p2wpkhPubkeyHash(sh);
      if (h20) {
        pk = pkByHash.get(h20.toString("hex")) ?? null;
      }
    }
    if (!pk) continue;

    const amountBtc = typeof u.amount === "string" ? Number.parseFloat(u.amount) : Number(u.amount);
    if (!Number.isFinite(amountBtc)) continue;
    const amountSats = Math.round(amountBtc * 1e8);

    utxos.push({
      txid: u.txid,
      vout: u.vout,
      amountBtc,
      amountSats,
      scriptHex: sh,
      pubkeyHex: pk,
    });
  }

  let receiveUsed = 0;
  let changeUsed = 0;
  for (const u of utxos) {
    const idx = recv.find((r) => r.pk.toLowerCase() === u.pubkeyHex.toLowerCase())?.index;
    if (idx !== undefined) receiveUsed = Math.max(receiveUsed, idx + 1);
    const cidx = chg.find((r) => r.pk.toLowerCase() === u.pubkeyHex.toLowerCase())?.index;
    if (cidx !== undefined) changeUsed = Math.max(changeUsed, cidx + 1);
  }
  return { utxos, receiveUsed, changeUsed };
}
