import { useState, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { X, GitPullRequest, ExternalLink } from "lucide-react";
import { openUrl } from "@tauri-apps/plugin-opener";
import "./PrDialog.css";

const TOKEN_KEY = "tempest-github-token";

interface Props {
  open: boolean;
  remoteUrl: string;
  branch: string;
  onClose: () => void;
}

function parseGitHub(remoteUrl: string): { owner: string; repo: string } | null {
  const normalized = remoteUrl.trim().replace(/\.git$/, "");
  const ssh = normalized.match(/^git@github\.com:([^/]+)\/(.+)$/);
  if (ssh) return { owner: ssh[1], repo: ssh[2] };
  try {
    const u = new URL(normalized);
    if (u.host === "github.com") {
      const parts = u.pathname.replace(/^\//, "").split("/");
      if (parts.length >= 2) return { owner: parts[0], repo: parts[1] };
    }
  } catch {}
  return null;
}

function branchToTitle(branch: string): string {
  return branch
    .replace(/^(feature|fix|chore|feat|bugfix|hotfix)[/_-]/i, "")
    .replace(/[-_]/g, " ")
    .replace(/\b\w/g, c => c.toUpperCase());
}

export function PrDialog({ open, remoteUrl, branch, onClose }: Props) {
  const gh = parseGitHub(remoteUrl);

  const [token, setToken] = useState(() => localStorage.getItem(TOKEN_KEY) ?? "");
  const [tokenInput, setTokenInput] = useState("");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [base, setBase] = useState("main");
  const [creating, setCreating] = useState(false);
  const [prUrl, setPrUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setTitle(branchToTitle(branch));
      setBody("");
      setPrUrl(null);
      setError(null);
    }
  }, [open, branch]);

  const saveToken = useCallback(() => {
    const t = tokenInput.trim();
    if (!t) return;
    localStorage.setItem(TOKEN_KEY, t);
    setToken(t);
    setTokenInput("");
  }, [tokenInput]);

  const createPr = useCallback(async () => {
    if (!gh || !token) return;
    setCreating(true);
    setError(null);
    try {
      const res = await fetch(
        `https://api.github.com/repos/${gh.owner}/${gh.repo}/pulls`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: "application/vnd.github+json",
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ title, body, head: branch, base }),
        }
      );
      const data = await res.json();
      if (!res.ok) {
        setError(data.message ?? `GitHub API error ${res.status}`);
      } else {
        setPrUrl(data.html_url);
      }
    } catch (e) {
      setError(String(e));
    } finally {
      setCreating(false);
    }
  }, [gh, token, title, body, branch, base]);

  if (!open) return null;

  return createPortal(
    <div className="prd-overlay" onClick={onClose}>
      <div className="prd" onClick={e => e.stopPropagation()}>

        <div className="prd-header">
          <GitPullRequest size={14} />
          <span>Open Pull Request</span>
          <button className="prd-close" onClick={onClose}><X size={13} /></button>
        </div>

        {!gh ? (
          <div className="prd-body">
            <p className="prd-note">
              This remote is not GitHub.{" "}
              <button className="prd-link" onClick={() => { openUrl(remoteUrl); onClose(); }}>
                Open remote in browser
              </button>
            </p>
          </div>
        ) : prUrl ? (
          <div className="prd-body prd-body--success">
            <p className="prd-success-label">Pull request created</p>
            <span className="prd-pr-url">{prUrl}</span>
            <button className="prd-open-btn" onClick={() => openUrl(prUrl)}>
              <ExternalLink size={13} />
              Open in browser
            </button>
          </div>
        ) : (
          <div className="prd-body">
            {!token ? (
              <div className="prd-token-section">
                <label className="prd-label">GitHub Personal Access Token</label>
                <p className="prd-hint">Needs <code>repo</code> scope. Saved locally.</p>
                <div className="prd-token-row">
                  <input
                    className="prd-input"
                    type="password"
                    placeholder="ghp_..."
                    value={tokenInput}
                    onChange={e => setTokenInput(e.target.value)}
                    onKeyDown={e => e.key === "Enter" && saveToken()}
                    autoFocus
                  />
                  <button className="prd-save-token" onClick={saveToken} disabled={!tokenInput.trim()}>
                    Save
                  </button>
                </div>
              </div>
            ) : (
              <>
                <div className="prd-field">
                  <label className="prd-label">Title</label>
                  <input className="prd-input" value={title} onChange={e => setTitle(e.target.value)} autoFocus />
                </div>
                <div className="prd-field">
                  <label className="prd-label">Description</label>
                  <textarea
                    className="prd-textarea"
                    value={body}
                    onChange={e => setBody(e.target.value)}
                    rows={4}
                    placeholder="Optional"
                  />
                </div>
                <div className="prd-field">
                  <label className="prd-label">Base branch</label>
                  <input className="prd-input prd-input--narrow" value={base} onChange={e => setBase(e.target.value)} />
                </div>
                {error && <div className="prd-error">{error}</div>}
                <div className="prd-footer">
                  <span className="prd-meta">{gh.owner}/{gh.repo} · {branch}</span>
                  <button className="prd-submit" onClick={createPr} disabled={creating || !title.trim()}>
                    {creating ? "Creating…" : "Create PR"}
                  </button>
                </div>
              </>
            )}
          </div>
        )}

      </div>
    </div>,
    document.body
  );
}
