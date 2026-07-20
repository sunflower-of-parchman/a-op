PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_track_revisions` (
	`id` text PRIMARY KEY NOT NULL,
	`track_id` text NOT NULL,
	`revision` integer NOT NULL,
	`title` text NOT NULL,
	`subtitle` text,
	`description` text DEFAULT '' NOT NULL,
	`duration_ms` integer,
	`meter` text,
	`tempo_bpm` integer,
	`musical_key` text,
	`isrc` text,
	`copyright_notice` text DEFAULT '' NOT NULL,
	`explicit` integer DEFAULT false NOT NULL,
	`view_mode` text DEFAULT 'public' NOT NULL,
	`stream_mode` text DEFAULT 'unavailable' NOT NULL,
	`download_mode` text DEFAULT 'unavailable' NOT NULL,
	`original_media_id` text,
	`streaming_derivative_id` text,
	`download_derivative_id` text,
	`tags_json` text DEFAULT '[]' NOT NULL,
	`created_by_user_id` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`track_id`) REFERENCES `tracks`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`original_media_id`) REFERENCES `media_objects`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`streaming_derivative_id`) REFERENCES `media_derivatives`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`download_derivative_id`) REFERENCES `media_derivatives`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`created_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "track_revisions_number_positive" CHECK("__new_track_revisions"."revision" > 0),
	CONSTRAINT "track_revisions_duration_nonnegative" CHECK("__new_track_revisions"."duration_ms" is null or "__new_track_revisions"."duration_ms" >= 0),
	CONSTRAINT "track_revisions_tempo_positive" CHECK("__new_track_revisions"."tempo_bpm" is null or ("__new_track_revisions"."tempo_bpm" > 0 and "__new_track_revisions"."tempo_bpm" <= 1000)),
	CONSTRAINT "track_revisions_explicit_valid" CHECK("__new_track_revisions"."explicit" in (0, 1)),
	CONSTRAINT "track_revisions_view_mode_valid" CHECK("__new_track_revisions"."view_mode" in ('public', 'account', 'protected', 'unavailable')),
	CONSTRAINT "track_revisions_stream_mode_valid" CHECK("__new_track_revisions"."stream_mode" in ('public', 'account', 'protected', 'unavailable')),
	CONSTRAINT "track_revisions_download_mode_valid" CHECK("__new_track_revisions"."download_mode" in ('public', 'account', 'protected', 'unavailable')),
	CONSTRAINT "track_revisions_tags_json_valid" CHECK(json_valid("__new_track_revisions"."tags_json"))
);
--> statement-breakpoint
INSERT INTO `__new_track_revisions`("id", "track_id", "revision", "title", "subtitle", "description", "duration_ms", "meter", "tempo_bpm", "musical_key", "isrc", "copyright_notice", "explicit", "view_mode", "stream_mode", "download_mode", "original_media_id", "streaming_derivative_id", "download_derivative_id", "tags_json", "created_by_user_id", "created_at") SELECT "id", "track_id", "revision", "title", "subtitle", "description", "duration_ms", NULL, NULL, NULL, "isrc", "copyright_notice", "explicit", "view_mode", "stream_mode", "download_mode", "original_media_id", "streaming_derivative_id", "download_derivative_id", "tags_json", "created_by_user_id", "created_at" FROM `track_revisions`;--> statement-breakpoint
DROP TABLE `track_revisions`;--> statement-breakpoint
ALTER TABLE `__new_track_revisions` RENAME TO `track_revisions`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `track_revisions_number_unique` ON `track_revisions` (`track_id`,`revision`);--> statement-breakpoint
CREATE UNIQUE INDEX `track_revisions_owner_id_unique` ON `track_revisions` (`track_id`,`id`);--> statement-breakpoint
CREATE UNIQUE INDEX `track_revisions_identity_number_unique` ON `track_revisions` (`track_id`,`id`,`revision`);--> statement-breakpoint
CREATE INDEX `track_revisions_stream_idx` ON `track_revisions` (`stream_mode`,`streaming_derivative_id`);
