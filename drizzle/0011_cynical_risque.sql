CREATE TABLE `access_grants` (
	`id` text PRIMARY KEY NOT NULL,
	`grantee_user_id` text NOT NULL,
	`resource_type` text NOT NULL,
	`resource_id` text NOT NULL,
	`actions_json` text DEFAULT '[]' NOT NULL,
	`state` text DEFAULT 'active' NOT NULL,
	`starts_at` text,
	`expires_at` text,
	`remaining_uses` integer,
	`download_disposition` text,
	`reason` text DEFAULT '' NOT NULL,
	`granted_by_user_id` text,
	`revoked_at` text,
	`revoked_by_user_id` text,
	`revision` integer DEFAULT 1 NOT NULL,
	`last_operation_key` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`grantee_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`granted_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`revoked_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "access_grants_resource_type_valid" CHECK("access_grants"."resource_type" in ('track', 'release', 'collection', 'course', 'lesson', 'license-document')),
	CONSTRAINT "access_grants_actions_json_valid" CHECK(json_valid("access_grants"."actions_json") and json_type("access_grants"."actions_json") = 'array'),
	CONSTRAINT "access_grants_state_valid" CHECK("access_grants"."state" in ('active', 'revoked')),
	CONSTRAINT "access_grants_remaining_uses_nonnegative" CHECK("access_grants"."remaining_uses" is null or "access_grants"."remaining_uses" >= 0),
	CONSTRAINT "access_grants_download_disposition_valid" CHECK("access_grants"."download_disposition" is null or "access_grants"."download_disposition" in ('inline', 'attachment')),
	CONSTRAINT "access_grants_reason_length_valid" CHECK(length("access_grants"."reason") <= 1000),
	CONSTRAINT "access_grants_revision_positive" CHECK("access_grants"."revision" > 0)
);
--> statement-breakpoint
CREATE INDEX `access_grants_grantee_state_resource_idx` ON `access_grants` (`grantee_user_id`,`state`,`resource_type`,`resource_id`);--> statement-breakpoint
CREATE INDEX `access_grants_expiry_idx` ON `access_grants` (`state`,`expires_at`);--> statement-breakpoint
CREATE TABLE `download_events` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`resource_type` text NOT NULL,
	`resource_id` text NOT NULL,
	`media_derivative_id` text,
	`entitlement_id` text,
	`access_source` text NOT NULL,
	`byte_length` integer NOT NULL,
	`request_id` text NOT NULL,
	`delivered_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`media_derivative_id`) REFERENCES `media_derivatives`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`entitlement_id`) REFERENCES `entitlements`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "download_events_resource_type_valid" CHECK("download_events"."resource_type" in ('track', 'release', 'collection')),
	CONSTRAINT "download_events_access_source_valid" CHECK("download_events"."access_source" in ('public', 'account', 'role', 'ownership', 'grant')),
	CONSTRAINT "download_events_byte_length_nonnegative" CHECK("download_events"."byte_length" >= 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `download_events_request_unique` ON `download_events` (`request_id`);--> statement-breakpoint
CREATE INDEX `download_events_user_delivered_idx` ON `download_events` (`user_id`,`delivered_at`);--> statement-breakpoint
CREATE INDEX `download_events_resource_delivered_idx` ON `download_events` (`resource_type`,`resource_id`,`delivered_at`);--> statement-breakpoint
CREATE TABLE `entitlements` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`source_type` text NOT NULL,
	`source_id` text NOT NULL,
	`grant_id` text,
	`resource_type` text NOT NULL,
	`resource_id` text NOT NULL,
	`actions_json` text DEFAULT '[]' NOT NULL,
	`state` text DEFAULT 'active' NOT NULL,
	`starts_at` text,
	`expires_at` text,
	`remaining_uses` integer,
	`download_disposition` text,
	`revision` integer DEFAULT 1 NOT NULL,
	`last_operation_key` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`grant_id`) REFERENCES `access_grants`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "entitlements_source_type_valid" CHECK("entitlements"."source_type" in ('grant', 'membership', 'subscription', 'license', 'credit')),
	CONSTRAINT "entitlements_grant_source_valid" CHECK((
        ("entitlements"."source_type" = 'grant' and "entitlements"."grant_id" is not null and "entitlements"."source_id" = "entitlements"."grant_id")
        or
        ("entitlements"."source_type" <> 'grant' and "entitlements"."grant_id" is null)
      )),
	CONSTRAINT "entitlements_resource_type_valid" CHECK("entitlements"."resource_type" in ('track', 'release', 'collection', 'course', 'lesson', 'license-document')),
	CONSTRAINT "entitlements_actions_json_valid" CHECK(json_valid("entitlements"."actions_json") and json_type("entitlements"."actions_json") = 'array'),
	CONSTRAINT "entitlements_state_valid" CHECK("entitlements"."state" in ('active', 'revoked', 'expired', 'exhausted')),
	CONSTRAINT "entitlements_remaining_uses_nonnegative" CHECK("entitlements"."remaining_uses" is null or "entitlements"."remaining_uses" >= 0),
	CONSTRAINT "entitlements_download_disposition_valid" CHECK("entitlements"."download_disposition" is null or "entitlements"."download_disposition" in ('inline', 'attachment')),
	CONSTRAINT "entitlements_revision_positive" CHECK("entitlements"."revision" > 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `entitlements_source_resource_unique` ON `entitlements` (`source_type`,`source_id`,`resource_type`,`resource_id`);--> statement-breakpoint
CREATE INDEX `entitlements_user_state_resource_idx` ON `entitlements` (`user_id`,`state`,`resource_type`,`resource_id`);--> statement-breakpoint
CREATE INDEX `entitlements_expiry_idx` ON `entitlements` (`state`,`expires_at`);--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_favorites` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`target_type` text NOT NULL,
	`track_id` text,
	`release_id` text,
	`state` text DEFAULT 'active' NOT NULL,
	`revision` integer DEFAULT 1 NOT NULL,
	`last_operation_key` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`track_id`) REFERENCES `tracks`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`release_id`) REFERENCES `releases`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "favorites_target_type_valid" CHECK("__new_favorites"."target_type" in ('track', 'release')),
	CONSTRAINT "favorites_exact_target" CHECK((
        ("__new_favorites"."target_type" = 'track' and "__new_favorites"."track_id" is not null and "__new_favorites"."release_id" is null)
        or
        ("__new_favorites"."target_type" = 'release' and "__new_favorites"."release_id" is not null and "__new_favorites"."track_id" is null)
      )),
	CONSTRAINT "favorites_state_valid" CHECK("__new_favorites"."state" in ('active', 'removed')),
	CONSTRAINT "favorites_revision_positive" CHECK("__new_favorites"."revision" > 0)
);
--> statement-breakpoint
INSERT INTO `__new_favorites`("id", "user_id", "target_type", "track_id", "release_id", "state", "revision", "last_operation_key", "created_at", "updated_at") SELECT "id", "user_id", "target_type", "track_id", "release_id", "state", "revision", "last_operation_key", "created_at", "updated_at" FROM `favorites`;--> statement-breakpoint
DROP TABLE `favorites`;--> statement-breakpoint
ALTER TABLE `__new_favorites` RENAME TO `favorites`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `favorites_user_track_unique` ON `favorites` (`user_id`,`track_id`) WHERE "favorites"."track_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX `favorites_user_release_unique` ON `favorites` (`user_id`,`release_id`) WHERE "favorites"."release_id" is not null;--> statement-breakpoint
CREATE INDEX `favorites_user_state_updated_idx` ON `favorites` (`user_id`,`state`,`updated_at`);--> statement-breakpoint
CREATE TABLE `__new_listening_history` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`track_id` text NOT NULL,
	`track_revision_id` text NOT NULL,
	`position_ms` integer DEFAULT 0 NOT NULL,
	`meaningful_listen_count` integer DEFAULT 0 NOT NULL,
	`revision` integer DEFAULT 1 NOT NULL,
	`last_operation_key` text,
	`first_listened_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`last_listened_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`track_id`) REFERENCES `tracks`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`track_id`,`track_revision_id`) REFERENCES `track_revisions`(`track_id`,`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "listening_history_position_nonnegative" CHECK("__new_listening_history"."position_ms" >= 0),
	CONSTRAINT "listening_history_meaningful_count_nonnegative" CHECK("__new_listening_history"."meaningful_listen_count" >= 0),
	CONSTRAINT "listening_history_revision_positive" CHECK("__new_listening_history"."revision" > 0)
);
--> statement-breakpoint
INSERT INTO `__new_listening_history`("id", "user_id", "track_id", "track_revision_id", "position_ms", "meaningful_listen_count", "revision", "last_operation_key", "first_listened_at", "last_listened_at", "created_at", "updated_at")
SELECT history."id", history."user_id", history."track_id",
	COALESCE(tracks."published_revision_id", tracks."draft_revision_id"),
	history."position_ms", history."meaningful_listen_count", history."revision",
	history."last_operation_key", history."first_listened_at", history."last_listened_at",
	history."created_at", history."updated_at"
