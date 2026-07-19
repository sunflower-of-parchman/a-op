PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_artist_modules` (
	`module_key` text PRIMARY KEY NOT NULL,
	`active` integer DEFAULT false NOT NULL,
	`revision` integer DEFAULT 1 NOT NULL,
	`settings_json` text DEFAULT '{}' NOT NULL,
	`activated_at` text,
	`deactivated_at` text,
	`updated_by_user_id` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`updated_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "artist_modules_active_valid" CHECK("__new_artist_modules"."active" in (0, 1)),
	CONSTRAINT "artist_modules_revision_positive" CHECK("__new_artist_modules"."revision" > 0),
	CONSTRAINT "artist_modules_settings_json_valid" CHECK(json_valid("__new_artist_modules"."settings_json"))
);
--> statement-breakpoint
INSERT INTO `__new_artist_modules`("module_key", "active", "revision", "settings_json", "activated_at", "deactivated_at", "updated_by_user_id", "created_at", "updated_at") SELECT "module_key", "active", 1, "settings_json", "activated_at", "deactivated_at", "updated_by_user_id", "created_at", "updated_at" FROM `artist_modules`;--> statement-breakpoint
DROP TABLE `artist_modules`;--> statement-breakpoint
ALTER TABLE `__new_artist_modules` RENAME TO `artist_modules`;--> statement-breakpoint
CREATE INDEX `artist_modules_active_idx` ON `artist_modules` (`active`,`module_key`);--> statement-breakpoint
CREATE TABLE `__new_navigation_sets` (
	`id` text PRIMARY KEY NOT NULL,
	`label` text NOT NULL,
	`draft_version` integer DEFAULT 1 NOT NULL,
	`published_version` integer,
	`revision` integer DEFAULT 1 NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`published_at` text,
	CONSTRAINT "navigation_sets_id_valid" CHECK("__new_navigation_sets"."id" in ('primary', 'footer')),
	CONSTRAINT "navigation_sets_draft_version_positive" CHECK("__new_navigation_sets"."draft_version" > 0),
	CONSTRAINT "navigation_sets_published_version_positive" CHECK("__new_navigation_sets"."published_version" is null or "__new_navigation_sets"."published_version" > 0),
	CONSTRAINT "navigation_sets_revision_positive" CHECK("__new_navigation_sets"."revision" > 0)
);
--> statement-breakpoint
INSERT INTO `__new_navigation_sets`("id", "label", "draft_version", "published_version", "revision", "created_at", "updated_at", "published_at") SELECT "id", "label", "draft_version", "published_version", 1, "created_at", "updated_at", "published_at" FROM `navigation_sets`;--> statement-breakpoint
DROP TABLE `navigation_sets`;--> statement-breakpoint
ALTER TABLE `__new_navigation_sets` RENAME TO `navigation_sets`;--> statement-breakpoint
CREATE TABLE `__new_pages` (
	`id` text PRIMARY KEY NOT NULL,
	`slug` text NOT NULL,
	`module_key` text,
	`kind` text DEFAULT 'standard' NOT NULL,
	`draft_revision_id` text NOT NULL,
	`published_revision_id` text,
	`publication_state` text DEFAULT 'draft' NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`published_at` text,
	CONSTRAINT "pages_slug_normalized" CHECK("__new_pages"."slug" = lower(trim("__new_pages"."slug"))),
	CONSTRAINT "pages_slug_no_slash" CHECK(instr("__new_pages"."slug", '/') = 0),
	CONSTRAINT "pages_kind_valid" CHECK("__new_pages"."kind" in ('standard', 'legal', 'system')),
	CONSTRAINT "pages_publication_state_valid" CHECK("__new_pages"."publication_state" in ('draft', 'published', 'archived')),
	CONSTRAINT "pages_version_positive" CHECK("__new_pages"."version" > 0)
);
--> statement-breakpoint
INSERT INTO `__new_pages`("id", "slug", "module_key", "kind", "draft_revision_id", "published_revision_id", "publication_state", "version", "created_at", "updated_at", "published_at") SELECT "id", "slug", "module_key", "kind", "draft_revision_id", "published_revision_id", "publication_state", 1, "created_at", "updated_at", "published_at" FROM `pages`;--> statement-breakpoint
DROP TABLE `pages`;--> statement-breakpoint
ALTER TABLE `__new_pages` RENAME TO `pages`;--> statement-breakpoint
CREATE UNIQUE INDEX `pages_slug_unique` ON `pages` (`slug`);--> statement-breakpoint
CREATE INDEX `pages_public_lookup` ON `pages` (`publication_state`,`module_key`,`slug`);--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
ALTER TABLE `profiles` ADD `revision` integer DEFAULT 1 NOT NULL;
