import { Channel } from "@tauri-apps/api/core";
import { getWorkState, setWorkState } from "./workState";

// Byte-quiet timer: ms with no PTY output before a working session is marked done.
const QUIET_MS = 5000;
// Dead zone: ms after user presses Enter during which "done" signals are suppressed.
const DEAD_ZONE_MS = 300;
// Hard ceiling: max ms in "working" state before forcing done (safety net for agents
// that emit keepalive bytes indefinitely and never reach a true quiet window).
const CEIL_MS = 12_000;
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

interface SessionRecord {
  isAgent: boolean;
  onDone: (() => void) | null;
  onChunk: ((data: string) => void) | null;
  buffer: string[];
  bufferBytes: number;
  quietTimer: ReturnType<typeof setTimeout> | null;
  ceilTimer: ReturnType<typeof setTimeout> | null;
  deadZoneUntil: number;
  // Tail of the previous chunk kept for cross-chunk OSC/CSI sequence reassembly.
  seqTail: string;
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
  ) {
    const record: SessionRecord = {
      isAgent,
      onDone: onDone ?? null,
      onChunk: onChunk ?? null,
      buffer: [],
      bufferBytes: 0,
      quietTimer: null,
      ceilTimer: null,
      deadZoneUntil: 0,
      seqTail: "",
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
    setWorkState(sessionId, "working");
    this.scheduleQuiet(record, sessionId);
    this.scheduleCeiling(record, sessionId);
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
          // Plain OSC 9 notification — e.g. Claude Code "Send notification" on turn end.
          // Source: iTerm2 Proprietary Escape Codes.
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

    // Re-arm the byte-quiet fallback timer on any output while still working.
    // If markDone already fired above, getWorkState returns "done" and this is a no-op.
    if (getWorkState(sessionId) === "working") {
      this.scheduleQuiet(record, sessionId);
    }
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
    }
  }

  private scheduleQuiet(record: SessionRecord, sessionId: string) {
    if (record.quietTimer !== null) clearTimeout(record.quietTimer);
    record.quietTimer = setTimeout(() => {
      record.quietTimer = null;
      this.markDone(record, sessionId);
    }, QUIET_MS);
  }

  // Arms a hard ceiling: if the session is still "working" after CEIL_MS, force done.
  // The ceiling bypasses the dead zone — by 12s we are well past the 300ms submit echo.
  private scheduleCeiling(record: SessionRecord, sessionId: string) {
    if (record.ceilTimer !== null) clearTimeout(record.ceilTimer);
    record.ceilTimer = setTimeout(() => {
      record.ceilTimer = null;
      if (getWorkState(sessionId) === "working") {
        setWorkState(sessionId, "done");
        record.onDone?.();
      }
    }, CEIL_MS);
  }
}

export const sessionManager = new SessionManager();
