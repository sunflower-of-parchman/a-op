PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_installation_state` (
	`id` text PRIMARY KEY NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`owner_user_id` text,
	`schema_version` integer DEFAULT 12 NOT NULL,
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
CREATE TABLE `__new_updates` (
	`id` text PRIMARY KEY NOT NULL,
	`slug` text NOT NULL,
	`title` text NOT NULL,
	`summary` text DEFAULT '' NOT NULL,
	`body_json` text DEFAULT '[]' NOT NULL,
	`audience` text DEFAULT 'public' NOT NULL,
	`resource_type` text,
	`resource_id` text,
	`state` text DEFAULT 'draft' NOT NULL,
	`published_at` text,
	`revision` integer DEFAULT 1 NOT NULL,
	`last_operation_key` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	CONSTRAINT "updates_slug_normalized" CHECK("__new_updates"."slug" = lower(trim("__new_updates"."slug")) and instr("__new_updates"."slug", '/') = 0),
	CONSTRAINT "updates_body_json_valid" CHECK(json_valid("__new_updates"."body_json") and json_type("__new_updates"."body_json") = 'array'),
	CONSTRAINT "updates_audience_valid" CHECK("__new_updates"."audience" in ('public', 'account')),
	CONSTRAINT "updates_resource_valid" CHECK(("__new_updates"."resource_type" is null and "__new_updates"."resource_id" is null) or ("__new_updates"."resource_type" in ('track', 'release', 'collection', 'course', 'video', 'page', 'license', 'membership', 'subscription', 'order') and "__new_updates"."resource_id" is not null)),
	CONSTRAINT "updates_order_audience_private" CHECK("__new_updates"."resource_type" is not 'order' or "__new_updates"."audience" = 'account'),
	CONSTRAINT "updates_state_valid" CHECK("__new_updates"."state" in ('draft', 'published', 'archived')),
	CONSTRAINT "updates_publication_valid" CHECK(("__new_updates"."state" = 'published' and "__new_updates"."published_at" is not null) or ("__new_updates"."state" <> 'published')),
	CONSTRAINT "updates_revision_positive" CHECK("__new_updates"."revision" > 0)
);
--> statement-breakpoint
INSERT INTO `__new_updates`("id", "slug", "title", "summary", "body_json", "audience", "resource_type", "resource_id", "state", "published_at", "revision", "last_operation_key", "created_at", "updated_at") SELECT "id", "slug", "title", "summary", "body_json", "audience", "resource_type", "resource_id", "state", "published_at", "revision", "last_operation_key", "created_at", "updated_at" FROM `updates`;--> statement-breakpoint
DROP TABLE `updates`;--> statement-breakpoint
ALTER TABLE `__new_updates` RENAME TO `updates`;--> statement-breakpoint
CREATE UNIQUE INDEX `updates_slug_unique` ON `updates` (`slug`);--> statement-breakpoint
CREATE INDEX `updates_state_published_idx` ON `updates` (`state`,`published_at`);--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
UPDATE `installation_state`
SET `schema_version` = 12,
    `updated_at` = CURRENT_TIMESTAMP
WHERE `id` = 'installation' AND `schema_version` = 11;
