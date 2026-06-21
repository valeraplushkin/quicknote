use sqlx::SqlitePool;
use tauri::{AppHandle, State};

use crate::AppDb;

pub(crate) async fn get_setting_inner(
    db: &SqlitePool,
    key: String,
) -> Result<Option<String>, String> {
    let row: Option<(String,)> = sqlx::query_as("SELECT value FROM settings WHERE key = ?")
        .bind(&key)
        .fetch_optional(db)
        .await
        .map_err(|e| e.to_string())?;
    Ok(row.map(|(v,)| v))
}

pub(crate) async fn set_setting_inner(
    db: &SqlitePool,
    key: String,
    value: String,
) -> Result<(), String> {
    sqlx::query("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)")
        .bind(&key)
        .bind(&value)
        .execute(db)
        .await
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn get_setting(state: State<'_, AppDb>, key: String) -> Result<Option<String>, String> {
    get_setting_inner(&state.0, key).await
}

#[tauri::command]
pub async fn set_setting(
    state: State<'_, AppDb>,
    key: String,
    value: String,
) -> Result<(), String> {
    set_setting_inner(&state.0, key, value).await
}

/// Called by the onboarding window when the user clicks "Get Started".
/// Marks onboarding as complete and enables Windows autostart.
#[tauri::command]
pub async fn complete_onboarding(
    state: State<'_, AppDb>,
    app: AppHandle,
) -> Result<(), String> {
    set_setting_inner(&state.0, "onboarding_done".to_string(), "true".to_string()).await?;

    use tauri_plugin_autostart::ManagerExt;
    app.autolaunch().enable().map_err(|e| e.to_string())?;

    Ok(())
}
