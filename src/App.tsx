import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import "./App.css";
import { getChain } from "./lib/api";
import { fxReceiveFunds, fxSendFunds } from "./lib/fx";
import { loadMnemonic, saveMnemonic } from "./lib/storage";
import { scanWalletUtxos, type ScannedUtxo } from "./lib/scan";
import { btcInputToSats } from "./lib/btcAmount";
import { buildSignBroadcastP2wpkh } from "./lib/tx";
import { appBuildTime, appVersion, versionSummary } from "./lib/version";
import { createMnemonic12, p2wpkhAddress, receiveKey, rootFromMnemonic } from "./lib/wallet";
import type { HDKey } from "@scure/bip32";

const RECEIVE_GAP = 60;
const CHANGE_GAP = 12;
const SEND_FX_MS = 3800;
const RECEIVE_FX_MS = 4200;
const EXPECT_POLL_MS = 12_000;
const EXPECT_MAX_MS = 20 * 60 * 1000;

function satsToBtc(s: number): string {
  return (s / 1e8).toFixed(8);
}

/** Portaled to `document.body` so parent layout/transforms never hide the build stamp. */
function BuildStampCorner() {
  return (
    <div
      className="build-stamp-corner mono"
      data-app-version={versionSummary()}
      title={versionSummary()}
      aria-label={`Wallet version ${versionSummary()}`}
    >
      <div className="build-stamp-corner__line build-stamp-corner__ver">v{appVersion()}</div>
      <div className="build-stamp-corner__line build-stamp-corner__when">
        {appBuildTime().replace("T", " ").slice(0, 19)} UTC
      </div>
    </div>
  );
}

