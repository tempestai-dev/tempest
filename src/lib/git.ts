import type { DiffLine } from "../types/git";

export interface Hunk {
  header: DiffLine;
  lines: DiffLine[];
}

export function buildPrUrl(remoteUrl: string, branch: string): string {
  const normalized = remoteUrl.trim().replace(/\.git$/, "");
  let host = "", path = "";
  const ssh = normalized.match(/^git@([^:]+):(.+)$/);
  if (ssh) { host = ssh[1]; path = ssh[2]; }
  else {
    try { const u = new URL(normalized); host = u.host; path = u.pathname.replace(/^\//, ""); }
    catch { return normalized; }
  }
  const eb = encodeURIComponent(branch);
  if (host === "github.com") return `https://github.com/${path}/compare/${eb}?expand=1`;
  if (host === "gitlab.com" || host.includes("gitlab"))
    return `https://gitlab.com/${path}/-/merge_requests/new?merge_request[source_branch]=${eb}`;
  if (host === "bitbucket.org")
    return `https://bitbucket.org/${path}/pull-requests/new?source=${eb}`;
  return `https://${host}/${path}`;
}

export function statusClass(s: string) {
  if (s === "M") return "status-m";
  if (s === "A") return "status-a";
  if (s === "D") return "status-d";
  if (s === "R") return "status-r";
  return "status-u";
}

export function groupHunks(lines: DiffLine[]): Hunk[] {
  const hunks: Hunk[] = [];
  let cur: Hunk | null = null;
  for (const line of lines) {
    if (line.kind === "hunk") {
      if (cur) hunks.push(cur);
      cur = { header: line, lines: [] };
    } else if (cur) {
      cur.lines.push(line);
    }
  }
  if (cur) hunks.push(cur);
  return hunks;
}
