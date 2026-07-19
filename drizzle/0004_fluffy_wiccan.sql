CREATE TABLE `module_registry_state` (
	`id` text PRIMARY KEY NOT NULL,
	`revision` integer DEFAULT 1 NOT NULL,
	`last_operation_key` text,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	CONSTRAINT "module_registry_state_id_valid" CHECK("module_registry_state"."id" = 'registry'),
	CONSTRAINT "module_registry_state_revision_positive" CHECK("module_registry_state"."revision" > 0)
);
--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_installation_state` (
	`id` text PRIMARY KEY NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`owner_user_id` text,
	`schema_version` integer DEFAULT 3 NOT NULL,
	`last_operation_key` text,
	`bootstrap_completed_at` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`owner_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "installation_state_status_valid" CHECK("__new_installation_state"."status" in ('pending', 'active')),
	CONSTRAINT "installation_state_schema_version_positive" CHECK("__new_installation_state"."schema_version" > 0)
);
--> statement-breakpoint
INSERT INTO `__new_installation_state`("id", "status", "owner_user_id", "schema_version", "last_operation_key", "bootstrap_completed_at", "created_at", "updated_at") SELECT "id", "status", "owner_user_id", 3, NULL, "bootstrap_completed_at", "created_at", "updated_at" FROM `installation_state`;--> statement-breakpoint
DROP TABLE `installation_state`;--> statement-breakpoint
ALTER TABLE `__new_installation_state` RENAME TO `installation_state`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
ALTER TABLE `artist_config` ADD `last_operation_key` text;--> statement-breakpoint
ALTER TABLE `editor_permissions` ADD `last_operation_key` text;--> statement-breakpoint
ALTER TABLE `navigation_sets` ADD `last_operation_key` text;--> statement-breakpoint
ALTER TABLE `page_revisions` ADD `module_key` text;--> statement-breakpoint
ALTER TABLE `page_revisions` ADD `kind` text DEFAULT 'standard' NOT NULL;--> statement-breakpoint
UPDATE `page_revisions`
SET `module_key` = (SELECT `pages`.`module_key` FROM `pages` WHERE `pages`.`id` = `page_revisions`.`page_id`),
    `kind` = (SELECT `pages`.`kind` FROM `pages` WHERE `pages`.`id` = `page_revisions`.`page_id`);--> statement-breakpoint
ALTER TABLE `pages` ADD `last_operation_key` text;--> statement-breakpoint
ALTER TABLE `profiles` ADD `last_operation_key` text;--> statement-breakpoint
ALTER TABLE `role_assignments` ADD `last_operation_key` text;--> statement-breakpoint
INSERT INTO `module_registry_state` (`id`, `revision`) VALUES ('registry', 1);