export default function App() {
  const [mnemonic, setMnemonic] = useState<string | null>(null);
  const [chainLine, setChainLine] = useState("…");
  const [err, setErr] = useState<string | null>(null);
  const [utxos, setUtxos] = useState<ScannedUtxo[]>([]);
  const [scanning, setScanning] = useState(false);
  const [lastScan, setLastScan] = useState<string | null>(null);
  const [sendTo, setSendTo] = useState("");
  const [sendBtc, setSendBtc] = useState("");
  const [sending, setSending] = useState(false);
  const [sendFx, setSendFx] = useState(false);
  const [receiveFx, setReceiveFx] = useState(false);
  const [expectIncoming, setExpectIncoming] = useState(false);
  const prevSatsRef = useRef<number | null>(null);
  const sendTimerRef = useRef<number | null>(null);
  const receiveTimerRef = useRef<number | null>(null);
  const scanBaselineDoneRef = useRef(false);
  const scanSeqRef = useRef(0);
  const runScanRef = useRef<() => Promise<void>>(async () => {});

  useEffect(() => {
    let m = loadMnemonic();
    if (!m) {
      m = createMnemonic12();
      saveMnemonic(m);
    }
    setMnemonic(m);
  }, []);

  useEffect(() => {
    return () => {
      if (sendTimerRef.current) window.clearTimeout(sendTimerRef.current);
      if (receiveTimerRef.current) window.clearTimeout(receiveTimerRef.current);
    };
  }, []);

  const root = useMemo<HDKey | null>(() => {
    if (!mnemonic) return null;
    try {
      return rootFromMnemonic(mnemonic);
    } catch {
      return null;
    }
  }, [mnemonic]);

  const receiveAddr = useMemo(() => {
    if (!root) return "";
    try {
      return p2wpkhAddress(receiveKey(root, 0));
    } catch {
      return "";
    }
  }, [root]);

  const totalSats = useMemo(() => utxos.reduce((s, u) => s + u.amountSats, 0), [utxos]);

  const refreshChain = useCallback(async () => {
    try {
      const c = await getChain();
      const blocks = typeof c.blocks === "number" ? c.blocks : "?";
      const ch = typeof c.chain === "string" ? c.chain : "?";
      setChainLine(`Mutiny · ${ch} · ${blocks}`);
    } catch (e) {
      setChainLine("offline");
      setErr(e instanceof Error ? e.message : String(e));
    }
  }, []);

  useEffect(() => {
    void refreshChain();
  }, [refreshChain]);

  useEffect(() => {
    document.title = `Mutinynet v${appVersion()}`;
    console.info(`[mutinynet-wallet] ${versionSummary()}`);
  }, []);

  const runScan = useCallback(async () => {
    if (!root) return;
    const id = ++scanSeqRef.current;
    setScanning(true);
    setErr(null);
    try {
      const { utxos: u } = await scanWalletUtxos(root, {
        receiveGap: RECEIVE_GAP,
        changeGap: CHANGE_GAP,
      });
      if (id !== scanSeqRef.current) return;

      const next = u.reduce((s, x) => s + x.amountSats, 0);
      const prev = prevSatsRef.current;
      prevSatsRef.current = next;
      setUtxos(u);
      setLastScan(new Date().toLocaleTimeString());

      const baselineReady = scanBaselineDoneRef.current;
      if (!scanBaselineDoneRef.current) scanBaselineDoneRef.current = true;
      const grew = baselineReady && prev !== null && next > prev;
      if (grew) {
        setExpectIncoming(false);
        if (receiveTimerRef.current) window.clearTimeout(receiveTimerRef.current);
        setReceiveFx(true);
        fxReceiveFunds();
        receiveTimerRef.current = window.setTimeout(() => {
          setReceiveFx(false);
          receiveTimerRef.current = null;
        }, RECEIVE_FX_MS);
      }
    } catch (e) {
      if (id !== scanSeqRef.current) return;
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      if (id === scanSeqRef.current) setScanning(false);
    }
  }, [root]);

  runScanRef.current = runScan;

  useEffect(() => {
    if (root) void runScan();
  }, [root, runScan]);

  useEffect(() => {
    if (!expectIncoming) return;
    void runScanRef.current();
    const tick = () => void runScanRef.current();
    const interval = window.setInterval(tick, EXPECT_POLL_MS);
    const maxT = window.setTimeout(() => setExpectIncoming(false), EXPECT_MAX_MS);
    return () => {
      window.clearInterval(interval);
      window.clearTimeout(maxT);
    };
  }, [expectIncoming]);

  async function onCopyReceive() {
    if (!receiveAddr) return;
    try {
      await navigator.clipboard.writeText(receiveAddr);
    } catch {
      setErr("Could not copy (clipboard permission).");
    }
  }

  async function onSend() {
    if (!root) return;
    setSending(true);
    setErr(null);
    try {
      const sats = btcInputToSats(sendBtc);
      await buildSignBroadcastP2wpkh({
        root,
        utxos,
        toAddress: sendTo.trim(),
        amountSats: sats,
        receiveGap: RECEIVE_GAP,
        changeGap: CHANGE_GAP,
      });
      setSendTo("");
      setSendBtc("");
      if (sendTimerRef.current) window.clearTimeout(sendTimerRef.current);
      setSendFx(true);
      fxSendFunds();
      sendTimerRef.current = window.setTimeout(() => {
        setSendFx(false);
        sendTimerRef.current = null;
      }, SEND_FX_MS);
      await runScan();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setSending(false);
    }
  }

  if (!mnemonic || !root) {
    return (
      <>
        <div className="shell boot">
          <div className="boot-inner">
            <div className="boot-ring" />
            <p className="boot-text">Arming wallet…</p>
          </div>
        </div>
        {createPortal(<BuildStampCorner />, document.body)}
      </>
    );
  }

  return (
    <>
      <div className="shell">
      {sendFx ? (
        <div className="send-fx" aria-hidden>
          <div className="send-fx-bg">
            <span className="send-bomb send-bomb--a">☢️</span>
            <span className="send-bomb send-bomb--b">💣</span>
            <span className="send-bomb send-bomb--c">☢️</span>
            <span className="send-bomb send-bomb--d">💣</span>
            <span className="send-bomb send-bomb--e">☢️</span>
            <span className="send-bomb send-bomb--f">💣</span>
          </div>
          <div className="send-fx-unicorn">
            <div className="unicorn-emoji" title="unicorn">
              🦄
            </div>
            <div className="rainbow-fart" />
          </div>
          <div className="send-fx-flash" />
        </div>
      ) : null}

      {receiveFx ? (
        <div className="receive-fx" aria-hidden>
          <div className="receive-fx-rain" />
          <div className="receive-fx-stage">
            <div className="striped-unicorn su-1">
              <div className="striped-unicorn-stripes" />
              <span className="striped-unicorn-face">🦄</span>
            </div>
            <div className="striped-unicorn su-2">
              <div className="striped-unicorn-stripes" />
              <span className="striped-unicorn-face">🦄</span>
            </div>
            <div className="striped-unicorn su-3">
              <div className="striped-unicorn-stripes" />
              <span className="striped-unicorn-face">🦄</span>
            </div>
          </div>
        </div>
      ) : null}

      <header className="hero">
        <div>
          <h1>Mutinynet</h1>
          <p className="hero-sub">Hot wallet · first visit = new keys · all local</p>
        </div>
        <span className="badge pulse-badge">{chainLine}</span>
      </header>

      {err ? <div className="err strip">{err}</div> : null}

      <section className="card balance-card">
        <div className="card-head">
          <h2>Balance</h2>
          <div className="card-actions">
            <button type="button" className="btn-ghost" disabled={scanning} onClick={() => void runScan()}>
              {scanning ? "Scanning…" : "Refresh"}
            </button>
            <button
              type="button"
              className={expectIncoming ? "btn-ghost btn-ghost--on" : "btn-ghost"}
              disabled={scanning}
              onClick={() => setExpectIncoming((v) => !v)}
            >
              {expectIncoming ? "Stop waiting" : "Wait for payment"}
            </button>
          </div>
        </div>
        <div className="balance-big">{satsToBtc(totalSats)}</div>
        <div className="unit">BTC (signet) · {utxos.length} UTXO{utxos.length === 1 ? "" : "s"}</div>
        {lastScan ? <div className="scan-meta">Last scan: {lastScan}</div> : null}
        {expectIncoming ? <div className="scan-meta scan-meta--live">Auto-refresh every {EXPECT_POLL_MS / 1000}s (max 20 min)</div> : null}
      </section>

      <section className="card receive-card">
        <h2>Receive</h2>
        <p className="addr mono">{receiveAddr}</p>
        <button type="button" className="btn btn-receive" onClick={() => void onCopyReceive()}>
          Copy address
        </button>
      </section>

      <section className="card send-card">
        <h2>Send</h2>
        <label className="lbl" htmlFor="to">
          To
        </label>
        <input id="to" className="inp" type="text" value={sendTo} onChange={(e) => setSendTo(e.target.value)} placeholder="tb1…" />
        <label className="lbl" htmlFor="amt">
          Amount (BTC)
        </label>
        <input
          id="amt"
          className="inp"
          type="text"
          inputMode="decimal"
          value={sendBtc}
          onChange={(e) => setSendBtc(e.target.value)}
          placeholder="0.0001"
        />
        <button
          type="button"
          className={`btn btn-launch ${sending ? "btn-launch--arming" : ""}`}
          disabled={sending || utxos.length === 0}
          onClick={() => void onSend()}
        >
          <span className="btn-launch-icon">☢</span>
          {sending ? "ARMING…" : "LAUNCH PAYMENT"}
        </button>
        {utxos.length === 0 ? <p className="hint">Fund your receive address, then Refresh or turn on Wait for payment.</p> : null}
      </section>

      <section className="card">
        <h2>UTXOs</h2>
        {utxos.length === 0 ? (
          <p className="hint">None yet.</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>TXID</th>
                  <th>v</th>
                  <th>BTC</th>
                </tr>
              </thead>
              <tbody>
                {utxos.map((u) => (
                  <tr key={`${u.txid}:${u.vout}`}>
                    <td className="truncate mono" title={u.txid}>
                      {u.txid}
                    </td>
                    <td>{u.vout}</td>
                    <td className="mono">{u.amountBtc}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <p className="fineprint version-foot" data-app-version={versionSummary()} title={versionSummary()}>
        <span className="version-pill mono">
          Wallet {appVersion()} · build {appBuildTime()}
        </span>
        <br />
        12-word seed is stored in this browser only (not encrypted). Scan uses <code>scantxoutset</code> (confirmed UTXOs
        only). API:{" "}
        <a href="http://3.231.31.216:3000/docs" target="_blank" rel="noreferrer">
          docs
        </a>
      </p>
      </div>
      {createPortal(<BuildStampCorner />, document.body)}
    </>
  );
}
