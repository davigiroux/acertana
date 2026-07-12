import Database from "better-sqlite3";

export type Db = Database.Database;

/** Open (or create) the SQLite database and ensure the schema exists. */
export function openDb(path = process.env.DB_PATH ?? "acertana.db"): Db {
  const db = new Database(path);
  db.pragma("journal_mode = WAL");
  db.exec(`
    CREATE TABLE IF NOT EXISTS pools (
      pool_pubkey TEXT PRIMARY KEY,
      join_code   TEXT NOT NULL UNIQUE,
      name        TEXT NOT NULL,
      organizer   TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS members (
      pool_pubkey TEXT NOT NULL REFERENCES pools(pool_pubkey),
      wallet      TEXT NOT NULL,
      email_hint  TEXT,
      joined_at   INTEGER NOT NULL,
      PRIMARY KEY (pool_pubkey, wallet)
    );
    CREATE TABLE IF NOT EXISTS fixtures (
      fixture_id  INTEGER PRIMARY KEY,
      home        TEXT NOT NULL,
      away        TEXT NOT NULL,
      kickoff_ts  INTEGER NOT NULL,
      registered  INTEGER NOT NULL DEFAULT 0,
      updated_at  INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS picks (
      pool_pubkey TEXT NOT NULL,
      wallet      TEXT NOT NULL,
      fixture_id  INTEGER NOT NULL,
      ciphertext  TEXT NOT NULL,
      revealed    INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (pool_pubkey, wallet, fixture_id)
    );
  `);
  return db;
}
