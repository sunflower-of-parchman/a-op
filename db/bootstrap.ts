import { runAtomicBatch } from "./d1.ts";

/**
 * Runtime-laboratory bootstrap. Hosted Sites still applies the generated
 * Drizzle migration; this idempotent path makes the local D1 proof explicit.
 */
export const D1_BOOTSTRAP_STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS users (
    id text PRIMARY KEY NOT NULL,
    email text NOT NULL,
    normalized_email text NOT NULL,
    status text DEFAULT 'active' NOT NULL,
    created_at text DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at text DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT users_email_normalized CHECK(normalized_email = lower(trim(email))),
    CONSTRAINT users_status_valid CHECK(status in ('active', 'disabled'))
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS users_normalized_email_unique
    ON users (normalized_email)`,
  `CREATE TABLE IF NOT EXISTS profiles (
    user_id text PRIMARY KEY NOT NULL,
    display_name text NOT NULL,
    revision integer DEFAULT 1 NOT NULL,
    created_at text DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at text DEFAULT CURRENT_TIMESTAMP NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE cascade
  )`,
  `CREATE TABLE IF NOT EXISTS roles (
    key text PRIMARY KEY NOT NULL,
    label text NOT NULL,
    created_at text DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT roles_key_valid CHECK(key in ('owner', 'editor', 'customer'))
  )`,
  `INSERT OR IGNORE INTO roles (key, label) VALUES ('owner', 'Owner')`,
  `INSERT OR IGNORE INTO roles (key, label) VALUES ('editor', 'Editor')`,
  `INSERT OR IGNORE INTO roles (key, label) VALUES ('customer', 'Customer')`,
  `CREATE TABLE IF NOT EXISTS role_assignments (
    id text PRIMARY KEY NOT NULL,
    user_id text NOT NULL,
    role_key text NOT NULL,
    assigned_by_user_id text,
    created_at text DEFAULT CURRENT_TIMESTAMP NOT NULL,
    revoked_at text,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE cascade,
    FOREIGN KEY (role_key) REFERENCES roles(key) ON DELETE restrict,
    FOREIGN KEY (assigned_by_user_id) REFERENCES users(id) ON DELETE set null
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS role_assignments_active_user_role_unique
    ON role_assignments (user_id, role_key)
    WHERE revoked_at IS NULL`,
  `CREATE INDEX IF NOT EXISTS role_assignments_active_lookup
    ON role_assignments (user_id, revoked_at)`,
  `CREATE TABLE IF NOT EXISTS runtime_proofs (
    key text PRIMARY KEY NOT NULL,
    value text NOT NULL,
    revision integer DEFAULT 1 NOT NULL,
    updated_at text DEFAULT CURRENT_TIMESTAMP NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS media_objects (
    id text PRIMARY KEY NOT NULL,
    object_key text NOT NULL,
    kind text DEFAULT 'other' NOT NULL,
    visibility text DEFAULT 'protected' NOT NULL,
    owner_user_id text,
    content_type text NOT NULL,
    byte_length integer NOT NULL,
    etag text,
    created_at text DEFAULT CURRENT_TIMESTAMP NOT NULL,
    FOREIGN KEY (owner_user_id) REFERENCES users(id) ON DELETE set null,
    CONSTRAINT media_objects_byte_length_nonnegative CHECK(byte_length >= 0),
    CONSTRAINT media_objects_visibility_valid CHECK(visibility in ('public', 'protected'))
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS media_objects_object_key_unique
    ON media_objects (object_key)`,
  `CREATE INDEX IF NOT EXISTS media_objects_visibility_idx
    ON media_objects (visibility)`,
  `CREATE TABLE IF NOT EXISTS audit_events (
    id text PRIMARY KEY NOT NULL,
    actor_user_id text,
    action text NOT NULL,
    subject_type text NOT NULL,
    subject_id text NOT NULL,
    idempotency_key text,
    request_id text,
    details_json text DEFAULT '{}' NOT NULL,
    created_at text DEFAULT CURRENT_TIMESTAMP NOT NULL,
    FOREIGN KEY (actor_user_id) REFERENCES users(id) ON DELETE set null
  )`,
  `CREATE INDEX IF NOT EXISTS audit_events_subject_idx
    ON audit_events (subject_type, subject_id, created_at)`,
  `CREATE INDEX IF NOT EXISTS audit_events_actor_idx
    ON audit_events (actor_user_id, created_at)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS audit_events_idempotency_key_unique
    ON audit_events (idempotency_key)`,
] as const;

export async function bootstrapD1Schema(
  binding: D1Database,
): Promise<D1Result<unknown>[]> {
  const prepared = D1_BOOTSTRAP_STATEMENTS.map((statement) =>
    binding.prepare(statement),
  );

  return runAtomicBatch(binding, prepared);
}
