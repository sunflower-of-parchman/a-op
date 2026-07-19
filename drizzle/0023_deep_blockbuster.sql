CREATE TABLE `content_section_revisions` (
	`id` text PRIMARY KEY NOT NULL,
	`content_section_id` text NOT NULL,
	`revision` integer NOT NULL,
	`kind` text DEFAULT 'prose' NOT NULL,
	`heading` text DEFAULT '' NOT NULL,
	`body_text` text NOT NULL,
	`created_by_user_id` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`content_section_id`) REFERENCES `content_sections`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`created_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "content_section_revisions_kind_valid" CHECK("content_section_revisions"."kind" in ('prose', 'quote', 'callout')),
	CONSTRAINT "content_section_revisions_body_present" CHECK(length(trim("content_section_revisions"."body_text")) > 0),
	CONSTRAINT "content_section_revisions_number_positive" CHECK("content_section_revisions"."revision" > 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `content_section_revisions_number_unique` ON `content_section_revisions` (`content_section_id`,`revision`);--> statement-breakpoint
CREATE UNIQUE INDEX `content_section_revisions_identity_section_unique` ON `content_section_revisions` (`id`,`content_section_id`);--> statement-breakpoint
CREATE TABLE `content_sections` (
	`id` text PRIMARY KEY NOT NULL,
	`section_key` text NOT NULL,
	`draft_revision_id` text NOT NULL,
	`published_revision_id` text,
	`publication_state` text DEFAULT 'draft' NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`last_operation_key` text,
	`published_at` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	CONSTRAINT "content_sections_key_normalized" CHECK("content_sections"."section_key" = lower(trim("content_sections"."section_key")) and instr("content_sections"."section_key", '/') = 0),
	CONSTRAINT "content_sections_publication_state_valid" CHECK("content_sections"."publication_state" in ('draft', 'published', 'archived')),
	CONSTRAINT "content_sections_publication_fields_valid" CHECK(("content_sections"."publication_state" = 'published' and "content_sections"."published_revision_id" is not null and "content_sections"."published_at" is not null) or ("content_sections"."publication_state" <> 'published')),
	CONSTRAINT "content_sections_version_positive" CHECK("content_sections"."version" > 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `content_sections_key_unique` ON `content_sections` (`section_key`);--> statement-breakpoint
CREATE INDEX `content_sections_publication_key_idx` ON `content_sections` (`publication_state`,`section_key`);--> statement-breakpoint
CREATE TABLE `page_revision_sections` (
	`id` text PRIMARY KEY NOT NULL,
	`page_revision_id` text NOT NULL,
	`position` integer NOT NULL,
	`content_section_id` text NOT NULL,
	`content_section_revision_id` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`page_revision_id`) REFERENCES `page_revisions`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`content_section_revision_id`,`content_section_id`) REFERENCES `content_section_revisions`(`id`,`content_section_id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "page_revision_sections_position_positive" CHECK("page_revision_sections"."position" > 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `page_revision_sections_position_unique` ON `page_revision_sections` (`page_revision_id`,`position`);--> statement-breakpoint
CREATE UNIQUE INDEX `page_revision_sections_section_unique` ON `page_revision_sections` (`page_revision_id`,`content_section_id`);--> statement-breakpoint
CREATE INDEX `page_revision_sections_section_revision_idx` ON `page_revision_sections` (`content_section_id`,`content_section_revision_id`);--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
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
	CONSTRAINT "updates_state_valid" CHECK("__new_updates"."state" in ('draft', 'published', 'archived')),
	CONSTRAINT "updates_publication_valid" CHECK(("__new_updates"."state" = 'published' and "__new_updates"."published_at" is not null) or ("__new_updates"."state" <> 'published')),
	CONSTRAINT "updates_revision_positive" CHECK("__new_updates"."revision" > 0)
);
--> statement-breakpoint
INSERT INTO `__new_updates`("id", "slug", "title", "summary", "body_json", "audience", "resource_type", "resource_id", "state", "published_at", "revision", "last_operation_key", "created_at", "updated_at") SELECT "id", "slug", "title", "summary", "body_json", "audience", "resource_type", "resource_id", "state", "published_at", "revision", "last_operation_key", "created_at", "updated_at" FROM `updates`;--> statement-breakpoint
DROP TABLE `updates`;--> statement-breakpoint
ALTER TABLE `__new_updates` RENAME TO `updates`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `updates_slug_unique` ON `updates` (`slug`);--> statement-breakpoint
CREATE INDEX `updates_state_published_idx` ON `updates` (`state`,`published_at`);--> statement-breakpoint
CREATE TABLE `__new_installation_state` (
	`id` text PRIMARY KEY NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`owner_user_id` text,
	`schema_version` integer DEFAULT 11 NOT NULL,
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
UPDATE `installation_state`
SET `schema_version` = 11,
    `updated_at` = CURRENT_TIMESTAMP
WHERE `id` = 'installation' AND `schema_version` = 10;
