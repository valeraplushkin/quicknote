import { useCallback, useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import "../tokens.css";
import "../global.css";

const win = getCurrentWebviewWindow();
const hideThis = () => invoke("hide_window", { label: win.label });

interface Note {
  id: string;
  text: string;
  createdAt: string;
  updatedAt: string;
  pinned: boolean;
}

function getTitle(text: string): string {
  const line = text.split("\n").find((l) => l.trim() !== "");
  return line?.trim() ?? "Без названия";
}

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60_000);
  const h = Math.floor(diff / 3_600_000);
  const d = Math.floor(diff / 86_400_000);
  if (m < 1) return "только что";
  if (m < 60) return `${m}м назад`;
  if (h < 24) return `${h}ч назад`;
  if (d === 1) return "вчера";
  return `${d}д назад`;
}

const PinIcon = ({ size = 15 }: { size?: number }) => (
  <svg
    viewBox="0 0 24 24"
    width={size}
    height={size}
    fill="none"
    stroke="currentColor"
    strokeWidth={2}
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <line x1="12" y1="17" x2="12" y2="22" />
    <path d="M5 17h14l-1.5-1.5a3 3 0 0 1-.88-2.12V8a4.5 4.5 0 0 0-9 0v5.38a3 3 0 0 1-.88 2.12L5 17z" />
  </svg>
);

