PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_course_revisions` (
	`id` text PRIMARY KEY NOT NULL,
	`course_id` text NOT NULL,
	`revision` integer NOT NULL,
	`title` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`access_mode` text DEFAULT 'public' NOT NULL,
	`access_plan_id` text,
	`access_plan_revision` integer,
	`estimated_minutes` integer,
	`created_by_user_id` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`course_id`) REFERENCES `courses`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`access_plan_id`) REFERENCES `access_plans`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`created_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "course_revisions_number_positive" CHECK("__new_course_revisions"."revision" > 0),
	CONSTRAINT "course_revisions_access_mode_valid" CHECK("__new_course_revisions"."access_mode" in ('public', 'account', 'protected')),
	CONSTRAINT "course_revisions_access_plan_valid" CHECK(("__new_course_revisions"."access_plan_id" is null and "__new_course_revisions"."access_plan_revision" is null) or ("__new_course_revisions"."access_mode" = 'protected' and "__new_course_revisions"."access_plan_id" is not null and "__new_course_revisions"."access_plan_revision" > 0)),
	CONSTRAINT "course_revisions_estimate_positive" CHECK("__new_course_revisions"."estimated_minutes" is null or "__new_course_revisions"."estimated_minutes" > 0)
);
--> statement-breakpoint
INSERT INTO `__new_course_revisions`("id", "course_id", "revision", "title", "description", "access_mode", "access_plan_id", "access_plan_revision", "estimated_minutes", "created_by_user_id", "created_at") SELECT "id", "course_id", "revision", "title", "description", "access_mode", "access_plan_id", "access_plan_revision", "estimated_minutes", "created_by_user_id", "created_at" FROM `course_revisions`;--> statement-breakpoint
DROP TABLE `course_revisions`;--> statement-breakpoint
ALTER TABLE `__new_course_revisions` RENAME TO `course_revisions`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `course_revisions_number_unique` ON `course_revisions` (`course_id`,`revision`);--> statement-breakpoint
CREATE UNIQUE INDEX `course_revisions_identity_course_unique` ON `course_revisions` (`id`,`course_id`);--> statement-breakpoint
CREATE TABLE `__new_access_grants` (
	`id` text PRIMARY KEY NOT NULL,
	`grantee_user_id` text NOT NULL,
	`grant_set_id` text,
	`access_plan_id` text,
	`access_plan_item_id` text,
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
	`expired_at` text,
	`expired_by_user_id` text,
	`revision` integer DEFAULT 1 NOT NULL,
	`last_operation_key` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`grantee_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`access_plan_id`) REFERENCES `access_plans`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`granted_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`revoked_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`expired_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`grant_set_id`,`access_plan_id`,`grantee_user_id`) REFERENCES `access_grant_sets`(`id`,`access_plan_id`,`grantee_user_id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`access_plan_item_id`,`access_plan_id`,`resource_type`,`resource_id`) REFERENCES `access_plan_items`(`id`,`access_plan_id`,`resource_type`,`resource_id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "access_grants_resource_type_valid" CHECK("__new_access_grants"."resource_type" in ('track', 'release', 'collection', 'course', 'lesson', 'license-document')),
	CONSTRAINT "access_grants_actions_json_valid" CHECK(json_valid("__new_access_grants"."actions_json") and json_type("__new_access_grants"."actions_json") = 'array'),
	CONSTRAINT "access_grants_state_valid" CHECK("__new_access_grants"."state" in ('active', 'revoked', 'expired')),
	CONSTRAINT "access_grants_remaining_uses_nonnegative" CHECK("__new_access_grants"."remaining_uses" is null or "__new_access_grants"."remaining_uses" >= 0),
	CONSTRAINT "access_grants_download_disposition_valid" CHECK("__new_access_grants"."download_disposition" is null or "__new_access_grants"."download_disposition" in ('inline', 'attachment')),
	CONSTRAINT "access_grants_reason_length_valid" CHECK(length("__new_access_grants"."reason") <= 1000),
	CONSTRAINT "access_grants_plan_link_valid" CHECK(("__new_access_grants"."grant_set_id" is null and "__new_access_grants"."access_plan_id" is null and "__new_access_grants"."access_plan_item_id" is null) or ("__new_access_grants"."grant_set_id" is not null and "__new_access_grants"."access_plan_id" is not null and "__new_access_grants"."access_plan_item_id" is not null)),
	CONSTRAINT "access_grants_terminal_state_valid" CHECK(("__new_access_grants"."state" = 'active' and "__new_access_grants"."revoked_at" is null and "__new_access_grants"."expired_at" is null) or ("__new_access_grants"."state" = 'revoked' and "__new_access_grants"."revoked_at" is not null and "__new_access_grants"."expired_at" is null) or ("__new_access_grants"."state" = 'expired' and "__new_access_grants"."expired_at" is not null and "__new_access_grants"."revoked_at" is null)),
	CONSTRAINT "access_grants_revision_positive" CHECK("__new_access_grants"."revision" > 0)
);
--> statement-breakpoint
INSERT INTO `__new_access_grants`("id", "grantee_user_id", "grant_set_id", "access_plan_id", "access_plan_item_id", "resource_type", "resource_id", "actions_json", "state", "starts_at", "expires_at", "remaining_uses", "download_disposition", "reason", "granted_by_user_id", "revoked_at", "revoked_by_user_id", "expired_at", "expired_by_user_id", "revision", "last_operation_key", "created_at", "updated_at") SELECT "id", "grantee_user_id", "grant_set_id", "access_plan_id", "access_plan_item_id", "resource_type", "resource_id", "actions_json", "state", "starts_at", "expires_at", "remaining_uses", "download_disposition", "reason", "granted_by_user_id", "revoked_at", "revoked_by_user_id", "expired_at", "expired_by_user_id", "revision", "last_operation_key", "created_at", "updated_at" FROM `access_grants`;--> statement-breakpoint
DROP TABLE `access_grants`;--> statement-breakpoint
ALTER TABLE `__new_access_grants` RENAME TO `access_grants`;--> statement-breakpoint
CREATE INDEX `access_grants_grantee_state_resource_idx` ON `access_grants` (`grantee_user_id`,`state`,`resource_type`,`resource_id`);--> statement-breakpoint
CREATE INDEX `access_grants_expiry_idx` ON `access_grants` (`state`,`expires_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `access_grants_set_item_unique` ON `access_grants` (`grant_set_id`,`access_plan_item_id`) WHERE "access_grants"."grant_set_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX `access_grants_identity_unique` ON `access_grants` (`id`,`grantee_user_id`,`resource_type`,`resource_id`);
