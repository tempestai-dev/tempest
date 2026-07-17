import { Channel } from "@tauri-apps/api/core";
import { getWorkState, setWorkState, setAttention } from "./workState";

// Byte-quiet timer: ms with no PTY output before a working session is marked done.
const QUIET_MS = 5000;
// Dead zone: ms after user presses Enter during which "done" signals are suppressed.
const DEAD_ZONE_MS = 300;
// Hard ceiling: max ms in "working" state before forcing done (safety net for agents
// that emit keepalive bytes indefinitely and never reach a true quiet window).
const CEIL_MS = 12_000;
// Minimum bytes received since the last user Enter before the quiet timer or ceiling
// may fire a "done" via heuristic. Gates false-positives during the agent's silent
// pre-output thinking window (e.g. Claude extended thinking before first token).
// Explicit OSC/DEC signals bypass this gate entirely and always fire immediately.
const TURN_STARTED_BYTES = 200;
// Maximum bytes to keep in each session's replay buffer.
const BUFFER_MAX_BYTES = 2 * 1024 * 1024;
// Maximum bytes of tail carried across chunks for OSC/CSI sequence reassembly.
// Keeps in-progress escape sequences that split at a chunk boundary alive until
// the next chunk completes them.
const SEQ_TAIL_MAX = 256;

// Matches a complete OSC sequence terminated by BEL (0x07) or ST (ESC \).
// Capture group 1 is everything between ESC] and the terminator.
// Source: XTerm ctlseqs "Operating System Commands".
const OSC_RE = /\x1b\]([^\x07\x1b]*)(?:\x07|\x1b\\)/g;