FROM `listening_history` AS history
JOIN `tracks` AS tracks ON tracks."id" = history."track_id";--> statement-breakpoint
DROP TABLE `listening_history`;--> statement-breakpoint
ALTER TABLE `__new_listening_history` RENAME TO `listening_history`;--> statement-breakpoint
CREATE UNIQUE INDEX `listening_history_user_track_unique` ON `listening_history` (`user_id`,`track_id`);--> statement-breakpoint
CREATE INDEX `listening_history_user_recent_idx` ON `listening_history` (`user_id`,`last_listened_at`);--> statement-breakpoint
CREATE INDEX `listening_history_track_recent_idx` ON `listening_history` (`track_id`,`last_listened_at`);--> statement-breakpoint
CREATE TABLE `__new_playlist_tracks` (
	`id` text PRIMARY KEY NOT NULL,
	`playlist_id` text NOT NULL,
	`track_id` text NOT NULL,
	`position` integer NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`playlist_id`) REFERENCES `playlists`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`track_id`) REFERENCES `tracks`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "playlist_tracks_position_positive" CHECK("__new_playlist_tracks"."position" > 0)
);
--> statement-breakpoint
INSERT INTO `__new_playlist_tracks`("id", "playlist_id", "track_id", "position", "created_at") SELECT "id", "playlist_id", "track_id", "position", "created_at" FROM `playlist_tracks`;--> statement-breakpoint
DROP TABLE `playlist_tracks`;--> statement-breakpoint
ALTER TABLE `__new_playlist_tracks` RENAME TO `playlist_tracks`;--> statement-breakpoint
CREATE UNIQUE INDEX `playlist_tracks_position_unique` ON `playlist_tracks` (`playlist_id`,`position`);--> statement-breakpoint
CREATE UNIQUE INDEX `playlist_tracks_track_unique` ON `playlist_tracks` (`playlist_id`,`track_id`);--> statement-breakpoint
CREATE INDEX `playlist_tracks_track_idx` ON `playlist_tracks` (`track_id`,`playlist_id`);