export default function NotesList() {
  const [notes, setNotes] = useState<Note[]>([]);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [selectedIndex, setSelectedIndex] = useState(-1);

  // Refs to avoid stale closures in the keyboard listener
  const notesRef = useRef<Note[]>([]);
  const selIdxRef = useRef(-1);
  const rowRefs = useRef<(HTMLDivElement | null)[]>([]);
  notesRef.current = notes;
  selIdxRef.current = selectedIndex;

  const loadNotes = useCallback(async () => {
    try {
      const data = await invoke<Note[]>("get_all_notes");
      setNotes(data);
      setSelectedIndex(data.length > 0 ? 0 : -1);
    } catch (err) {
      console.error("get_all_notes failed:", err);
    }
  }, []);

  // Scroll selected row into view when index changes
  useEffect(() => {
    rowRefs.current[selectedIndex]?.scrollIntoView({ block: "nearest" });
  }, [selectedIndex]);

  useEffect(() => {
    loadNotes();

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.preventDefault(); hideThis(); return; }
      const ns = notesRef.current;
      if (ns.length === 0) return;
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIndex((i) => Math.min(i + 1, ns.length - 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIndex((i) => Math.max(i - 1, 0));
      } else if (e.key === "Enter") {
        e.preventDefault();
        const idx = selIdxRef.current;
        if (idx >= 0 && idx < ns.length) {
          invoke("open_note_for_edit", { id: ns[idx].id, text: ns[idx].text, pinned: ns[idx].pinned });
        }
      }
    };
    document.addEventListener("keydown", onKey);

    let unlistenFocus: (() => void) | null = null;
    win.listen("tauri://focus", loadNotes).then((fn) => { unlistenFocus = fn; });

    return () => {
      document.removeEventListener("keydown", onKey);
      unlistenFocus?.();
    };
  }, [loadNotes]);

  const handleDelete = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    try {
      await invoke("delete_note", { id });
      setNotes((prev) => prev.filter((n) => n.id !== id));
    } catch (err) {
      console.error("delete_note failed:", err);
    }
  };

  const handleTogglePin = async (e: React.MouseEvent, note: Note) => {
    e.stopPropagation();
    try {
      if (note.pinned) {
        await invoke("unpin_note", { id: note.id });
      } else {
        await invoke("pin_note", { id: note.id });
      }
      await loadNotes();
    } catch (err) {
      console.error("pin/unpin failed:", err);
    }
  };

  const handleClickNote = async (note: Note) => {
    await invoke("open_note_for_edit", { id: note.id, text: note.text, pinned: note.pinned });
  };

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
      {/* Floating card — box-shadow ring avoids transparent-corner artifacts */}
      <div
        style={{
          position: "absolute",
          inset: 7,
          background: "var(--color-card-bg)",
          backdropFilter: "var(--glass-blur-card)",
          WebkitBackdropFilter: "var(--glass-blur-card)",
          borderRadius: 15,
          boxShadow: "var(--shadow-card)",
          border: "var(--border-card)",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          animation: "qn-rise 0.22s cubic-bezier(0.16, 1, 0.3, 1)",
        }}
      >
        {/* Header — drag region */}
        <div
          data-tauri-drag-region
          style={{
            display: "flex",
            alignItems: "center",
            padding: "20px 22px 4px",
            flexShrink: 0,
            cursor: "default",
          }}
        >
          <span
            data-tauri-drag-region
            style={{
              flex: 1,
              fontSize: 22,
              fontWeight: 800,
              color: "var(--color-text-primary)",
              letterSpacing: "-0.4px",
              pointerEvents: "none",
              lineHeight: 1.1,
            }}
          >
            Заметки
            {notes.length > 0 && (
              <span
                style={{
                  marginLeft: 8,
                  fontSize: 14,
                  fontWeight: 400,
                  color: "var(--color-text-time)",
                }}
              >
                {notes.length}
              </span>
            )}
          </span>

          <button
            onClick={() => hideThis()}
            title="Закрыть"
            style={{
              background: "none",
              border: "none",
              padding: "4px 4px",
              width: 28,
              height: 28,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 14,
              color: "var(--color-text-time)",
              cursor: "pointer",
              borderRadius: 8,
              lineHeight: 1,
              flexShrink: 0,
            }}
          >
            ✕
          </button>
        </div>

        {/* Note list */}
        <div
          style={{
            flex: 1,
            overflowY: "auto",
            padding: "14px 22px 16px",
            display: "flex",
            flexDirection: "column",
            gap: 10,
          }}
        >
          {notes.length === 0 ? (
            <div
              style={{
                padding: "40px 20px",
                textAlign: "center",
                color: "var(--color-text-muted)",
                fontSize: 14,
                lineHeight: 1.6,
              }}
            >
              Нет заметок.
              <br />
              <span style={{ fontSize: 12, color: "var(--color-text-time)" }}>
                Нажмите Ctrl+N чтобы создать первую.
              </span>
            </div>
          ) : (
            notes.map((note, index) => {
              const isHovered = hoveredId === note.id;
              const isSelected = selectedIndex === index;
              const isPinned = note.pinned;

              return (
                <div
                  key={note.id}
                  ref={(el) => { rowRefs.current[index] = el; }}
                  onMouseEnter={() => { setHoveredId(note.id); setSelectedIndex(index); }}
                  onMouseLeave={() => setHoveredId(null)}
                  onClick={() => handleClickNote(note)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    padding: "14px 16px",
                    borderRadius: "var(--radius-row)",
                    background: isPinned
                      ? "var(--color-row-selected-bg)"
                      : "var(--color-row-bg)",
                    border: isPinned
                      ? "var(--border-row-selected)"
                      : isSelected
                      ? "1px solid rgba(99, 102, 241, 0.35)"
                      : "var(--border-row)",
                    boxShadow: isPinned && isSelected
                      ? "var(--shadow-row-selected), 0 0 0 3px rgba(99, 102, 241, 0.18)"
                      : isPinned
                      ? "var(--shadow-row-selected)"
                      : isSelected
                      ? "0 0 0 3px rgba(99, 102, 241, 0.12)"
                      : "none",
                    cursor: "pointer",
                    transition: "background 0.12s, border-color 0.12s, box-shadow 0.12s",
                    flexShrink: 0,
                  }}
                >
                  {/* Pin toggle — always occupies 15px width */}
                  <button
                    onClick={(e) => handleTogglePin(e, note)}
                    title={isPinned ? "Открепить" : "Взять в работу"}
                    style={{
                      background: "none",
                      border: "none",
                      padding: 0,
                      margin: 0,
                      width: 15,
                      height: 15,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      cursor: "pointer",
                      flexShrink: 0,
                      color: isPinned ? "var(--color-accent)" : "var(--color-text-pin)",
                      opacity: isPinned ? 1 : 0.28,
                      transition: "opacity 0.15s, color 0.15s",
                    }}
                  >
                    <PinIcon size={15} />
                  </button>

                  {/* Blue dot for pinned / transparent spacer */}
                  <span
                    style={{
                      width: 7,
                      height: 7,
                      borderRadius: "50%",
                      background: isPinned ? "var(--color-accent-dot)" : "transparent",
                      flexShrink: 0,
                    }}
                  />

                  {/* Title */}
                  <span
                    style={{
                      flex: 1,
                      fontSize: 15,
                      fontWeight: isPinned ? 600 : 400,
                      color: "var(--color-text-primary)",
                      overflow: "hidden",
                      whiteSpace: "nowrap",
                      textOverflow: "ellipsis",
                      lineHeight: 1.2,
                    }}
                  >
                    {getTitle(note.text)}
                  </span>

                  {/* Time or delete on hover */}
                  {isHovered ? (
                    <button
                      onClick={(e) => handleDelete(e, note.id)}
                      title="Удалить"
                      style={{
                        background: "none",
                        border: "none",
                        padding: "2px 6px",
                        fontSize: 12,
                        color: "#ef4444",
                        cursor: "pointer",
                        borderRadius: 6,
                        flexShrink: 0,
                        fontFamily: "var(--font)",
                      }}
                    >
                      Удалить
                    </button>
                  ) : (
                    <span
                      style={{
                        fontSize: 13,
                        color: "var(--color-text-time)",
                        flexShrink: 0,
                        whiteSpace: "nowrap",
                      }}
                    >
                      {relativeTime(note.updatedAt)}
                    </span>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
