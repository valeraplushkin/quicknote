import { useCallback, useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import { LogicalSize } from "@tauri-apps/api/dpi";
import "../tokens.css";
import "../global.css";

const win = getCurrentWebviewWindow();
const DRAFT_KEY = "qn_draft_create";

const clearDraft = () => localStorage.removeItem(DRAFT_KEY);
const saveDraft = (text: string) =>
  text ? localStorage.setItem(DRAFT_KEY, text) : clearDraft();

interface CaptureModeRaw {
  mode: string;
  noteId: string | null;
  noteText: string | null;
  notePinned: boolean | null;
  noPinnedNote: boolean;
}

type CaptureMode =
  | { type: "create"; noPinnedNote: boolean }
  | { type: "edit"; noteId: string; noteText: string; notePinned: boolean };

const WIN_OVERHEAD = 58;
const WIN_MIN_H = 120;

export default function Capture() {
  const [text, setText] = useState("");
  const [willPin, setWillPin] = useState(false);
  const [mode, setMode] = useState<CaptureMode>({ type: "create", noPinnedNote: false });
  const [focused, setFocused] = useState(false);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const draftTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // True after close (Escape/save) — next focus is a fresh open, reset willPin.
  // False after the first loadMode call — refocus preserves toggle state.
  const isFreshOpenRef = useRef(true);

  // ── Shared close: marks next focus as fresh, clears draft, hides window ──

  const doClose = useCallback(() => {
    isFreshOpenRef.current = true;
    clearDraft();
    invoke("hide_window", { label: win.label });
  }, []);

  // ── Auto-grow: resize textarea and Tauri window to match content ──────────

  const adjustHeight = useCallback(async () => {
    const ta = textareaRef.current;
    if (!ta) return;

    ta.style.height = "0px";
    const contentH = ta.scrollHeight;
    const maxWinH = Math.floor(window.screen.height * 0.70);
    const maxTaH = maxWinH - WIN_OVERHEAD;
    const taH = Math.max(44, Math.min(contentH, maxTaH));

    ta.style.height = `${taH}px`;
    ta.style.overflowY = contentH > maxTaH ? "auto" : "hidden";

    const winH = Math.max(WIN_MIN_H, Math.min(taH + WIN_OVERHEAD, maxWinH));

    // window.innerWidth = CSS logical pixels of the WebView — always accurate,
    // no IPC call, no race condition with Rust's set_size.
    await win.setSize(new LogicalSize(window.innerWidth, winH));
  }, []);

  useEffect(() => {
    adjustHeight();
  }, [text, adjustHeight]);

  // ── Load mode from Rust every time the window gains OS focus ──────────────

  const loadMode = useCallback(async () => {
    // Read width eagerly on focus — Rust has already called set_size() before
    // emitting the focus event, so outerSize() captures the correct value.
    // Avoids the race where adjustHeight() would read a stale size after
    // a mid-flight reset to 0.
    try {
      const raw = await invoke<CaptureModeRaw>("get_capture_mode");
      const isFresh = isFreshOpenRef.current;
      isFreshOpenRef.current = false;

      if (raw.mode === "edit" && raw.noteId && raw.noteText != null) {
        setMode({ type: "edit", noteId: raw.noteId, noteText: raw.noteText, notePinned: raw.notePinned ?? false });
        setText(raw.noteText);
        setWillPin(false); // edit mode always starts without willPin
        requestAnimationFrame(() => {
          const ta = textareaRef.current;
          if (ta) { ta.focus(); ta.setSelectionRange(ta.value.length, ta.value.length); }
        });
      } else {
        setMode({ type: "create", noPinnedNote: raw.noPinnedNote });
        const draft = localStorage.getItem(DRAFT_KEY) ?? "";
        setText(draft);
        // Only reset willPin on fresh open — not on every refocus.
        // This allows Ctrl+L to toggle correctly when the window stays visible.
        if (isFresh) setWillPin(false);
        requestAnimationFrame(() => {
          const ta = textareaRef.current;
          if (ta) {
            ta.focus();
            ta.setSelectionRange(ta.value.length, ta.value.length);
          }
        });
      }
    } catch (err) {
      console.error("get_capture_mode failed:", err);
    }
  }, []);

  // ── Save + close ──────────────────────────────────────────────────────────

  const saveAndClose = useCallback(async () => {
    const trimmed = text.trim();
    if (!trimmed) { doClose(); return; }
    try {
      if (mode.type === "edit") {
        await invoke("update_note", { id: mode.noteId, text: trimmed });
        if (willPin && !mode.notePinned) await invoke("pin_note", { id: mode.noteId });
      } else {
        const note = await invoke<{ id: string }>("create_note", { text: trimmed });
        if (willPin) await invoke("pin_note", { id: note.id });
      }
      setText("");
      setWillPin(false);
      doClose();
    } catch (err) {
      console.error("save note failed:", err);
    }
  }, [text, mode, willPin, doClose]);

  // ── Unpin (only in edit mode) ─────────────────────────────────────────────

  const unpinAndClose = useCallback(async () => {
    if (mode.type !== "edit") return;
    try { await invoke("unpin_note", { id: mode.noteId }); } catch {}
    setText("");
    setWillPin(false);
    doClose();
  }, [mode, doClose]);

  // ── Keyboard: ESC closes, Enter (without Shift) saves ─────────────────────

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      doClose();
    } else if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      e.stopPropagation();
      saveAndClose();
    } else if (e.code === "KeyL" && e.ctrlKey) {
      // e.code — physical key, works on any keyboard layout
      e.preventDefault();
      e.stopPropagation();
      if (mode.type === "edit" && mode.notePinned) {
        unpinAndClose();
      } else {
        setWillPin((p) => !p);
      }
    }
  };

  // ── OS focus events — NO blur-to-close: window stays open on click-outside ─

  useEffect(() => {
    let active = true;
    let unlistenFocus: (() => void) | null = null;

    win.listen("tauri://focus", () => { if (active) loadMode(); })
      .then((fn) => { if (active) unlistenFocus = fn; else fn(); });

    loadMode();

    return () => {
      active = false;
      unlistenFocus?.();
    };
  }, [loadMode]);

  // ── Persist draft to localStorage while user types (create mode only) ──────

  const handleTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    setText(val);
    if (mode.type === "create") {
      if (draftTimerRef.current) clearTimeout(draftTimerRef.current);
      draftTimerRef.current = setTimeout(() => saveDraft(val), 300);
    }
  };

  const isEdit = mode.type === "edit";

  const placeholder = isEdit
    ? "Редактировать задачу…"
    : mode.noPinnedNote
    ? "Нет задачи в работе — начните печатать…"
    : "Запиши мысль…";

  return (
    <div
      style={{
        position: "relative",
        width: "100%",
        height: "100%",
        background: "rgba(200, 214, 238, 0.50)",
        backdropFilter: "blur(24px)",
        WebkitBackdropFilter: "blur(24px)",
        overflow: "visible",
        fontFamily: "var(--font)",
      }}
    >
      <div
        data-tauri-drag-region
        style={{
          position: "absolute",
          inset: 5,
          background: "var(--color-card-bg)",
          backdropFilter: "var(--glass-blur-popup)",
          WebkitBackdropFilter: "var(--glass-blur-popup)",
          borderRadius: 15,
          boxShadow: "var(--shadow-popup)",
          border: "var(--border-card)",
          display: "flex",
          flexDirection: "column",
          padding: "8px 8px 2px",
          animation: "qn-rise 0.22s cubic-bezier(0.16, 1, 0.3, 1)",
        }}
      >
        <textarea
          ref={textareaRef}
          value={text}
          onChange={handleTextChange}
          onKeyDown={handleKeyDown}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          placeholder={placeholder}
          style={{
            resize: "none",
            border: focused ? "var(--border-input-focus)" : "var(--border-input)",
            outline: "none",
            borderRadius: "var(--radius-row)",
            background: "var(--color-input-bg)",
            boxShadow: focused ? "var(--shadow-input-focus)" : "var(--shadow-input)",
            padding: "14px 16px",
            fontSize: 16,
            lineHeight: 1.55,
            color: "var(--color-text-body)",
            caretColor: "var(--color-accent)",
            fontFamily: "var(--font)",
            transition: "border-color 0.15s ease, box-shadow 0.15s ease",
            userSelect: "text",
            overflowY: "hidden",
            minHeight: 116,
          }}
        />

        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "5px",
            flexShrink: 0,
          }}
        >
          {isEdit && mode.type === "edit" && mode.notePinned ? (
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 4,
                  fontSize: 11,
                  fontWeight: 600,
                  color: "var(--color-accent)",
                  background: "rgba(99, 102, 241, 0.10)",
                  padding: "3px 9px",
                  borderRadius: "var(--radius-btn)",
                }}
              >
                <span
                  style={{
                    width: 6,
                    height: 6,
                    borderRadius: "50%",
                    background: "var(--color-accent)",
                    flexShrink: 0,
                  }}
                />
                В работе
              </span>
              <button
                tabIndex={-1}
                onClick={unpinAndClose}
                style={{
                  background: "none",
                  border: "none",
                  padding: "2px 4px",
                  fontSize: 11,
                  color: "var(--color-text-muted)",
                  cursor: "pointer",
                  borderRadius: 4,
                  fontFamily: "var(--font)",
                }}
              >
                Открепить
              </button>
            </div>
          ) : (
            <button
              tabIndex={-1}
              onClick={() => setWillPin((p) => !p)}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 5,
                background: willPin ? "rgba(99, 102, 241, 0.10)" : "transparent",
                border: "none",
                padding: "3px 9px",
                fontSize: 11,
                fontWeight: willPin ? 600 : 400,
                cursor: "pointer",
                borderRadius: "var(--radius-btn)",
                color: willPin ? "var(--color-accent)" : "var(--color-text-muted)",
                fontFamily: "var(--font)",
                transition: "background 0.15s, color 0.15s",
              }}
            >
              {willPin && (
                <span
                  style={{
                    width: 6,
                    height: 6,
                    borderRadius: "50%",
                    background: "var(--color-accent)",
                    flexShrink: 0,
                  }}
                />
              )}
              {willPin ? "В работе" : "Взять в работу"}
            </button>
          )}

          <span
            style={{
              fontSize: 12,
              color: "var(--color-text-muted)",
              whiteSpace: "nowrap",
              flexShrink: 0,
            }}
          >
            Enter — сохранить&nbsp;·&nbsp;Esc — закрыть
          </span>
        </div>
      </div>
    </div>
  );
}
