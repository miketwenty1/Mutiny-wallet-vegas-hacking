import { apiBase } from "./config";

function safeJsonStringify(v: unknown): string {
  return JSON.stringify(v, (_k, val) => (typeof val === "bigint" ? val.toString() : val));
}

async function parseJson(res: Response): Promise<unknown> {
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(text.slice(0, 200) || `HTTP ${res.status}`);
  }
}

export async function rpc<T>(method: string, params: unknown[] = []): Promise<T> {
  const base = apiBase();
  const res = await fetch(`${base}/v1/rpc`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: safeJsonStringify({ jsonrpc: "2.0", id: Date.now(), method, params }),
  });
  const j = (await parseJson(res)) as {
    result?: T;
    error?: { code: number; message: string };
  };
  if (j.error) throw new Error(j.error.message || safeJsonStringify(j.error));
  if (j.result === undefined) throw new Error("RPC: missing result");
  return j.result;
}

export async function getChain(): Promise<Record<string, unknown>> {
  const base = apiBase();
  const res = await fetch(`${base}/v1/chain`);
  if (!res.ok) throw new Error(`chain: HTTP ${res.status}`);
  return (await parseJson(res)) as Record<string, unknown>;
}

export async function getFeeRateBtcPerKb(blocks = 6): Promise<number> {
  const base = apiBase();
  const res = await fetch(`${base}/v1/fee-estimates?blocks=${blocks}`);
  if (!res.ok) throw new Error(`fee: HTTP ${res.status}`);
  const j = (await parseJson(res)) as { feerate?: number };
  if (typeof j.feerate !== "number" || j.feerate <= 0) throw new Error("fee: bad feerate");
  return j.feerate;
}

export async function getRawTxVerbose(txid: string): Promise<Record<string, unknown>> {
  const base = apiBase();
  const res = await fetch(`${base}/v1/tx/${encodeURIComponent(txid)}?verbose=true`);
  if (!res.ok) throw new Error(`getrawtransaction ${txid}: HTTP ${res.status}`);
  return (await parseJson(res)) as Record<string, unknown>;
}

export async function broadcastTx(hex: string): Promise<string> {
  const base = apiBase();
  const res = await fetch(`${base}/v1/tx`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ hex }),
  });
  const j = await parseJson(res);
  if (typeof j === "object" && j && "error" in j) {
    const e = (j as { error?: string }).error;
    throw new Error(e || safeJsonStringify(j));
  }
  if (typeof j === "string") return j;
  if (typeof j === "object" && j && "txid" in j) return String((j as { txid: string }).txid);
  if (typeof j === "object" && j && "result" in j) return String((j as { result: unknown }).result);
  return safeJsonStringify(j);
}
