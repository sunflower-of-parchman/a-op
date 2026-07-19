CREATE TABLE `collection_revisions` (
	`id` text PRIMARY KEY NOT NULL,
	`collection_id` text NOT NULL,
	`revision` integer NOT NULL,
	`title` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`view_mode` text DEFAULT 'public' NOT NULL,
	`artwork_derivative_id` text,
	`tags_json` text DEFAULT '[]' NOT NULL,
	`created_by_user_id` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`collection_id`) REFERENCES `collections`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`artwork_derivative_id`) REFERENCES `media_derivatives`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`created_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "collection_revisions_number_positive" CHECK("collection_revisions"."revision" > 0),
	CONSTRAINT "collection_revisions_view_mode_valid" CHECK("collection_revisions"."view_mode" in ('public', 'account', 'protected', 'unavailable')),
	CONSTRAINT "collection_revisions_tags_json_valid" CHECK(json_valid("collection_revisions"."tags_json"))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `collection_revisions_number_unique` ON `collection_revisions` (`collection_id`,`revision`);--> statement-breakpoint
CREATE TABLE `collection_tracks` (
	`id` text PRIMARY KEY NOT NULL,
	`collection_revision_id` text NOT NULL,
	`track_id` text NOT NULL,
	`position` integer NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`collection_revision_id`) REFERENCES `collection_revisions`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`track_id`) REFERENCES `tracks`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "collection_tracks_position_positive" CHECK("collection_tracks"."position" > 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `collection_tracks_position_unique` ON `collection_tracks` (`collection_revision_id`,`position`);--> statement-breakpoint
CREATE UNIQUE INDEX `collection_tracks_track_unique` ON `collection_tracks` (`collection_revision_id`,`track_id`);--> statement-breakpoint
CREATE TABLE `collections` (
	`id` text PRIMARY KEY NOT NULL,
	`slug` text NOT NULL,
	`draft_revision_id` text NOT NULL,
	`published_revision_id` text,
	`publication_state` text DEFAULT 'draft' NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`last_operation_key` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`published_at` text,
	CONSTRAINT "collections_slug_normalized" CHECK("collections"."slug" = lower(trim("collections"."slug"))),
	CONSTRAINT "collections_slug_no_slash" CHECK(instr("collections"."slug", '/') = 0),
	CONSTRAINT "collections_publication_state_valid" CHECK("collections"."publication_state" in ('draft', 'published', 'archived')),
	CONSTRAINT "collections_version_positive" CHECK("collections"."version" > 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `collections_slug_unique` ON `collections` (`slug`);--> statement-breakpoint
CREATE INDEX `collections_public_lookup` ON `collections` (`publication_state`,`slug`);--> statement-breakpoint
CREATE TABLE `credits` (
	`id` text PRIMARY KEY NOT NULL,
	`release_revision_id` text,
	`track_revision_id` text,
	`collection_revision_id` text,
	`name` text NOT NULL,
	`role` text NOT NULL,
	`details` text DEFAULT '' NOT NULL,
	`position` integer NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`release_revision_id`) REFERENCES `release_revisions`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`track_revision_id`) REFERENCES `track_revisions`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`collection_revision_id`) REFERENCES `collection_revisions`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "credits_position_positive" CHECK("credits"."position" > 0),
	CONSTRAINT "credits_one_subject" CHECK((("credits"."release_revision_id" is not null) + ("credits"."track_revision_id" is not null) + ("credits"."collection_revision_id" is not null)) = 1)
);
--> statement-breakpoint
CREATE INDEX `credits_release_idx` ON `credits` (`release_revision_id`,`position`);--> statement-breakpoint
CREATE INDEX `credits_track_idx` ON `credits` (`track_revision_id`,`position`);--> statement-breakpoint
CREATE INDEX `credits_collection_idx` ON `credits` (`collection_revision_id`,`position`);--> statement-breakpoint
CREATE TABLE `media_derivatives` (
	`id` text PRIMARY KEY NOT NULL,
	`source_media_id` text NOT NULL,
	`kind` text NOT NULL,
	`processing_profile` text NOT NULL,
	`processing_version` text NOT NULL,
	`object_key` text,
	`status` text DEFAULT 'pending' NOT NULL,
	`approval_state` text DEFAULT 'pending' NOT NULL,
	`content_type` text,
	`format` text,
	`bitrate_kbps` integer,
	`duration_ms` integer,
	`channels` integer,
	`sample_rate` integer,
	`byte_length` integer,
	`content_sha256` text,
	`approved_by_user_id` text,
	`approved_at` text,
	`last_operation_key` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`source_media_id`) REFERENCES `media_objects`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`approved_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "media_derivatives_status_valid" CHECK("media_derivatives"."status" in ('pending', 'processing', 'ready', 'failed')),
	CONSTRAINT "media_derivatives_approval_valid" CHECK("media_derivatives"."approval_state" in ('pending', 'approved', 'rejected')),
	CONSTRAINT "media_derivatives_byte_length_nonnegative" CHECK("media_derivatives"."byte_length" is null or "media_derivatives"."byte_length" >= 0),
	CONSTRAINT "media_derivatives_duration_nonnegative" CHECK("media_derivatives"."duration_ms" is null or "media_derivatives"."duration_ms" >= 0),
	CONSTRAINT "media_derivatives_ready_complete" CHECK("media_derivatives"."status" != 'ready' or ("media_derivatives"."object_key" is not null and "media_derivatives"."content_type" is not null and "media_derivatives"."byte_length" is not null))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `media_derivatives_object_key_unique` ON `media_derivatives` (`object_key`) WHERE "media_derivatives"."object_key" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX `media_derivatives_profile_unique` ON `media_derivatives` (`source_media_id`,`kind`,`processing_profile`,`processing_version`);--> statement-breakpoint
