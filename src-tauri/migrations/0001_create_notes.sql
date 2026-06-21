CREATE TABLE IF NOT EXISTS notes (
    id         TEXT    NOT NULL PRIMARY KEY,
    text       TEXT    NOT NULL,
    created_at TEXT    NOT NULL,
    updated_at TEXT    NOT NULL,
    pinned     INTEGER NOT NULL DEFAULT 0
);
