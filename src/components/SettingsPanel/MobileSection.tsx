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
} from "../../store/mobilePairings";

const QR_TTL_SECONDS = 60;
const RELAY_URL_PLACEHOLDER = "wss://relay.tempest.dev"; // real value lands in Phase 1

interface QrPayload {
  v: 0;
  relay_url: string;
  session_id: string;
  laptop_pubkey: string;
  name: string;
  pairing_secret: string;
}

function randomBase64(bytes: number): string {
  const buf = new Uint8Array(bytes);
  crypto.getRandomValues(buf);
  let s = "";
  for (const b of buf) s += String.fromCharCode(b);
  return btoa(s);
}

function newPayload(name: string): QrPayload {
  return {
    v: 0,
    relay_url: RELAY_URL_PLACEHOLDER,
    session_id: crypto.randomUUID(),
    laptop_pubkey: randomBase64(32), // placeholder; Phase 1 emits a real ed25519 pubkey
    name,
    pairing_secret: randomBase64(24), // single-use, 60s TTL
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

export function MobileSection() {
  const { deviceName, paired } = useMobileState();
  const [payload, setPayload] = useState<QrPayload | null>(null);
  const [generatedAt, setGeneratedAt] = useState<number | null>(null);
  const [now, setNow] = useState<number>(() => Date.now());
  const [svg, setSvg] = useState<string>("");
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const nameInputRef = useRef<HTMLInputElement>(null);

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
    if (!payload) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [payload]);

  // Regenerate the QR SVG whenever the payload changes.
  useEffect(() => {
    if (!payload) { setSvg(""); return; }
    QRCode.toString(JSON.stringify(payload), {
      type: "svg",
      errorCorrectionLevel: "M",
      margin: 1,
      color: { dark: "#ffffff", light: "#00000000" },
    })
      .then(setSvg)
      .catch(() => setSvg(""));
  }, [payload]);

  const remaining = useMemo(() => {
    if (!generatedAt) return 0;
    return QR_TTL_SECONDS - Math.floor((now - generatedAt) / 1000);
  }, [generatedAt, now]);

  const expired = payload !== null && remaining <= 0;

  const generate = () => {
    const name = (deviceName || "").trim() || "Tempest desktop";
    setPayload(newPayload(name));
    setGeneratedAt(Date.now());
    setNow(Date.now());
  };

  const cancel = () => {
    setPayload(null);
    setGeneratedAt(null);
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

        {payload ? (
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
              <div className="sp-mobile-qr-actions">
                <button className="sp-mobile-btn" onClick={generate}>
                  <RefreshCw size={12} />
                  {expired ? "Generate new QR" : "Regenerate"}
                </button>
                {!expired && (
                  <button className="sp-mobile-btn sp-mobile-btn--ghost" onClick={cancel}>
                    <X size={12} />
                    Cancel
                  </button>
                )}
              </div>
            </div>
          </div>
        ) : (
          <button className="sp-mobile-btn sp-mobile-btn--primary" onClick={generate}>
            Generate pairing QR
          </button>
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
