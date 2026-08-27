import { useEffect, useMemo, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import QRCode from "qrcode";
import { Smartphone, Pencil, Trash2, RefreshCw, X } from "lucide-react";
import { Tooltip } from "../Tooltip";
import {
  useMobileState,
  setDeviceName,
  forgetPairedPhone,
  renamePairedPhone,
  addPairedPhone,
} from "../../store/mobilePairings";
import { b64, fingerprint, newKeyPair, randomBytes } from "@tempest/crypto";
import { runLaptopPairing, type PairStatus } from "../../lib/pairing/relayClient";
import { registerBridge } from "../../lib/mobileBridge/registry";

const QR_TTL_SECONDS = 60;

interface QrPayload {
  v: 1;
  relay_url: string;
  session_id: string;
  laptop_pubkey: string;
  name: string;
  pairing_secret: string;
}

interface TunnelInfo {
  wss_url: string;
  local_port: number;
}

interface LivePairing {
  payload: QrPayload;
  laptopSecretkey: Uint8Array;
  laptopPubkey: Uint8Array;
  pairingSecret: Uint8Array;
  cancel: () => void;
}

function newLivePairing(name: string, relayUrl: string): LivePairing {
  const kp = newKeyPair();
  const pairingSecret = randomBytes(32);
  const sessionId = crypto.randomUUID();
  const payload: QrPayload = {
    v: 1,
    relay_url: relayUrl,
    session_id: sessionId,
    laptop_pubkey: b64.enc(kp.publicKey),
    name,
    pairing_secret: b64.enc(pairingSecret),
  };
  return {
    payload,
    laptopSecretkey: kp.secretKey,
    laptopPubkey: kp.publicKey,
    pairingSecret,
    cancel: () => {},
  };
}

function formatCountdown(remaining: number): string {
  const s = Math.max(0, remaining);
  const mm = Math.floor(s / 60);
  const ss = s % 60;
  return `${mm}:${ss.toString().padStart(2, "0")}`;
}

function relativePairedAt(ts: number): string {
  const d = Date.now() - ts;
  if (d < 60_000) return "just now";
  if (d < 3_600_000) return `${Math.floor(d / 60_000)}m ago`;
  if (d < 86_400_000) return `${Math.floor(d / 3_600_000)}h ago`;
  return `${Math.floor(d / 86_400_000)}d ago`;
}

type UiStatus = PairStatus | "opening_tunnel";

function statusLabel(s: UiStatus): string {
  switch (s) {
    case "opening_tunnel": return "Opening tunnel…";
    case "connecting": return "Connecting to relay…";
    case "waiting_for_phone": return "Waiting for phone to scan…";
    case "phone_connected": return "Phone connected — verifying…";
    case "handshaking": return "Handshaking…";
    case "paired": return "Paired.";
    case "expired": return "QR expired.";
    case "error": return "Pairing failed.";
  }
}

export function MobileSection() {
  const { deviceName, paired } = useMobileState();
  const [live, setLive] = useState<LivePairing | null>(null);
  const [generatedAt, setGeneratedAt] = useState<number | null>(null);
  const [now, setNow] = useState<number>(() => Date.now());
  const [svg, setSvg] = useState<string>("");
  const [status, setStatus] = useState<UiStatus | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const nameInputRef = useRef<HTMLInputElement>(null);
  const activeCancelRef = useRef<(() => void) | null>(null);

  // Seed the device name from the OS hostname on first mount if the user
  // hasn't set one yet. Cheap Tauri call; failures are non-fatal.
  useEffect(() => {
    if (deviceName) return;
    invoke<string>("get_hostname")
      .then((h) => { if (h) setDeviceName(h); })
      .catch(() => {});
  }, [deviceName]);

  // Countdown tick. Only runs while a QR is live.
  useEffect(() => {
    if (!live) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [live]);

  // Regenerate the QR SVG whenever the payload changes.
  useEffect(() => {
    if (!live) { setSvg(""); return; }
    QRCode.toString(JSON.stringify(live.payload), {
      type: "svg",
      errorCorrectionLevel: "M",
      margin: 1,
      color: { dark: "#ffffff", light: "#00000000" },
    })
      .then(setSvg)
      .catch(() => setSvg(""));
  }, [live]);

  useEffect(() => () => activeCancelRef.current?.(), []);

  const remaining = useMemo(() => {
    if (!generatedAt) return 0;
    return QR_TTL_SECONDS - Math.floor((now - generatedAt) / 1000);
  }, [generatedAt, now]);

  const expired = live !== null && remaining <= 0 && status !== "paired";

  const cleanupLive = () => {
    activeCancelRef.current?.();
    activeCancelRef.current = null;
  };

  const generate = async () => {
    cleanupLive();
    setErrorMsg(null);
    setStatus("opening_tunnel");

    let tunnel: TunnelInfo;
    try {
      tunnel = await invoke<TunnelInfo>("start_pairing_relay");
    } catch (e) {
      const msg = typeof e === "string" ? e : (e as Error)?.message || String(e);
      setErrorMsg(`Tunnel failed: ${msg}`);
      setStatus("error");
      return;
    }

    const name = (deviceName || "").trim() || "Tempest desktop";
    const l = newLivePairing(name, tunnel.wss_url);
    setLive(l);
    setGeneratedAt(Date.now());
    setNow(Date.now());
    setStatus("connecting");

    // Laptop dials the router via loopback — no reason to route our own
    // pairing traffic through cloudflared. QR still carries the tunnel URL
    // for the phone.
    const laptopRelayUrl = `ws://127.0.0.1:${tunnel.local_port}/ws`;

    const run = runLaptopPairing({
      relayUrl: laptopRelayUrl,
      session: {
        sessionId: l.payload.session_id,
        pairingSecret: l.pairingSecret,
        laptopPubkey: l.laptopPubkey,
        laptopSecretkey: l.laptopSecretkey,
      },
      ttlMs: QR_TTL_SECONDS * 1000,
      onStatus: (s) => setStatus(s),
      keepAliveOnPair: true,
    });
    activeCancelRef.current = run.cancel;

    run.result
      .then((r) => {
        const record = addPairedPhone({
          name: "Paired phone",
          pubkey: b64.enc(r.phonePubkey),
          fingerprint: fingerprint(r.phonePubkey),
        });
        // Hand the still-open WS off to the RPC bridge so the phone can
        // start querying agents / queues / permissions immediately.
        if (r.ws) registerBridge(record.id, r.ws, r.sessionKey);
        // Give the "Paired." label a beat, then close the panel.
        setTimeout(() => {
          setLive(null);
          setGeneratedAt(null);
          setStatus(null);
        }, 800);
      })
      .catch((e: Error) => {
        setErrorMsg(e.message);
      });
  };

  const cancel = () => {
    cleanupLive();
    setLive(null);
    setGeneratedAt(null);
    setStatus(null);
    setErrorMsg(null);
  };

  const startRename = (id: string, current: string) => {
    setRenamingId(id);
    setRenameValue(current);
  };
  const commitRename = () => {
    if (renamingId && renameValue.trim()) renamePairedPhone(renamingId, renameValue.trim());
    setRenamingId(null);
    setRenameValue("");
  };

  return (
    <div className="sp-section">
      <div className="sp-section-heading">Mobile</div>
      <p className="sp-section-desc">
        Pair a phone to drive Tempest from anywhere. Scan this QR from the
        Tempest mobile app. Payload is single-use and expires after {QR_TTL_SECONDS} seconds.
      </p>

      <div className="sp-mobile-pair">
        <div className="sp-mobile-name-row">
          <label className="sp-mobile-name-label" htmlFor="sp-mobile-name">Device name</label>
          <input
            id="sp-mobile-name"
            ref={nameInputRef}
            className="sp-mobile-name-input"
            type="text"
            value={deviceName}
            onChange={(e) => setDeviceName(e.target.value)}
            onKeyDown={(e) => e.stopPropagation()}
            placeholder="Tempest desktop"
          />
        </div>

        {live ? (
          <div className={`sp-mobile-qr-card${expired ? " sp-mobile-qr-card--expired" : ""}`}>
            <div className="sp-mobile-qr-wrap">
              <div
                className="sp-mobile-qr"
                aria-label="Pairing QR code"
                dangerouslySetInnerHTML={{ __html: svg }}
              />
              {expired && (
                <div className="sp-mobile-qr-overlay">
                  <span>Expired</span>
                </div>
              )}
            </div>
            <div className="sp-mobile-qr-meta">
              {!expired ? (
                <span className="sp-mobile-qr-timer">Expires in {formatCountdown(remaining)}</span>
              ) : (
                <span className="sp-mobile-qr-timer sp-mobile-qr-timer--expired">Expired</span>
              )}
              {status && (
                <span className="sp-mobile-qr-status">{statusLabel(status)}</span>
              )}
              {errorMsg && (
                <span className="sp-mobile-qr-error">Error: {errorMsg}</span>
              )}
              <div className="sp-mobile-qr-actions">
                <button className="sp-mobile-btn" onClick={generate}>
                  <RefreshCw size={12} />
                  {expired || errorMsg ? "Generate new QR" : "Regenerate"}
                </button>
                {!expired && status !== "paired" && (
                  <button className="sp-mobile-btn sp-mobile-btn--ghost" onClick={cancel}>
                    <X size={12} />
                    Cancel
                  </button>
                )}
              </div>
            </div>
          </div>
        ) : status === "opening_tunnel" ? (
          <div className="sp-mobile-qr-card">
            <div className="sp-mobile-qr-meta">
              <span className="sp-mobile-qr-status">{statusLabel("opening_tunnel")}</span>
              <span className="sp-mobile-qr-status">
                First run downloads a tunnel URL from Cloudflare — should take under 10s.
              </span>
            </div>
          </div>
        ) : (
          <>
            <button className="sp-mobile-btn sp-mobile-btn--primary" onClick={generate}>
              Generate pairing QR
            </button>
            {errorMsg && (
              <div className="sp-mobile-qr-error" style={{ marginTop: 10 }}>
                {errorMsg}
              </div>
            )}
          </>
        )}
      </div>

      <div className="sp-mobile-list-heading">Paired phones</div>
      {paired.length === 0 ? (
        <div className="sp-mobile-empty">
          <Smartphone size={16} />
          <span>No phones paired yet.</span>
        </div>
      ) : (
        <div className="sp-mobile-list">
          {paired.map((p) => {
            const isRenaming = renamingId === p.id;
            return (
              <div key={p.id} className="sp-mobile-row">
                <div className="sp-mobile-row-left">
                  <Smartphone size={14} className="sp-mobile-row-icon" />
                  <div className="sp-mobile-row-text">
                    {isRenaming ? (
                      <input
                        className="sp-mobile-row-rename"
                        autoFocus
                        value={renameValue}
                        onChange={(e) => setRenameValue(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") { e.preventDefault(); commitRename(); }
                          if (e.key === "Escape") { setRenamingId(null); setRenameValue(""); }
                          e.stopPropagation();
                        }}
                        onBlur={commitRename}
                      />
                    ) : (
                      <span className="sp-mobile-row-name">{p.name}</span>
                    )}
                    <span className="sp-mobile-row-sub">
                      {p.fingerprint} · paired {relativePairedAt(p.pairedAt)}
                    </span>
                  </div>
                </div>
                <div className="sp-mobile-row-right">
                  <Tooltip content="Rename" placement="top">
                    <button
                      className="sp-mobile-icon-btn"
                      onClick={() => startRename(p.id, p.name)}
                    >
                      <Pencil size={12} />
                    </button>
                  </Tooltip>
                  <Tooltip content="Forget this phone" placement="top">
                    <button
                      className="sp-mobile-icon-btn sp-mobile-icon-btn--danger"
                      onClick={() => forgetPairedPhone(p.id)}
                    >
                      <Trash2 size={12} />
                    </button>
                  </Tooltip>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