// Matches a DEC private mode set (h) or reset (l): ESC [ ? <params> h|l
// Source: XTerm ctlseqs "DEC Private Mode Set/Reset".
const DEC_MODE_RE = /\x1b\[\?([0-9;]+)(h|l)/g;

// Strips ANSI CSI (colors, cursor movement) so numbered options like
// "1.\x1b[32m Yes\x1b[0m" match plain-text regexes below.
const ANSI_CSI_RE = /\x1b\[[0-9;?]*[a-zA-Z]/g;

// Claude Code renders permission prompts as visible terminal text with a
// distinctive numbered-option triad — the first two options are BOTH "Yes"
// (accept / accept-and-remember) and the third is "No":
//   ❯ 1. Yes
//     2. Yes, allow all <tool>/<path> during this session (shift+tab)
//     3. No, and tell Claude what to do differently (esc)
// Two consecutive numbered "Yes" options don't appear in normal output —
// tight enough to be a reliable fingerprint, loose on spacing/wording so
// minor Claude releases don't break it.
// ponytail: text-fingerprint, replace with a structural signal when Claude
//           Code ships one (file upstream).
// Claude Code paints the dialog cell-by-cell. On the wire the surrounding
// whitespace collapses, so the two options land as "1. Yes2.Yes,allow…" —
// no word boundary before OR after "Yes" between the options. We can't use
// \b anywhere near the option markers; use negative lookbehinds to keep out
// of things like "31." or "12.".
const CLAUDE_PERMISSION_RE = /(?<!\d)1\.\s*Yes[\s\S]{0,400}?(?<!\d)2\.\s*Yes/;

// After markDone fires for a Claude session, we re-scan the raw session buffer
// at each of these delays. The permission dialog is often painted in pieces
// AFTER the OSC 9 that trips markDone — sometimes seconds later, because the
// model is still generating the tool-call payload when OSC 9 fires. We fan
// out several delayed rechecks so we catch it regardless of when it lands.
const CLAUDE_PERM_RECHECK_MS = [3000, 8000, 20000];
// Bytes off the tail of the raw buffer to scan on recheck. The full dialog
// is ~1-2 KB; 32 KB is generous and still cheap to strip.
const CLAUDE_PERM_RECHECK_TAIL = 32 * 1024;

interface SessionRecord {
  isAgent: boolean;
  agentHint: string; // CLI command hint e.g. "claude", "gemini" — used for title classification
  onDone: (() => void) | null;
  onChunk: ((data: string) => void) | null;
  buffer: string[];
  bufferBytes: number;
  quietTimer: ReturnType<typeof setTimeout> | null;
  ceilTimer: ReturnType<typeof setTimeout> | null;
  deadZoneUntil: number;
  // Bytes received since the last user Enter, used to gate heuristic timers.
  outputSinceInput: number;
  // Set true on the first user Enter. Gates BEL→attention so a bell emitted
  // before the user has interacted (e.g. at spawn) never rings.
  hasUserInput: boolean;
  // Set true when the agent's OSC 0/2 title indicates it is actively working.
  // While true, heuristic timers (quiet, ceiling) do not fire done — they wait.
  // Cleared on each new user input turn and when a title signals idle.
  senderBusy: boolean;
  // Tail of the previous chunk kept for cross-chunk OSC/CSI sequence reassembly.
  seqTail: string;
  // True once markAttention has fired since the last user Enter. Blocks the
  // Claude permission-prompt fingerprint from re-firing on every repaint
  // while the prompt is still on screen — otherwise focusing the tab clears
  // the bell and the next spinner-repaint chunk stamps it right back on.
  attentionFired: boolean;
  // Rolling cleaned-text window (OSC/CSI stripped) for the Claude permission
  // fingerprint. The dialog is drawn row-by-row with cursor-move CSIs and
  // arrives split across PTY reads, so "1. Yes" and "2. Yes" often land in
  // different chunks. seqTail only carries an in-progress escape sequence
  // (≤256 bytes), which is not enough — we need a chunk-spanning text buffer.
  claudeCleanTail: string;
  // Scheduled rechecks fired at CLAUDE_PERM_RECHECK_MS after markDone for
  // Claude, to catch permission dialogs painted after the OSC 9 that tripped
  // markDone. Cleared on new user input or when attention actually fires.
  permCheckTimers: ReturnType<typeof setTimeout>[];
  listeners: Set<(data: string) => void>;
}

class SessionManager {
  private sessions = new Map<string, SessionRecord>();

  register(
    sessionId: string,
    channel: Channel<{ session_id: string; data: string }>,
    isAgent: boolean,
    onDone?: () => void,
    onChunk?: (data: string) => void,
    agentHint?: string,
  ) {
    const record: SessionRecord = {
      isAgent,
      agentHint: agentHint ?? "",
      onDone: onDone ?? null,
      onChunk: onChunk ?? null,
      buffer: [],
      bufferBytes: 0,
      quietTimer: null,
      ceilTimer: null,
      deadZoneUntil: 0,
      outputSinceInput: 0,
      hasUserInput: false,
      senderBusy: false,
      seqTail: "",
      attentionFired: false,
      claudeCleanTail: "",
      permCheckTimers: [],
      listeners: new Set(),
    };
    this.sessions.set(sessionId, record);
    channel.onmessage = (payload) => this.processChunk(sessionId, payload.data);
  }

  unregister(sessionId: string) {
    const record = this.sessions.get(sessionId);
    if (!record) return;
    if (record.quietTimer !== null) clearTimeout(record.quietTimer);
    if (record.ceilTimer !== null) clearTimeout(record.ceilTimer);
    for (const t of record.permCheckTimers) clearTimeout(t);
    this.sessions.delete(sessionId);
  }

  // Called by TerminalPane on mount. Returns buffered chunks for replay.
  attach(sessionId: string, onData: (data: string) => void): string[] {
    const record = this.sessions.get(sessionId);
    if (!record) return [];
    record.listeners.add(onData);
    return [...record.buffer];
  }

  // Called by TerminalPane on unmount.
  detach(sessionId: string, onData: (data: string) => void) {
    this.sessions.get(sessionId)?.listeners.delete(onData);
  }

  // Called by TerminalPane when the user presses Enter — arms work-done detection.
  markUserInput(sessionId: string) {
    const record = this.sessions.get(sessionId);
    if (!record?.isAgent) return;
    record.deadZoneUntil = Date.now() + DEAD_ZONE_MS;
    record.outputSinceInput = 0;
    record.hasUserInput = true;
    record.senderBusy = false;
    record.attentionFired = false;
    record.claudeCleanTail = "";
    for (const t of record.permCheckTimers) clearTimeout(t);
    record.permCheckTimers = [];
    // New turn starts — any prior attention flag no longer applies.
    setAttention(sessionId, false);
    setWorkState(sessionId, "working");
    this.scheduleQuiet(record, sessionId);
    this.scheduleCeiling(record, sessionId);
  }

  // Called by TerminalPane via term.onTitleChange(). Classifies the title as
  // busy/idle per agent CLI and updates senderBusy accordingly.
  updateTitle(sessionId: string, title: string) {
    const record = this.sessions.get(sessionId);
    if (!record?.isAgent) return;
    const state = this.classifyTitle(record.agentHint, title);
    if (state === "busy") {
      record.senderBusy = true;
    } else if (state === "idle") {
      record.senderBusy = false;
      this.markDone(record, sessionId);
    } else if (state === "attention") {
      record.senderBusy = false;
      this.markAttention(record, sessionId);
    }
    // null = unrecognised title, leave senderBusy unchanged
  }

  // Classify an OSC 0/2 terminal title as busy, idle, or unknown (null).
  // Logic is per CLI — each agent has its own title conventions.
  private classifyTitle(agentHint: string, title: string): "busy" | "idle" | "attention" | null {
    const t = title.trim();
    if (!t) return null;

    if (agentHint === "claude") {
      // Claude Code sets "✳ <task name>" when idle at its prompt.
      // Any other non-alphanumeric leading character is a Braille or Unicode
      // spinner frame emitted while the model is thinking or generating.
      if (/^\s*✳/.test(t)) return "idle";
      if (/^\s*[^\w\s]/.test(t)) return "busy";
      return null;
    }

    if (agentHint === "gemini") {
      // Gemini CLI: "◇ …" = idle, "✦ …" = busy/thinking, "✋ …" = blocked on user.
      if (/^\s*◇/.test(t)) return "idle";
      if (/^\s*✋/.test(t)) return "attention";
      if (/^\s*✦/.test(t)) return "busy";
      return null;
    }

    if (agentHint === "codex") {
      // Codex CLI status labels shown in the title bar.
      //  "Waiting" / "Action Required" → blocked on the user (attention).
      //  "Ready" → prompt idle.
      //  "Working" / "Thinking" or a leading Braille spinner frame → busy.
      if (/\b(Waiting|Action[\s-]?Required)\b/i.test(t)) return "attention";
      if (/\bReady\b/i.test(t)) return "idle";
      if (/\b(Working|Thinking)\b/i.test(t)) return "busy";
      if (/^\s*[⠀-⣿]/.test(t)) return "busy";
      return null;
    }

    return null;
  }

  // Update the per-chunk capture callback (for opencode session ID sniffing).
  setOnChunk(sessionId: string, onChunk: ((data: string) => void) | null) {
    const record = this.sessions.get(sessionId);
    if (record) record.onChunk = onChunk;
  }

  private processChunk(sessionId: string, data: string) {
    const record = this.sessions.get(sessionId);
    if (!record) return;

    // Append to ring buffer, evicting old chunks from the front when over limit.
    record.buffer.push(data);
    record.bufferBytes += data.length;
    while (record.bufferBytes > BUFFER_MAX_BYTES && record.buffer.length > 1) {
      record.bufferBytes -= record.buffer.shift()!.length;
    }

    record.onChunk?.(data);

    if (record.isAgent) {
      record.outputSinceInput += data.length;
      // Prepend the tail saved from the previous chunk so that escape sequences
      // split across chunk boundaries are still matched by the regexes.
      const scan = record.seqTail + data;

      // Save the new tail: everything from the last ESC onwards (up to SEQ_TAIL_MAX
      // bytes) in case the next chunk completes an in-progress sequence.
      const lastEsc = scan.lastIndexOf("\x1b");
      record.seqTail =
        lastEsc !== -1 && lastEsc > scan.length - SEQ_TAIL_MAX
          ? scan.slice(lastEsc)
          : "";

      this.detectSignals(record, sessionId, scan);
    }

    // Deliver to all attached renderers (visible terminal panes).
    for (const listener of record.listeners) {
      listener(data);
    }
  }

  private detectSignals(record: SessionRecord, sessionId: string, scan: string) {
    // --- OSC sequences (XTerm ctlseqs + vendor extension docs) ---
    OSC_RE.lastIndex = 0;
    let m: RegExpExecArray | null;

    while ((m = OSC_RE.exec(scan)) !== null) {
      const parts = m[1].split(";");
      const oscNum = parts[0];

      if (oscNum === "9") {
        if (parts[1] === "4") {
          // OSC 9;4;<state> — ConEmu / Windows Terminal progress bar protocol.
          // Source: ConEmu ANSI docs; Windows Terminal "Progress bar sequences".
          const st = parseInt(parts[2] ?? "0", 10);
          if (st === 0) {
            // State 0 = progress cleared / task complete.
            this.markDone(record, sessionId);
          } else {
            // States 1 (normal), 2 (error), 3 (indeterminate), 4 (paused) = still busy.
            // Previously this was a false-positive done — the plain OSC 9 substring
            // match caught OSC 9;4;3 mid-run and incorrectly marked the session done.
            if (getWorkState(sessionId) !== "working") {
              setWorkState(sessionId, "working");
            }
          }
        } else {
          // Plain OSC 9 notification — e.g. Claude Code "Send notification".
          // Source: iTerm2 Proprietary Escape Codes.
          // Claude Code overloads this for both "turn complete" and permission
          // prompts; distinguishing them happens further down via the rendered
          // text scan for claude, so treat OSC 9 as a "turn ended" hint here.
          this.markDone(record, sessionId);
        }
      } else if (oscNum === "133") {
        // FinalTerm / shell-integration semantic prompts.
        // Source: FinalTerm spec; iTerm2, VTE, WezTerm, Windows Terminal shell-integration docs.
        const code = parts[1];
        if (code === "C") {
          // FTCS_COMMAND_EXECUTED — command began running, shell is now busy.
          if (getWorkState(sessionId) !== "working") {
            setWorkState(sessionId, "working");
          }
        } else if (code === "B" || code === "D") {
          // B = FTCS_COMMAND_START (prompt ready, waiting for input).
          // D = FTCS_COMMAND_FINISHED (command exited, may carry exit code in parts[2]).
          this.markDone(record, sessionId);
        }
      } else if (oscNum === "777" && parts[1] === "notify") {
        // OSC 777;notify — rxvt-unicode / VTE notification dialect.
        // Same semantics as OSC 9: agent is signalling attention / turn complete.
        // Source: urxvt man page; VTE source.
        this.markDone(record, sessionId);
      } else if (oscNum === "1337") {
        // OSC 1337 — iTerm2 proprietary. RequestAttention=yes/fireworks means the
        // agent is explicitly blocked and needs the user's input.
        // Source: iTerm2 "Proprietary Escape Codes" docs.
        if (/^RequestAttention=(yes|fireworks)$/i.test(parts.slice(1).join(";"))) {
          this.markAttention(record, sessionId);
        }
      }
    }

    // --- DEC private mode set/reset: ESC [ ? <params> h|l ---
    DEC_MODE_RE.lastIndex = 0;
    while ((m = DEC_MODE_RE.exec(scan)) !== null) {
      const params = m[1];
      const action = m[2]; // "h" = set/enable, "l" = reset/disable

      if (params === "2004") {
        // Bracketed paste mode — XTerm ctlseqs mode 2004.
        // GNU Readline, zsh ZLE, fish, PSReadLine, and prompt_toolkit all enable
        // bracketed paste when they start reading a line at the prompt and disable
        // it right before executing the command. Many agent CLIs are built on these
        // libraries, so ?2004h reliably signals "back at the input prompt".
        if (action === "h") {
          // Enabled: line editor is now accepting input → agent returned to its prompt.
          this.markDone(record, sessionId);
        } else {
          // Disabled: about to execute → mark busy.
          if (getWorkState(sessionId) !== "working") {
            setWorkState(sessionId, "working");
          }
        }
      } else if (params === "1049" && action === "l") {
        // Leave alternate screen buffer — XTerm ctlseqs mode 1049.
        // Full-screen TUI apps (vim, less, fzf, lazygit) run in the alt screen.
        // Leaving it means the app exited and the shell prompt is about to return.
        this.markDone(record, sessionId);
      }
    }

    // --- Claude Code permission-prompt fingerprint (rendered text) ---
    // Runs after the OSC scan, so an earlier plain OSC 9 → markDone can be
    // upgraded to markAttention here once the numbered-option UI actually
    // renders on screen. Setting attention alongside done (via markAttention)
    // is the whole point of the split state — no double-flip issues.
    if (record.agentHint === "claude") {
      // Accumulate cleaned text across chunks: Claude repaints the permission
      // dialog row-by-row with CSI cursor moves, so "1. Yes" and "2. Yes"
      // frequently land in different PTY reads. Without a rolling buffer the
      // regex only matches on a later single-chunk repaint — which is why the
      // bell used to only appear after the tab was clicked (mount → resize_pty
      // → contiguous repaint). 4 KB comfortably fits the whole dialog.
      const cleanedChunk = scan.replace(OSC_RE, "").replace(ANSI_CSI_RE, "");
      record.claudeCleanTail = (record.claudeCleanTail + cleanedChunk).slice(-4096);
      if (CLAUDE_PERMISSION_RE.test(record.claudeCleanTail)) {
        this.markAttention(record, sessionId);
      }
    }

    // --- Bare BEL (0x07) → attention ---
    // Agent CLIs (Claude Code, etc.) ring the terminal bell when a tool call is
    // blocked waiting for the user's approval. BEL is also the terminator of an
    // OSC sequence, so strip complete OSC sequences first to avoid false rings.
    // Gate to mirror real bell behaviour: only when the user has taken a turn
    // (no spawn-time bells) and the agent is NOT actively working — Claude BELs
    // roughly once a second during its spinner, and those must not ring.
    if (record.hasUserInput && getWorkState(sessionId) !== "working") {
      const bare = scan.replace(OSC_RE, "");
      if (bare.includes("\x07")) {
        this.markAttention(record, sessionId);
      }
    }

    // Re-arm the byte-quiet fallback timer on any output while still working.
    // If markDone already fired above, getWorkState returns "done" and this is a no-op.
    if (getWorkState(sessionId) === "working") {
      this.scheduleQuiet(record, sessionId);
    }
  }

  private markAttention(record: SessionRecord, sessionId: string) {
    if (record.attentionFired) return;
    record.attentionFired = true;
    if (record.quietTimer !== null) { clearTimeout(record.quietTimer); record.quietTimer = null; }
    if (record.ceilTimer !== null) { clearTimeout(record.ceilTimer); record.ceilTimer = null; }
    for (const t of record.permCheckTimers) clearTimeout(t);
    record.permCheckTimers = [];
    // The turn reached a terminal state — process is idle, and the user
    // needs to act. Set both dimensions so downstream consumers see a
    // "done" agent whose tab is also flagged for attention.
    setWorkState(sessionId, "done");
    setAttention(sessionId, true);
    record.onDone?.();
  }

  private markDone(record: SessionRecord, sessionId: string) {
    if (record.quietTimer !== null) {
      clearTimeout(record.quietTimer);
      record.quietTimer = null;
    }
    if (record.ceilTimer !== null) {
      clearTimeout(record.ceilTimer);
      record.ceilTimer = null;
    }
    if (Date.now() < record.deadZoneUntil) return;
    if (getWorkState(sessionId) === "working") {
      setWorkState(sessionId, "done");
      record.onDone?.();
      // Claude: schedule a delayed recheck against the raw buffer, since the
      // permission dialog is often painted after the OSC 9 that just tripped
      // markDone. If the fingerprint shows up within the window, upgrade
      // green→bell. This is what makes the badge correct without waiting for
      // the user to click the tab (which was previously forcing a full repaint
      // via resize_pty and giving the sync-chunk fingerprint scan its shot).
      if (record.agentHint === "claude" && !record.attentionFired) {
        for (const t of record.permCheckTimers) clearTimeout(t);
        record.permCheckTimers = CLAUDE_PERM_RECHECK_MS.map((delay) =>
          setTimeout(() => this.recheckClaudePermission(record, sessionId), delay),
        );
      }
    }
  }

  // Scan the tail of the raw session buffer for the Claude permission dialog.
  // Runs CLAUDE_PERM_RECHECK_MS after markDone. The raw buffer is retained by
  // sessionManager whether or not the tab pane is mounted, so this works for
  // backgrounded tabs (which never get an xterm.js Terminal to inspect).
  private recheckClaudePermission(record: SessionRecord, sessionId: string) {
    if (record.attentionFired) return;
    // Join the last N bytes of the ring buffer, working backwards so we don't
    // stringify megabytes we're going to throw away.
    let raw = "";
    for (let i = record.buffer.length - 1; i >= 0 && raw.length < CLAUDE_PERM_RECHECK_TAIL; i--) {
      raw = record.buffer[i] + raw;
    }
    raw = raw.slice(-CLAUDE_PERM_RECHECK_TAIL);
    const cleaned = raw.replace(OSC_RE, "").replace(ANSI_CSI_RE, "");
    if (CLAUDE_PERMISSION_RE.test(cleaned)) {
      this.markAttention(record, sessionId);
    }
  }

  private scheduleQuiet(record: SessionRecord, sessionId: string) {
    if (record.quietTimer !== null) clearTimeout(record.quietTimer);
    record.quietTimer = setTimeout(() => {
      record.quietTimer = null;
      // Suppress if the agent's title says it is still busy, or if it hasn't
      // produced enough output yet to confirm the turn actually started.
      if (record.senderBusy || record.outputSinceInput < TURN_STARTED_BYTES) {
        this.scheduleQuiet(record, sessionId);
        return;
      }
      this.markDone(record, sessionId);
    }, QUIET_MS);
  }

  // Arms a hard ceiling: if the session is still "working" after CEIL_MS, force done.
  // The ceiling bypasses the dead zone — by 12s we are well past the 300ms submit echo.
  // Suppressed while senderBusy (title says agent is still thinking).
  private scheduleCeiling(record: SessionRecord, sessionId: string) {
    if (record.ceilTimer !== null) clearTimeout(record.ceilTimer);
    record.ceilTimer = setTimeout(() => {
      record.ceilTimer = null;
      if (getWorkState(sessionId) !== "working") return;
      if (record.senderBusy || record.outputSinceInput < TURN_STARTED_BYTES) {
        this.scheduleCeiling(record, sessionId);
        return;
      }
      setWorkState(sessionId, "done");
      record.onDone?.();
    }, CEIL_MS);
  }
}

export const sessionManager = new SessionManager();
