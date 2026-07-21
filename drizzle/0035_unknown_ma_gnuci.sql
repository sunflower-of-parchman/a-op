DROP TABLE `runtime_proofs`;--> statement-breakpoint
DELETE FROM `media_objects` WHERE `object_key` glob 'runtime-lab/*';--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
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
	CONSTRAINT "media_objects_kind_valid" CHECK("__new_media_objects"."kind" in ('audio', 'image', 'video', 'document', 'export', 'other')),
	CONSTRAINT "media_objects_source_version_positive" CHECK("__new_media_objects"."source_version" > 0),
	CONSTRAINT "media_objects_status_valid" CHECK("__new_media_objects"."status" in ('pending', 'ready', 'failed', 'archived')),
	CONSTRAINT "media_objects_approval_valid" CHECK("__new_media_objects"."approval_state" in ('pending', 'approved', 'rejected')),
	CONSTRAINT "media_objects_duration_nonnegative" CHECK("__new_media_objects"."duration_ms" is null or "__new_media_objects"."duration_ms" >= 0),
	CONSTRAINT "media_objects_revision_positive" CHECK("__new_media_objects"."revision" > 0),
	CONSTRAINT "media_objects_key_namespace" CHECK("__new_media_objects"."object_key" glob 'originals/*')
);
--> statement-breakpoint
INSERT INTO `__new_media_objects`("id", "object_key", "kind", "visibility", "owner_user_id", "content_type", "byte_length", "etag", "source_version", "status", "approval_state", "content_sha256", "duration_ms", "channels", "sample_rate", "revision", "approved_by_user_id", "approved_at", "last_operation_key", "created_at", "updated_at") SELECT "id", "object_key", "kind", "visibility", "owner_user_id", "content_type", "byte_length", "etag", "source_version", "status", "approval_state", "content_sha256", "duration_ms", "channels", "sample_rate", "revision", "approved_by_user_id", "approved_at", "last_operation_key", "created_at", "updated_at" FROM `media_objects`;--> statement-breakpoint
DROP TABLE `media_objects`;--> statement-breakpoint
ALTER TABLE `__new_media_objects` RENAME TO `media_objects`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `media_objects_object_key_unique` ON `media_objects` (`object_key`);--> statement-breakpoint
CREATE INDEX `media_objects_visibility_idx` ON `media_objects` (`visibility`);
