use chrono::Utc;
use serde::{Deserialize, Serialize};
use sqlx::SqlitePool;
use tauri::State;
use uuid::Uuid;

use crate::AppDb;

/// Public Note returned to the frontend via Tauri commands.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Note {
    pub id: String,
    pub text: String,
    pub created_at: String,
    pub updated_at: String,
    pub pinned: bool,
}

/// Raw row as stored in SQLite (pinned is INTEGER 0/1).
#[derive(sqlx::FromRow)]
struct NoteRow {
    id: String,
    text: String,
    created_at: String,
    updated_at: String,
    pinned: i64,
}

impl From<NoteRow> for Note {
    fn from(row: NoteRow) -> Self {
        Note {
            id: row.id,
            text: row.text,
            created_at: row.created_at,
            updated_at: row.updated_at,
            pinned: row.pinned != 0,
        }
    }
}

async fn fetch_note(db: &SqlitePool, id: &str) -> Result<Note, String> {
    sqlx::query_as::<_, NoteRow>(
        "SELECT id, text, created_at, updated_at, pinned FROM notes WHERE id = ?",
    )
    .bind(id)
    .fetch_one(db)
    .await
    .map(Note::from)
    .map_err(|e| e.to_string())
}

// ── Inner logic (pub(crate) so unit tests can call without Tauri State) ───────

pub(crate) async fn create_note_inner(db: &SqlitePool, text: String) -> Result<Note, String> {
    let text = text.trim().to_string();
    if text.is_empty() {
        return Err("Note text cannot be empty".to_string());
    }

    let id = Uuid::new_v4().to_string();
    let now = Utc::now().to_rfc3339();

    sqlx::query(
        "INSERT INTO notes (id, text, created_at, updated_at, pinned) VALUES (?, ?, ?, ?, 0)",
    )
    .bind(&id)
    .bind(&text)
    .bind(&now)
    .bind(&now)
    .execute(db)
    .await
    .map_err(|e| e.to_string())?;

    Ok(Note {
        id,
        text,
        created_at: now.clone(),
        updated_at: now,
        pinned: false,
    })
}

pub(crate) async fn update_note_inner(
    db: &SqlitePool,
    id: String,
    text: String,
) -> Result<Note, String> {
    let text = text.trim().to_string();
    if text.is_empty() {
        return Err("Note text cannot be empty".to_string());
    }

    let now = Utc::now().to_rfc3339();
    sqlx::query("UPDATE notes SET text = ?, updated_at = ? WHERE id = ?")
        .bind(&text)
        .bind(&now)
        .bind(&id)
        .execute(db)
        .await
        .map_err(|e| e.to_string())?;

    fetch_note(db, &id).await
}

pub(crate) async fn delete_note_inner(db: &SqlitePool, id: String) -> Result<(), String> {
    sqlx::query("DELETE FROM notes WHERE id = ?")
        .bind(&id)
        .execute(db)
        .await
        .map_err(|e| e.to_string())?;
    Ok(())
}

pub(crate) async fn get_all_notes_inner(db: &SqlitePool) -> Result<Vec<Note>, String> {
    sqlx::query_as::<_, NoteRow>(
        "SELECT id, text, created_at, updated_at, pinned \
         FROM notes \
         ORDER BY pinned DESC, updated_at DESC",
    )
    .fetch_all(db)
    .await
    .map(|rows| rows.into_iter().map(Note::from).collect())
    .map_err(|e| e.to_string())
}

pub(crate) async fn get_pinned_note_inner(db: &SqlitePool) -> Result<Option<Note>, String> {
    sqlx::query_as::<_, NoteRow>(
        "SELECT id, text, created_at, updated_at, pinned FROM notes WHERE pinned = 1 LIMIT 1",
    )
    .fetch_optional(db)
    .await
    .map(|opt| opt.map(Note::from))
    .map_err(|e| e.to_string())
}

