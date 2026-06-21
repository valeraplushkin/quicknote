use std::sync::Mutex;

use serde::Serialize;
use tauri::{AppHandle, LogicalPosition, LogicalSize, Manager, State};

// ── Capture-window mode ───────────────────────────────────────────────────────

/// Passed to the capture window so it knows whether to create or edit a note.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CaptureModeData {
    /// "create" | "edit"
    pub mode: String,
    /// Set in "edit" mode — the note's id.
    pub note_id: Option<String>,
    /// Set in "edit" mode — the note's current text.
    pub note_text: Option<String>,
    /// Set in "edit" mode — whether the note is currently pinned.
    pub note_pinned: Option<bool>,
    /// True when Ctrl+Shift+N was pressed but no pinned note exists.
    pub no_pinned_note: bool,
}

impl Default for CaptureModeData {
    fn default() -> Self {
        Self {
            mode: "create".to_string(),
            note_id: None,
            note_text: None,
            note_pinned: None,
            no_pinned_note: false,
        }
    }
}

/// Tauri-managed singleton that holds the current capture-window mode.
/// Written by hotkeys.rs before show_capture(); read by the frontend on focus.
pub struct CaptureModeState(pub Mutex<CaptureModeData>);

/// Tauri command: the capture window calls this on every focus event to know
/// what mode to display (new note vs. edit pinned note).
#[tauri::command]
pub fn get_capture_mode(state: State<'_, CaptureModeState>) -> CaptureModeData {
    state.0.lock().unwrap().clone()
}

/// Tauri command: hide a window by label.
/// Called from the frontend because JS WebviewWindow.hide() requires the
/// core:window:allow-hide capability; using invoke() avoids silent permission
/// failures and lets us hide from Rust which is always trusted.
#[tauri::command]
pub fn hide_window(app: AppHandle, label: String) {
    if let Some(win) = app.get_webview_window(&label) {
        let _ = win.hide();
    }
}

/// Tauri command: set capture mode to "edit" for the given note and show
/// the capture window. Called from the notes-list when the user clicks a row.
#[tauri::command]
pub fn open_note_for_edit(app: AppHandle, id: String, text: String, pinned: bool) {
    set_mode_edit(&app, id, text, pinned);
    show_capture(&app);
}

pub fn set_mode_create(app: &AppHandle) {
    if let Some(s) = app.try_state::<CaptureModeState>() {
        *s.0.lock().unwrap() = CaptureModeData::default();
    }
}

pub fn set_mode_edit(app: &AppHandle, note_id: String, note_text: String, note_pinned: bool) {
    if let Some(s) = app.try_state::<CaptureModeState>() {
        *s.0.lock().unwrap() = CaptureModeData {
            mode: "edit".to_string(),
            note_id: Some(note_id),
            note_text: Some(note_text),
            note_pinned: Some(note_pinned),
            no_pinned_note: false,
        };
    }
}

pub fn set_mode_no_pinned(app: &AppHandle) {
    if let Some(s) = app.try_state::<CaptureModeState>() {
        *s.0.lock().unwrap() = CaptureModeData {
            mode: "create".to_string(),
            note_id: None,
            note_text: None,
            note_pinned: None,
            no_pinned_note: true,
        };
    }
}

// ── Window helpers ────────────────────────────────────────────────────────────

/// Show the capture popup on the active monitor, upper-right quadrant.
/// Size is derived from the monitor so the window is proportional on all DPIs.
/// Anti-double-open: if the window is already visible, just refocus it.
pub fn show_capture(app: &AppHandle) {
    let Some(win) = app.get_webview_window("capture") else {
        return;
    };
    if win.is_visible().unwrap_or(false) {
        let _ = win.set_focus();
        return;
    }
    size_and_position_capture(app, &win);
    let _ = win.show();
    let _ = win.set_focus();
}

/// Compute and apply capture-window geometry from the active monitor.
///
/// Target: right half of screen width, ~15% of screen height — approximates
/// "half the upper-right quadrant" from the spec (strongly horizontal bar).
/// All coordinates are logical pixels (monitor-DPI-agnostic).
fn size_and_position_capture(app: &AppHandle, win: &tauri::WebviewWindow) {
    let Ok(cursor) = app.cursor_position() else {
        return;
    };
    let Ok(monitors) = app.available_monitors() else {
        return;
    };

    let monitor = monitors.into_iter().find(|m| {
        let p = m.position();
        let s = m.size();
        cursor.x >= p.x as f64
            && cursor.x < (p.x as f64 + s.width as f64)
            && cursor.y >= p.y as f64
            && cursor.y < (p.y as f64 + s.height as f64)
    });

    let Some(mon) = monitor else { return };

    let scale = mon.scale_factor();
    let pos = mon.position();
    let size = mon.size();

    let mon_x = pos.x as f64 / scale;
    let mon_y = pos.y as f64 / scale;
    let mon_w = size.width as f64 / scale;
    let mon_h = size.height as f64 / scale;

    let win_w = (mon_w / 2.0 * 0.6).floor();
    let win_h = (mon_h * 0.18).floor().clamp(100.0, 310.0);

    let x = mon_x + mon_w - win_w - 20.0;
    let y = mon_y + (mon_h * 0.18).floor();

    let _ = win.set_size(LogicalSize::new(win_w, win_h));
    let _ = win.set_position(LogicalPosition::new(x, y));
}

/// Show (or refocus) the notes-list window.
pub fn show_notes_list(app: &AppHandle) {
    let Some(win) = app.get_webview_window("notes-list") else {
        return;
    };
    if win.is_visible().unwrap_or(false) {
        let _ = win.set_focus();
        return;
    }
    let _ = win.show();
    let _ = win.set_focus();
}

/// Show the onboarding window (first-run only, called from setup).
pub fn show_onboarding(app: &AppHandle) {
    let Some(win) = app.get_webview_window("onboarding") else {
        return;
    };
    let _ = win.show();
    let _ = win.set_focus();
}
