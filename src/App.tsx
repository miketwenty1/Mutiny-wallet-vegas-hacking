import { useCallback, useEffect, useMemo, useState } from "react";
import "./App.css";
import { getChain } from "./lib/api";
import { encryptUtf8, decryptUtf8 } from "./lib/crypto";
import { clearWallet, loadWallet, saveWallet } from "./lib/storage";
import { scanWalletUtxos, type ScannedUtxo } from "./lib/scan";
import { buildSignBroadcastP2wpkh } from "./lib/tx";
import {
  createMnemonic12,
  isValidMnemonic,
  parseMnemonic,
  p2wpkhAddress,
  receiveKey,
  rootFromMnemonic,
} from "./lib/wallet";
import type { HDKey } from "@scure/bip32";

const RECEIVE_GAP = 25;
const CHANGE_GAP = 6;

function satsToBtc(s: number): string {
  return (s / 1e8).toFixed(8);
}

export default function App() {
  const [chainLine, setChainLine] = useState<string>("…");
  const [err, setErr] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const [password, setPassword] = useState("");
  const [mnemonicDraft, setMnemonicDraft] = useState("");
  const [stored, setStored] = useState(() => loadWallet());

  const [unlockedRoot, setUnlockedRoot] = useState<HDKey | null>(null);
  const [utxos, setUtxos] = useState<ScannedUtxo[]>([]);
  const [scanning, setScanning] = useState(false);

  const [sendTo, setSendTo] = useState("");
  const [sendBtc, setSendBtc] = useState("");
  const [sending, setSending] = useState(false);

  const refreshChain = useCallback(async () => {
    try {
      const c = await getChain();
      const blocks = typeof c.blocks === "number" ? c.blocks : "?";
      const ch = typeof c.chain === "string" ? c.chain : "?";
      setChainLine(`Mutiny API · ${ch} · height ${blocks}`);
      setErr(null);
    } catch (e) {
      setChainLine("API unreachable");
      setErr(e instanceof Error ? e.message : String(e));
    }
  }, []);

  useEffect(() => {
    void refreshChain();
  }, [refreshChain]);

  const receiveAddr = useMemo(() => {
    if (!unlockedRoot) return "";
    try {
      return p2wpkhAddress(receiveKey(unlockedRoot, 0));
    } catch {
      return "";
    }
  }, [unlockedRoot]);

  const totalSats = useMemo(() => utxos.reduce((s, u) => s + u.amountSats, 0), [utxos]);

  async function onCreateWallet() {
    setErr(null);
    setInfo(null);
    if (password.length < 8) {
      setErr("Use a password of at least 8 characters.");
      return;
    }
    const phrase = createMnemonic12();
    const ct = await encryptUtf8(phrase, password);
    saveWallet({ version: 1, ciphertext: ct });
    setStored(loadWallet());
    setMnemonicDraft(phrase);
    setInfo("Wallet created. Save these words offline, then lock and unlock to use.");
  }

  async function onImportWallet() {
    setErr(null);
    setInfo(null);
    const words = parseMnemonic(mnemonicDraft);
    if (!isValidMnemonic(words)) {
      setErr("That mnemonic is not valid BIP39 English.");
      return;
    }
    if (password.length < 8) {
      setErr("Use a password of at least 8 characters.");
      return;
    }
    const ct = await encryptUtf8(words.join(" "), password);
    saveWallet({ version: 1, ciphertext: ct });
    setStored(loadWallet());
    setMnemonicDraft("");
    setInfo("Imported and encrypted locally.");
  }

  async function onUnlock() {
    setErr(null);
    setInfo(null);
    if (!stored) return;
    if (password.length < 8) {
      setErr("Enter your wallet password.");
      return;
    }
    try {
      const phrase = await decryptUtf8(stored.ciphertext, password);
      const root = rootFromMnemonic(phrase);
      setUnlockedRoot(root);
      setUtxos([]);
      setInfo("Unlocked in this tab only. Keys never leave your browser.");
    } catch {
      setErr("Wrong password or corrupt local data.");
    }
  }

  function onLock() {
    setUnlockedRoot(null);
    setUtxos([]);
    setPassword("");
    setInfo(null);
  }

  function onWipe() {
    if (!confirm("Delete encrypted wallet from this browser?")) return;
    clearWallet();
    setStored(null);
    onLock();
    setInfo("Local wallet removed.");
  }

  async function onScan() {
    if (!unlockedRoot) return;
    setScanning(true);
    setErr(null);
    setInfo(null);
    try {
      const { utxos: u } = await scanWalletUtxos(unlockedRoot, {
        receiveGap: RECEIVE_GAP,
        changeGap: CHANGE_GAP,
      });
      setUtxos(u);
      setInfo(`Scan complete (${u.length} UTXOs).`);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setScanning(false);
    }
  }

  async function onSend() {
    if (!unlockedRoot) return;
    setSending(true);
    setErr(null);
    setInfo(null);
    try {
      const amt = Number(sendBtc);
      if (!Number.isFinite(amt) || amt <= 0) throw new Error("Enter a valid BTC amount.");
      const sats = Math.round(amt * 1e8);
      const txid = await buildSignBroadcastP2wpkh({
        root: unlockedRoot,
        utxos,
        toAddress: sendTo.trim(),
        amountSats: sats,
        receiveGap: RECEIVE_GAP,
        changeGap: CHANGE_GAP,
      });
      setInfo(`Broadcast: ${txid}`);
      setSendTo("");
      setSendBtc("");
      await onScan();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="shell">
      <header>
        <h1>Mutinynet wallet</h1>
        <span className="badge">{chainLine}</span>
      </header>

      {err ? <div className="err panel">{err}</div> : null}
      {info ? <div className="ok panel">{info}</div> : null}

      {!stored ? (
        <section className="panel">
          <h2>New wallet</h2>
          <div className="row">
            <label htmlFor="pw1">Password</label>
            <input
              id="pw1"
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Encrypts your seed in the browser"
            />
          </div>
          <div className="row">
            <button type="button" className="btn btn-primary" onClick={() => void onCreateWallet()}>
              Create 12-word wallet
            </button>
          </div>
          <h2 style={{ marginTop: "1rem" }}>Import</h2>
          <div className="row" style={{ flexDirection: "column", alignItems: "stretch" }}>
            <textarea
              value={mnemonicDraft}
              onChange={(e) => setMnemonicDraft(e.target.value)}
              placeholder="BIP39 mnemonic (12 or 24 words)"
            />
          </div>
          <div className="row">
            <button type="button" className="btn" onClick={() => void onImportWallet()}>
              Import & encrypt locally
            </button>
          </div>
        </section>
      ) : !unlockedRoot ? (
        <section className="panel">
          <h2>Unlock</h2>
          <div className="row">
            <label htmlFor="pw2">Password</label>
            <input
              id="pw2"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && void onUnlock()}
            />
          </div>
          <div className="row">
            <button type="button" className="btn btn-primary" onClick={() => void onUnlock()}>
              Unlock
            </button>
            <button type="button" className="btn btn-danger" onClick={onWipe}>
              Wipe local wallet
            </button>
          </div>
          {mnemonicDraft ? (
            <p className="small" style={{ marginTop: "0.75rem" }}>
              Backup phrase (copy once, store offline):<br />
              <code>{mnemonicDraft}</code>
            </p>
          ) : null}
        </section>
      ) : (
        <>
          <section className="panel">
            <h2>Balance</h2>
            <div className="balance">{satsToBtc(totalSats)} BTC</div>
            <p className="small">BIP84 / native segwit · account 0 · coin type 1 (signet)</p>
            <div className="row" style={{ marginTop: "0.75rem" }}>
              <button type="button" className="btn btn-primary" disabled={scanning} onClick={() => void onScan()}>
                {scanning ? "Scanning chain…" : "Scan UTXOs (scantxoutset)"}
              </button>
              <button type="button" className="btn" onClick={onLock}>
                Lock
              </button>
              <button type="button" className="btn btn-danger" onClick={onWipe}>
                Wipe
              </button>
            </div>
          </section>

          <section className="panel">
            <h2>Receive</h2>
            <p className="mono small" style={{ wordBreak: "break-all" }}>
              {receiveAddr}
            </p>
          </section>

          <section className="panel">
            <h2>Send</h2>
            <div className="row">
              <label htmlFor="to">To</label>
              <input id="to" type="text" value={sendTo} onChange={(e) => setSendTo(e.target.value)} placeholder="tb1…" />
            </div>
            <div className="row">
              <label htmlFor="amt">Amount</label>
              <input
                id="amt"
                type="text"
                inputMode="decimal"
                value={sendBtc}
                onChange={(e) => setSendBtc(e.target.value)}
                placeholder="BTC (e.g. 0.0001)"
              />
            </div>
            <div className="row">
              <button
                type="button"
                className="btn btn-primary"
                disabled={sending || utxos.length === 0}
                onClick={() => void onSend()}
              >
                {sending ? "Signing…" : "Sign & broadcast"}
              </button>
            </div>
          </section>

          <section className="panel">
            <h2>UTXOs</h2>
            {utxos.length === 0 ? (
              <p className="small">No UTXOs yet. Run a scan after funding your first receive address.</p>
            ) : (
              <table>
                <thead>
                  <tr>
                    <th>TXID</th>
                    <th>vout</th>
                    <th>BTC</th>
                  </tr>
                </thead>
                <tbody>
                  {utxos.map((u) => (
                    <tr key={`${u.txid}:${u.vout}`}>
                      <td className="truncate" title={u.txid}>
                        {u.txid}
                      </td>
                      <td>{u.vout}</td>
                      <td>{u.amountBtc}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>
        </>
      )}

      <p className="small" style={{ marginTop: "1.5rem" }}>
        Keys and seed stay in this browser (encrypted at rest). The server only sees chain RPCs you trigger (scan,
        broadcast, chain info). API docs:{" "}
        <a href="http://3.231.31.216:3000/docs" target="_blank" rel="noreferrer">
          http://3.231.31.216:3000/docs
        </a>
        .
      </p>
    </div>
  );
}
