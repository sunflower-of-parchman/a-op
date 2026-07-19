CREATE UNIQUE INDEX `credits_release_position_unique` ON `credits` (`release_revision_id`,`position`) WHERE "credits"."release_revision_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX `credits_track_position_unique` ON `credits` (`track_revision_id`,`position`) WHERE "credits"."track_revision_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX `credits_collection_position_unique` ON `credits` (`collection_revision_id`,`position`) WHERE "credits"."collection_revision_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX `media_jobs_profile_unique` ON `media_jobs` (`source_media_id`,`derivative_kind`,`processing_profile`,`processing_version`);--> statement-breakpoint
CREATE UNIQUE INDEX `release_tracks_number_unique` ON `release_tracks` (`release_revision_id`,`disc_number`,`track_number`);--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_media_derivatives` (
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
	`revision` integer DEFAULT 1 NOT NULL,
	`approved_by_user_id` text,
	`approved_at` text,
	`last_operation_key` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`source_media_id`) REFERENCES `media_objects`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`approved_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "media_derivatives_status_valid" CHECK("__new_media_derivatives"."status" in ('pending', 'processing', 'ready', 'failed')),
	CONSTRAINT "media_derivatives_approval_valid" CHECK("__new_media_derivatives"."approval_state" in ('pending', 'approved', 'rejected')),
	CONSTRAINT "media_derivatives_byte_length_nonnegative" CHECK("__new_media_derivatives"."byte_length" is null or "__new_media_derivatives"."byte_length" >= 0),
	CONSTRAINT "media_derivatives_duration_nonnegative" CHECK("__new_media_derivatives"."duration_ms" is null or "__new_media_derivatives"."duration_ms" >= 0),
	CONSTRAINT "media_derivatives_ready_complete" CHECK("__new_media_derivatives"."status" != 'ready' or ("__new_media_derivatives"."object_key" is not null and "__new_media_derivatives"."content_type" is not null and "__new_media_derivatives"."byte_length" is not null)),
	CONSTRAINT "media_derivatives_revision_positive" CHECK("__new_media_derivatives"."revision" > 0),
	CONSTRAINT "media_derivatives_key_namespace" CHECK("__new_media_derivatives"."object_key" is null or "__new_media_derivatives"."object_key" glob 'derivatives/*')
);
--> statement-breakpoint
INSERT INTO `__new_media_derivatives`("id", "source_media_id", "kind", "processing_profile", "processing_version", "object_key", "status", "approval_state", "content_type", "format", "bitrate_kbps", "duration_ms", "channels", "sample_rate", "byte_length", "content_sha256", "revision", "approved_by_user_id", "approved_at", "last_operation_key", "created_at", "updated_at") SELECT "id", "source_media_id", "kind", "processing_profile", "processing_version", "object_key", "status", "approval_state", "content_type", "format", "bitrate_kbps", "duration_ms", "channels", "sample_rate", "byte_length", "content_sha256", "revision", "approved_by_user_id", "approved_at", "last_operation_key", "created_at", "updated_at" FROM `media_derivatives`;--> statement-breakpoint
DROP TABLE `media_derivatives`;--> statement-breakpoint
ALTER TABLE `__new_media_derivatives` RENAME TO `media_derivatives`;--> statement-breakpoint
CREATE UNIQUE INDEX `media_derivatives_object_key_unique` ON `media_derivatives` (`object_key`) WHERE "media_derivatives"."object_key" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX `media_derivatives_profile_unique` ON `media_derivatives` (`source_media_id`,`kind`,`processing_profile`,`processing_version`);--> statement-breakpoint
CREATE INDEX `media_derivatives_delivery_idx` ON `media_derivatives` (`status`,`approval_state`,`kind`);--> statement-breakpoint
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
	`revision` integer DEFAULT 1 NOT NULL,
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
	CONSTRAINT "media_objects_duration_nonnegative" CHECK("__new_media_objects"."duration_ms" is null or "__new_media_objects"."duration_ms" >= 0),
	CONSTRAINT "media_objects_revision_positive" CHECK("__new_media_objects"."revision" > 0),
	CONSTRAINT "media_objects_key_namespace" CHECK("__new_media_objects"."object_key" glob 'originals/*' or "__new_media_objects"."object_key" glob 'runtime-lab/*')
);
--> statement-breakpoint
INSERT INTO `__new_media_objects`("id", "object_key", "kind", "visibility", "owner_user_id", "content_type", "byte_length", "etag", "source_version", "status", "approval_state", "content_sha256", "duration_ms", "channels", "sample_rate", "revision", "approved_by_user_id", "approved_at", "last_operation_key", "created_at", "updated_at") SELECT "id", "object_key", "kind", "visibility", "owner_user_id", "content_type", "byte_length", "etag", "source_version", "status", "approval_state", "content_sha256", "duration_ms", "channels", "sample_rate", "revision", "approved_by_user_id", "approved_at", "last_operation_key", "created_at", "updated_at" FROM `media_objects`;--> statement-breakpoint
DROP TABLE `media_objects`;--> statement-breakpoint
ALTER TABLE `__new_media_objects` RENAME TO `media_objects`;--> statement-breakpoint
CREATE UNIQUE INDEX `media_objects_object_key_unique` ON `media_objects` (`object_key`);--> statement-breakpoint
CREATE INDEX `media_objects_visibility_idx` ON `media_objects` (`visibility`);--> statement-breakpoint
PRAGMA foreign_keys=ON;
