use std::sync::Mutex;

use sqlx::{
    sqlite::{SqliteConnectOptions, SqliteJournalMode},
    SqlitePool,
};
use tauri::Manager;

pub mod hotkeys;
pub mod notes;
pub mod settings;
pub mod tray;
pub mod windows;

/// Tauri managed state — wraps the SQLite connection pool.
pub struct AppDb(pub SqlitePool);

const SCHEMA_NOTES: &str = include_str!("../migrations/0001_create_notes.sql");
const SCHEMA_SETTINGS: &str = include_str!("../migrations/0002_create_settings.sql");

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_sql::Builder::default().build())
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            None,
        ))
        .setup(|app| {
            // ── 1. SQLite ───────────────────────────────────────────────────────
            let data_dir = app.path().app_data_dir()?;
            std::fs::create_dir_all(&data_dir)?;
            let db_path = data_dir.join("quicknote.db");

            let pool = tauri::async_runtime::block_on(async {
                let options = SqliteConnectOptions::new()
                    .filename(&db_path)
                    .create_if_missing(true)
                    .journal_mode(SqliteJournalMode::Wal);

                let pool = SqlitePool::connect_with(options).await?;
                sqlx::query(SCHEMA_NOTES).execute(&pool).await?;
                sqlx::query(SCHEMA_SETTINGS).execute(&pool).await?;
                Ok::<_, sqlx::Error>(pool)
            })?;

            app.manage(AppDb(pool));

            // ── 2. Capture-window mode state ────────────────────────────────────
            app.manage(windows::CaptureModeState(Mutex::new(
                windows::CaptureModeData::default(),
            )));

            // ── 3. System tray ─────────────────────────────────────────────────
            tray::setup(app.handle())?;

            // ── 4. Global hotkeys ──────────────────────────────────────────────
            hotkeys::register(app.handle()).map_err(|e| e.to_string())?;

            // ── 5. Window-event handlers ────────────────────────────────────────
            //
            // Capture: hide on OS focus-loss (click outside) AND on X-button.
            // OS-level Focused(false) is the reliable source for "lost focus" —
            // it fires even for frameless/always-on-top windows on Windows,
            // unlike the JS tauri://blur which can be blocked by permissions.
            if let Some(cap) = app.get_webview_window("capture") {
                let w = cap.clone();
                cap.on_window_event(move |event| {
                    if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                        api.prevent_close();
                        let _ = w.hide();
                    }
                });
            }

            // notes-list and onboarding: only prevent X-button from killing the process.
            for label in ["notes-list", "onboarding"] {
                if let Some(win) = app.get_webview_window(label) {
                    let w = win.clone();
                    win.on_window_event(move |event| {
                        if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                            api.prevent_close();
                            let _ = w.hide();
                        }
                    });
                }
            }

            // ── 6. First-run: show onboarding if not yet completed ──────────────
            let handle = app.handle().clone();
            let db_pool = app.state::<AppDb>().0.clone();
            tauri::async_runtime::spawn(async move {
                let done =
                    settings::get_setting_inner(&db_pool, "onboarding_done".to_string())
                        .await
                        .unwrap_or(None);
                if done.is_none() {
                    windows::show_onboarding(&handle);
                }
            });

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            notes::create_note,
            notes::update_note,
            notes::delete_note,
            notes::get_all_notes,
            notes::get_pinned_note,
            notes::pin_note,
            notes::unpin_note,
            settings::get_setting,
            settings::set_setting,
            settings::complete_onboarding,
            windows::get_capture_mode,
            windows::hide_window,
            windows::open_note_for_edit,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
