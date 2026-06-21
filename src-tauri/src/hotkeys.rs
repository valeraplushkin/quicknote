use tauri::{AppHandle, Manager};
use tauri_plugin_global_shortcut::{Code, GlobalShortcutExt, Modifiers, Shortcut, ShortcutState};

use crate::{notes, windows, AppDb};

// Default hotkey bindings. Future: load overrides from the settings table
// using keys "shortcut_capture", "shortcut_pinned", "shortcut_list".
// Ctrl+N note: conflicts with "New" in many apps — see CLAUDE.md.

pub fn register(app: &AppHandle) -> Result<(), Box<dyn std::error::Error>> {
    let mgr = app.global_shortcut();

    // Ctrl+N — open capture window in "new note" mode
    let a = app.clone();
    mgr.on_shortcut(
        Shortcut::new(Some(Modifiers::CONTROL), Code::KeyN),
        move |_app, _sc, ev| {
            if ev.state == ShortcutState::Pressed {
                windows::set_mode_create(&a);
                windows::show_capture(&a);
            }
        },
    )?;

    // Ctrl+Shift+N — open capture window in "edit pinned note" mode.
    // If no pinned note exists, open capture in "create" mode with a hint.
    // Does NOT open the notes-list window.
    let a = app.clone();
    mgr.on_shortcut(
        Shortcut::new(Some(Modifiers::CONTROL | Modifiers::SHIFT), Code::KeyN),
        move |_app, _sc, ev| {
            if ev.state != ShortcutState::Pressed {
                return;
            }
            let app2 = a.clone();
            let db_pool = app2.state::<AppDb>().0.clone();
            tauri::async_runtime::spawn(async move {
                match notes::get_pinned_note_inner(&db_pool).await {
                    Ok(Some(note)) => {
                        windows::set_mode_edit(&app2, note.id, note.text, note.pinned);
                        windows::show_capture(&app2);
                    }
                    Ok(None) => {
                        // No pinned note — still open capture, show hint in placeholder.
                        windows::set_mode_no_pinned(&app2);
                        windows::show_capture(&app2);
                    }
                    Err(_) => {}
                }
            });
        },
    )?;

    // Ctrl+Alt+N — notes list
    let a = app.clone();
    mgr.on_shortcut(
        Shortcut::new(Some(Modifiers::CONTROL | Modifiers::ALT), Code::KeyN),
        move |_app, _sc, ev| {
            if ev.state == ShortcutState::Pressed {
                windows::show_notes_list(&a);
            }
        },
    )?;

    Ok(())
}
