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
  amount: number;
  scriptPubKey?: { hex?: string };
  desc?: string;
};

type ScanTxOutSetResult = {
  success: boolean;
  unspents: RpcUnspent[];
  total_amount: number;
};

function extractPubkeyFromDesc(desc: string | undefined): string | null {
  if (!desc) return null;
  const m = desc.match(/wpkh\(([0-9a-fA-F]{66})\)/);
  return m ? m[1].toLowerCase() : null;
}

async function descriptorsForPubkeys(pubkeys: string[]): Promise<string[]> {
  return Promise.all(
    pubkeys.map(async (pk) => {
      const r = await rpc<{ descriptor: string }>("getdescriptorinfo", [`wpkh(${pk})`]);
      return r.descriptor;
    }),
  );
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
  const descs = await descriptorsForPubkeys(all.map((x) => x.pk));
  const scanObjects = descs;
  const res = await rpc<ScanTxOutSetResult>("scantxoutset", ["start", scanObjects]);
  if (!res.success) throw new Error("scantxoutset did not succeed");
  const utxos: ScannedUtxo[] = [];
  for (const u of res.unspents) {
    const sh = u.scriptPubKey?.hex;
    if (!sh) continue;
    const fromDesc = extractPubkeyFromDesc(u.desc);
    const pk = fromDesc || "";
    if (!pk) continue;
    const sats = Math.round(u.amount * 1e8);
    utxos.push({
      txid: u.txid,
      vout: u.vout,
      amountBtc: u.amount,
      amountSats: sats,
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
