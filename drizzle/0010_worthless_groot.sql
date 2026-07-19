CREATE TABLE `favorites` (
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
	FOREIGN KEY (`track_id`) REFERENCES `tracks`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`release_id`) REFERENCES `releases`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "favorites_target_type_valid" CHECK("favorites"."target_type" in ('track', 'release')),
	CONSTRAINT "favorites_exact_target" CHECK((
        ("favorites"."target_type" = 'track' and "favorites"."track_id" is not null and "favorites"."release_id" is null)
        or
        ("favorites"."target_type" = 'release' and "favorites"."release_id" is not null and "favorites"."track_id" is null)
      )),
	CONSTRAINT "favorites_state_valid" CHECK("favorites"."state" in ('active', 'removed')),
	CONSTRAINT "favorites_revision_positive" CHECK("favorites"."revision" > 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `favorites_user_track_unique` ON `favorites` (`user_id`,`track_id`) WHERE "favorites"."track_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX `favorites_user_release_unique` ON `favorites` (`user_id`,`release_id`) WHERE "favorites"."release_id" is not null;--> statement-breakpoint
CREATE INDEX `favorites_user_state_updated_idx` ON `favorites` (`user_id`,`state`,`updated_at`);--> statement-breakpoint
CREATE TABLE `listening_history` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`track_id` text NOT NULL,
	`position_ms` integer DEFAULT 0 NOT NULL,
	`meaningful_listen_count` integer DEFAULT 0 NOT NULL,
	`revision` integer DEFAULT 1 NOT NULL,
	`last_operation_key` text,
	`first_listened_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`last_listened_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`track_id`) REFERENCES `tracks`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "listening_history_position_nonnegative" CHECK("listening_history"."position_ms" >= 0),
	CONSTRAINT "listening_history_meaningful_count_nonnegative" CHECK("listening_history"."meaningful_listen_count" >= 0),
	CONSTRAINT "listening_history_revision_positive" CHECK("listening_history"."revision" > 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `listening_history_user_track_unique` ON `listening_history` (`user_id`,`track_id`);--> statement-breakpoint
CREATE INDEX `listening_history_user_recent_idx` ON `listening_history` (`user_id`,`last_listened_at`);--> statement-breakpoint
CREATE INDEX `listening_history_track_recent_idx` ON `listening_history` (`track_id`,`last_listened_at`);--> statement-breakpoint
CREATE TABLE `playlist_tracks` (
	`id` text PRIMARY KEY NOT NULL,
	`playlist_id` text NOT NULL,
	`track_id` text NOT NULL,
	`position` integer NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`playlist_id`) REFERENCES `playlists`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`track_id`) REFERENCES `tracks`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "playlist_tracks_position_positive" CHECK("playlist_tracks"."position" > 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `playlist_tracks_position_unique` ON `playlist_tracks` (`playlist_id`,`position`);--> statement-breakpoint
CREATE UNIQUE INDEX `playlist_tracks_track_unique` ON `playlist_tracks` (`playlist_id`,`track_id`);--> statement-breakpoint
CREATE INDEX `playlist_tracks_track_idx` ON `playlist_tracks` (`track_id`,`playlist_id`);--> statement-breakpoint
CREATE TABLE `playlists` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`name` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`state` text DEFAULT 'active' NOT NULL,
	`revision` integer DEFAULT 1 NOT NULL,
	`last_operation_key` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "playlists_name_length_valid" CHECK(length("playlists"."name") between 1 and 120),
	CONSTRAINT "playlists_description_length_valid" CHECK(length("playlists"."description") <= 1000),
	CONSTRAINT "playlists_state_valid" CHECK("playlists"."state" in ('active', 'archived')),
	CONSTRAINT "playlists_revision_positive" CHECK("playlists"."revision" > 0)
);
--> statement-breakpoint
CREATE INDEX `playlists_user_state_updated_idx` ON `playlists` (`user_id`,`state`,`updated_at`);--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_installation_state` (
	`id` text PRIMARY KEY NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`owner_user_id` text,
	`schema_version` integer DEFAULT 5 NOT NULL,
	`last_operation_key` text,
	`bootstrap_completed_at` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`owner_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "installation_state_status_valid" CHECK("__new_installation_state"."status" in ('pending', 'active')),
	CONSTRAINT "installation_state_schema_version_positive" CHECK("__new_installation_state"."schema_version" > 0)
);
--> statement-breakpoint
INSERT INTO `__new_installation_state`("id", "status", "owner_user_id", "schema_version", "last_operation_key", "bootstrap_completed_at", "created_at", "updated_at") SELECT "id", "status", "owner_user_id", "schema_version", "last_operation_key", "bootstrap_completed_at", "created_at", "updated_at" FROM `installation_state`;--> statement-breakpoint
DROP TABLE `installation_state`;--> statement-breakpoint
ALTER TABLE `__new_installation_state` RENAME TO `installation_state`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
UPDATE `installation_state`
SET `schema_version` = 5,
	`updated_at` = CURRENT_TIMESTAMP
WHERE `schema_version` < 5;