CREATE INDEX `media_derivatives_delivery_idx` ON `media_derivatives` (`status`,`approval_state`,`kind`);--> statement-breakpoint
CREATE TABLE `media_job_attempts` (
	`id` text PRIMARY KEY NOT NULL,
	`job_id` text NOT NULL,
	`attempt` integer NOT NULL,
	`status` text NOT NULL,
	`worker_id` text,
	`lease_token` text NOT NULL,
	`error_code` text,
	`evidence_json` text DEFAULT '{}' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`finished_at` text,
	FOREIGN KEY (`job_id`) REFERENCES `media_jobs`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "media_job_attempts_positive" CHECK("media_job_attempts"."attempt" > 0),
	CONSTRAINT "media_job_attempts_status_valid" CHECK("media_job_attempts"."status" in ('processing', 'ready', 'failed', 'stale')),
	CONSTRAINT "media_job_attempts_evidence_json_valid" CHECK(json_valid("media_job_attempts"."evidence_json"))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `media_job_attempts_number_unique` ON `media_job_attempts` (`job_id`,`attempt`);--> statement-breakpoint
CREATE TABLE `media_jobs` (
	`id` text PRIMARY KEY NOT NULL,
	`source_media_id` text NOT NULL,
	`derivative_kind` text NOT NULL,
	`processing_profile` text NOT NULL,
	`processing_version` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`requested_by_user_id` text,
	`lease_token` text,
	`lease_expires_at` text,
	`attempt_count` integer DEFAULT 0 NOT NULL,
	`result_derivative_id` text,
	`last_error_code` text,
	`last_operation_key` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`finished_at` text,
	FOREIGN KEY (`source_media_id`) REFERENCES `media_objects`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`requested_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`result_derivative_id`) REFERENCES `media_derivatives`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "media_jobs_status_valid" CHECK("media_jobs"."status" in ('pending', 'processing', 'ready', 'failed')),
	CONSTRAINT "media_jobs_attempt_count_nonnegative" CHECK("media_jobs"."attempt_count" >= 0)
);
--> statement-breakpoint
CREATE INDEX `media_jobs_claim_idx` ON `media_jobs` (`status`,`lease_expires_at`,`created_at`);--> statement-breakpoint
CREATE TABLE `release_revisions` (
	`id` text PRIMARY KEY NOT NULL,
	`release_id` text NOT NULL,
	`revision` integer NOT NULL,
	`release_type` text DEFAULT 'album' NOT NULL,
	`title` text NOT NULL,
	`subtitle` text,
	`description` text DEFAULT '' NOT NULL,
	`release_date` text,
	`catalog_number` text,
	`copyright_notice` text DEFAULT '' NOT NULL,
	`view_mode` text DEFAULT 'public' NOT NULL,
	`artwork_derivative_id` text,
	`tags_json` text DEFAULT '[]' NOT NULL,
	`created_by_user_id` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`release_id`) REFERENCES `releases`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`artwork_derivative_id`) REFERENCES `media_derivatives`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`created_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "release_revisions_number_positive" CHECK("release_revisions"."revision" > 0),
	CONSTRAINT "release_revisions_type_valid" CHECK("release_revisions"."release_type" in ('single', 'ep', 'album', 'compilation', 'live', 'other')),
	CONSTRAINT "release_revisions_view_mode_valid" CHECK("release_revisions"."view_mode" in ('public', 'account', 'protected', 'unavailable')),
	CONSTRAINT "release_revisions_tags_json_valid" CHECK(json_valid("release_revisions"."tags_json"))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `release_revisions_number_unique` ON `release_revisions` (`release_id`,`revision`);--> statement-breakpoint
CREATE INDEX `release_revisions_date_idx` ON `release_revisions` (`release_date`,`release_type`);--> statement-breakpoint
CREATE TABLE `release_tracks` (
	`id` text PRIMARY KEY NOT NULL,
	`release_revision_id` text NOT NULL,
	`track_id` text NOT NULL,
	`position` integer NOT NULL,
	`disc_number` integer DEFAULT 1 NOT NULL,
	`track_number` integer NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`release_revision_id`) REFERENCES `release_revisions`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`track_id`) REFERENCES `tracks`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "release_tracks_position_positive" CHECK("release_tracks"."position" > 0),
	CONSTRAINT "release_tracks_disc_positive" CHECK("release_tracks"."disc_number" > 0),
	CONSTRAINT "release_tracks_number_positive" CHECK("release_tracks"."track_number" > 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `release_tracks_position_unique` ON `release_tracks` (`release_revision_id`,`position`);--> statement-breakpoint
CREATE UNIQUE INDEX `release_tracks_track_unique` ON `release_tracks` (`release_revision_id`,`track_id`);--> statement-breakpoint
CREATE TABLE `releases` (
	`id` text PRIMARY KEY NOT NULL,
	`slug` text NOT NULL,
	`draft_revision_id` text NOT NULL,
	`published_revision_id` text,
	`publication_state` text DEFAULT 'draft' NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`last_operation_key` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`published_at` text,
	CONSTRAINT "releases_slug_normalized" CHECK("releases"."slug" = lower(trim("releases"."slug"))),
	CONSTRAINT "releases_slug_no_slash" CHECK(instr("releases"."slug", '/') = 0),
	CONSTRAINT "releases_publication_state_valid" CHECK("releases"."publication_state" in ('draft', 'published', 'archived')),
	CONSTRAINT "releases_version_positive" CHECK("releases"."version" > 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `releases_slug_unique` ON `releases` (`slug`);--> statement-breakpoint
CREATE INDEX `releases_public_lookup` ON `releases` (`publication_state`,`slug`);--> statement-breakpoint
CREATE TABLE `track_revisions` (
	`id` text PRIMARY KEY NOT NULL,
	`track_id` text NOT NULL,
	`revision` integer NOT NULL,
	`title` text NOT NULL,
	`subtitle` text,
	`description` text DEFAULT '' NOT NULL,
	`duration_ms` integer,
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
	CONSTRAINT "track_revisions_number_positive" CHECK("track_revisions"."revision" > 0),
	CONSTRAINT "track_revisions_duration_nonnegative" CHECK("track_revisions"."duration_ms" is null or "track_revisions"."duration_ms" >= 0),
	CONSTRAINT "track_revisions_explicit_valid" CHECK("track_revisions"."explicit" in (0, 1)),
	CONSTRAINT "track_revisions_view_mode_valid" CHECK("track_revisions"."view_mode" in ('public', 'account', 'protected', 'unavailable')),
	CONSTRAINT "track_revisions_stream_mode_valid" CHECK("track_revisions"."stream_mode" in ('public', 'account', 'protected', 'unavailable')),
	CONSTRAINT "track_revisions_download_mode_valid" CHECK("track_revisions"."download_mode" in ('public', 'account', 'protected', 'unavailable')),
	CONSTRAINT "track_revisions_tags_json_valid" CHECK(json_valid("track_revisions"."tags_json"))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `track_revisions_number_unique` ON `track_revisions` (`track_id`,`revision`);--> statement-breakpoint
CREATE INDEX `track_revisions_stream_idx` ON `track_revisions` (`stream_mode`,`streaming_derivative_id`);--> statement-breakpoint
CREATE TABLE `tracks` (
	`id` text PRIMARY KEY NOT NULL,
	`slug` text NOT NULL,
	`draft_revision_id` text NOT NULL,
	`published_revision_id` text,
	`publication_state` text DEFAULT 'draft' NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`last_operation_key` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`published_at` text,
	CONSTRAINT "tracks_slug_normalized" CHECK("tracks"."slug" = lower(trim("tracks"."slug"))),
	CONSTRAINT "tracks_slug_no_slash" CHECK(instr("tracks"."slug", '/') = 0),
	CONSTRAINT "tracks_publication_state_valid" CHECK("tracks"."publication_state" in ('draft', 'published', 'archived')),
	CONSTRAINT "tracks_version_positive" CHECK("tracks"."version" > 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `tracks_slug_unique` ON `tracks` (`slug`);--> statement-breakpoint
CREATE INDEX `tracks_public_lookup` ON `tracks` (`publication_state`,`slug`);--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_editor_permissions` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`permission_key` text NOT NULL,
	`scope_id` text DEFAULT '*' NOT NULL,
	`assigned_by_user_id` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`revoked_at` text,
	`revoked_by_user_id` text,
	`last_operation_key` text,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`assigned_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`revoked_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "editor_permissions_key_valid" CHECK("__new_editor_permissions"."permission_key" in ('pages.write', 'catalog.write', 'media.write'))
);
--> statement-breakpoint
INSERT INTO `__new_editor_permissions`("id", "user_id", "permission_key", "scope_id", "assigned_by_user_id", "created_at", "updated_at", "revoked_at", "revoked_by_user_id", "last_operation_key") SELECT "id", "user_id", "permission_key", "scope_id", "assigned_by_user_id", "created_at", "updated_at", "revoked_at", "revoked_by_user_id", "last_operation_key" FROM `editor_permissions`;--> statement-breakpoint
DROP TABLE `editor_permissions`;--> statement-breakpoint
ALTER TABLE `__new_editor_permissions` RENAME TO `editor_permissions`;--> statement-breakpoint
CREATE UNIQUE INDEX `editor_permissions_active_user_scope_unique` ON `editor_permissions` (`user_id`,`permission_key`,`scope_id`) WHERE "editor_permissions"."revoked_at" is null;--> statement-breakpoint
CREATE INDEX `editor_permissions_active_lookup` ON `editor_permissions` (`user_id`,`permission_key`,`revoked_at`);--> statement-breakpoint
CREATE TABLE `__new_installation_state` (
	`id` text PRIMARY KEY NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`owner_user_id` text,
	`schema_version` integer DEFAULT 4 NOT NULL,
	`last_operation_key` text,
	`bootstrap_completed_at` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`owner_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "installation_state_status_valid" CHECK("__new_installation_state"."status" in ('pending', 'active')),
	CONSTRAINT "installation_state_schema_version_positive" CHECK("__new_installation_state"."schema_version" > 0)
);
--> statement-breakpoint
INSERT INTO `__new_installation_state`("id", "status", "owner_user_id", "schema_version", "last_operation_key", "bootstrap_completed_at", "created_at", "updated_at") SELECT "id", "status", "owner_user_id", 4, "last_operation_key", "bootstrap_completed_at", "created_at", "updated_at" FROM `installation_state`;--> statement-breakpoint
DROP TABLE `installation_state`;--> statement-breakpoint
ALTER TABLE `__new_installation_state` RENAME TO `installation_state`;--> statement-breakpoint
CREATE TABLE `__new_media_objects` (
	`id` text PRIMARY KEY NOT NULL,
	`object_key` text NOT NULL,
	`kind` text DEFAULT 'other' NOT NULL,
	`visibility` text DEFAULT 'protected' NOT NULL,
	`owner_user_id` text,
	`content_type` text NOT NULL,
	`byte_length` integer NOT NULL,
	`etag` text,
	`source_version` integer DEFAULT 1 NOT NULL,
	`status` text DEFAULT 'ready' NOT NULL,
	`approval_state` text DEFAULT 'pending' NOT NULL,
	`content_sha256` text,
	`duration_ms` integer,
	`channels` integer,
	`sample_rate` integer,
	`approved_by_user_id` text,
	`approved_at` text,
	`last_operation_key` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`owner_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`approved_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "media_objects_byte_length_nonnegative" CHECK("__new_media_objects"."byte_length" >= 0),
	CONSTRAINT "media_objects_visibility_valid" CHECK("__new_media_objects"."visibility" in ('public', 'protected')),
	CONSTRAINT "media_objects_source_version_positive" CHECK("__new_media_objects"."source_version" > 0),
	CONSTRAINT "media_objects_status_valid" CHECK("__new_media_objects"."status" in ('pending', 'ready', 'failed', 'archived')),
	CONSTRAINT "media_objects_approval_valid" CHECK("__new_media_objects"."approval_state" in ('pending', 'approved', 'rejected')),
	CONSTRAINT "media_objects_duration_nonnegative" CHECK("__new_media_objects"."duration_ms" is null or "__new_media_objects"."duration_ms" >= 0)
);
--> statement-breakpoint
INSERT INTO `__new_media_objects`("id", "object_key", "kind", "visibility", "owner_user_id", "content_type", "byte_length", "etag", "source_version", "status", "approval_state", "content_sha256", "duration_ms", "channels", "sample_rate", "approved_by_user_id", "approved_at", "last_operation_key", "created_at", "updated_at") SELECT "id", "object_key", "kind", "visibility", "owner_user_id", "content_type", "byte_length", "etag", 1, 'ready', 'pending', NULL, NULL, NULL, NULL, NULL, NULL, NULL, "created_at", "created_at" FROM `media_objects`;--> statement-breakpoint
DROP TABLE `media_objects`;--> statement-breakpoint
ALTER TABLE `__new_media_objects` RENAME TO `media_objects`;--> statement-breakpoint
CREATE UNIQUE INDEX `media_objects_object_key_unique` ON `media_objects` (`object_key`);--> statement-breakpoint
CREATE INDEX `media_objects_visibility_idx` ON `media_objects` (`visibility`);--> statement-breakpoint
PRAGMA foreign_keys=ON;