pub(crate) async fn pin_note_inner(db: &SqlitePool, id: String) -> Result<Note, String> {
    let now = Utc::now().to_rfc3339();
    let mut tx = db.begin().await.map_err(|e| e.to_string())?;

    sqlx::query("UPDATE notes SET pinned = 0 WHERE pinned = 1")
        .execute(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;

    sqlx::query("UPDATE notes SET pinned = 1, updated_at = ? WHERE id = ?")
        .bind(&now)
        .bind(&id)
        .execute(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;

    tx.commit().await.map_err(|e| e.to_string())?;
    fetch_note(db, &id).await
}

pub(crate) async fn unpin_note_inner(db: &SqlitePool, id: String) -> Result<Note, String> {
    let now = Utc::now().to_rfc3339();

    sqlx::query("UPDATE notes SET pinned = 0, updated_at = ? WHERE id = ?")
        .bind(&now)
        .bind(&id)
        .execute(db)
        .await
        .map_err(|e| e.to_string())?;

    fetch_note(db, &id).await
}

// ── Tauri commands (thin wrappers around inner functions) ─────────────────────

#[tauri::command]
pub async fn create_note(state: State<'_, AppDb>, text: String) -> Result<Note, String> {
    create_note_inner(&state.0, text).await
}

#[tauri::command]
pub async fn update_note(
    state: State<'_, AppDb>,
    id: String,
    text: String,
) -> Result<Note, String> {
    update_note_inner(&state.0, id, text).await
}

#[tauri::command]
pub async fn delete_note(state: State<'_, AppDb>, id: String) -> Result<(), String> {
    delete_note_inner(&state.0, id).await
}

#[tauri::command]
pub async fn get_all_notes(state: State<'_, AppDb>) -> Result<Vec<Note>, String> {
    get_all_notes_inner(&state.0).await
}

#[tauri::command]
pub async fn get_pinned_note(state: State<'_, AppDb>) -> Result<Option<Note>, String> {
    get_pinned_note_inner(&state.0).await
}

#[tauri::command]
pub async fn pin_note(state: State<'_, AppDb>, id: String) -> Result<Note, String> {
    pin_note_inner(&state.0, id).await
}

#[tauri::command]
pub async fn unpin_note(state: State<'_, AppDb>, id: String) -> Result<Note, String> {
    unpin_note_inner(&state.0, id).await
}

// ── Tests ─────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;
    use sqlx::sqlite::SqlitePoolOptions;

    const SCHEMA: &str = include_str!("../migrations/0001_create_notes.sql");

    /// Runs an async block on a fresh single-thread tokio runtime.
    /// Avoids the `tokio-macros` dev-dependency (not in local cache).
    fn run<F: std::future::Future>(f: F) -> F::Output {
        tokio::runtime::Builder::new_current_thread()
            .enable_all()
            .build()
            .unwrap()
            .block_on(f)
    }

    /// Creates a fresh isolated in-memory SQLite pool for each test.
    /// max_connections(1) ensures all queries share the same in-memory DB.
    async fn setup() -> SqlitePool {
        let pool = SqlitePoolOptions::new()
            .max_connections(1)
            .connect("sqlite::memory:")
            .await
            .expect("failed to create in-memory test pool");
        sqlx::query(SCHEMA)
            .execute(&pool)
            .await
            .expect("failed to apply schema");
        pool
    }

    // ── 1. create_note returns correct fields ─────────────────────────────────

    #[test]
    fn create_note_returns_valid_fields() {
        run(async {
            let db = setup().await;
            let note = create_note_inner(&db, "Hello, QuickNote!".to_string())
                .await
                .expect("create_note should succeed");

            assert!(!note.id.is_empty(), "id must not be empty");
            assert_eq!(note.text, "Hello, QuickNote!");
            assert!(!note.pinned, "new note must not be pinned");
            assert!(!note.created_at.is_empty(), "created_at must be set");
            assert!(!note.updated_at.is_empty(), "updated_at must be set");
            assert_eq!(
                note.created_at, note.updated_at,
                "on creation created_at == updated_at"
            );
        });
    }

    // ── 2. empty / whitespace text is rejected ────────────────────────────────

    #[test]
    fn create_note_empty_text_is_rejected() {
        run(async {
            let db = setup().await;

            assert!(
                create_note_inner(&db, "".to_string()).await.is_err(),
                "empty string must be rejected"
            );
            assert!(
                create_note_inner(&db, "   ".to_string()).await.is_err(),
                "spaces-only must be rejected"
            );
            assert!(
                create_note_inner(&db, "\n\t\r\n".to_string()).await.is_err(),
                "whitespace chars only must be rejected"
            );

            // Nothing must have been persisted
            let all = get_all_notes_inner(&db).await.unwrap();
            assert!(
                all.is_empty(),
                "no notes should exist after only failed creates"
            );
        });
    }

    // ── 3. pin_note enforces single-pin invariant ─────────────────────────────

    #[test]
    fn pin_note_single_pin_invariant() {
        run(async {
            let db = setup().await;

            let a = create_note_inner(&db, "Note A".to_string()).await.unwrap();
            let b = create_note_inner(&db, "Note B".to_string()).await.unwrap();
            let c = create_note_inner(&db, "Note C".to_string()).await.unwrap();

            async fn count_pinned(pool: &SqlitePool) -> i64 {
                let (count,): (i64,) =
                    sqlx::query_as("SELECT COUNT(*) FROM notes WHERE pinned = 1")
                        .fetch_one(pool)
                        .await
                        .unwrap();
                count
            }

            pin_note_inner(&db, a.id.clone()).await.unwrap();
            assert_eq!(count_pinned(&db).await, 1, "exactly 1 pinned after pin(A)");

            pin_note_inner(&db, b.id.clone()).await.unwrap();
            assert_eq!(count_pinned(&db).await, 1, "exactly 1 pinned after pin(B)");
            let a_row = fetch_note(&db, &a.id).await.unwrap();
            assert!(!a_row.pinned, "A must be unpinned after pinning B");

            pin_note_inner(&db, c.id.clone()).await.unwrap();
            assert_eq!(count_pinned(&db).await, 1, "exactly 1 pinned after pin(C)");
            let b_row = fetch_note(&db, &b.id).await.unwrap();
            assert!(!b_row.pinned, "B must be unpinned after pinning C");
            let c_row = fetch_note(&db, &c.id).await.unwrap();
            assert!(c_row.pinned, "C must be pinned");
        });
    }

    // ── 4. get_all_notes returns pinned note first ────────────────────────────

    #[test]
    fn get_all_notes_pinned_comes_first() {
        run(async {
            let db = setup().await;

            let a = create_note_inner(&db, "Note A".to_string()).await.unwrap();
            let _b = create_note_inner(&db, "Note B".to_string()).await.unwrap();
            let _c = create_note_inner(&db, "Note C".to_string()).await.unwrap();

            // Before pinning — no note is pinned
            let notes = get_all_notes_inner(&db).await.unwrap();
            assert!(!notes[0].pinned, "without pinning, first row is not pinned");

            // Pin the oldest note (A) — it would normally be last by updatedAt
            pin_note_inner(&db, a.id.clone()).await.unwrap();

            let notes = get_all_notes_inner(&db).await.unwrap();
            assert_eq!(notes.len(), 3);
            assert!(notes[0].pinned, "first result must be the pinned note");
            assert_eq!(notes[0].id, a.id, "pinned note A must be first");
            assert!(notes[1..].iter().all(|n| !n.pinned), "rest must be unpinned");
        });
    }

    // ── 5. update_note changes updatedAt but not createdAt ────────────────────

    #[test]
    fn update_note_timestamps() {
        run(async {
            let db = setup().await;

            let original = create_note_inner(&db, "Original".to_string())
                .await
                .unwrap();

            // Sleep so Utc::now() produces a different RFC3339 value
            std::thread::sleep(std::time::Duration::from_millis(10));

            let updated =
                update_note_inner(&db, original.id.clone(), "Updated".to_string())
                    .await
                    .unwrap();

            assert_eq!(updated.id, original.id);
            assert_eq!(updated.text, "Updated");
            assert_eq!(
                updated.created_at, original.created_at,
                "createdAt must not change on update"
            );
            assert_ne!(
                updated.updated_at, original.updated_at,
                "updatedAt must change on update"
            );
        });
    }
}
