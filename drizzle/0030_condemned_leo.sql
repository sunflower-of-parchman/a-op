CREATE TABLE `access_grant_templates` (
	`id` text PRIMARY KEY NOT NULL,
	`template_key` text NOT NULL,
	`label` text NOT NULL,
	`access_plan_id` text NOT NULL,
	`access_plan_revision` integer NOT NULL,
	`default_duration_days` integer,
	`state` text DEFAULT 'active' NOT NULL,
	`revision` integer DEFAULT 1 NOT NULL,
	`created_by_user_id` text,
	`last_operation_key` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`created_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`access_plan_id`,`access_plan_revision`) REFERENCES `access_plans`(`id`,`revision`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "access_grant_templates_key_valid" CHECK(length("access_grant_templates"."template_key") between 1 and 100 and "access_grant_templates"."template_key" = lower(trim("access_grant_templates"."template_key")) and "access_grant_templates"."template_key" not glob '*[^a-z0-9-]*' and "access_grant_templates"."template_key" not like '-%' and "access_grant_templates"."template_key" not like '%-' and instr("access_grant_templates"."template_key", '--') = 0),
	CONSTRAINT "access_grant_templates_label_valid" CHECK(length(trim("access_grant_templates"."label")) between 1 and 160),
	CONSTRAINT "access_grant_templates_plan_revision_positive" CHECK("access_grant_templates"."access_plan_revision" > 0),
	CONSTRAINT "access_grant_templates_duration_valid" CHECK("access_grant_templates"."default_duration_days" is null or "access_grant_templates"."default_duration_days" between 1 and 36500),
	CONSTRAINT "access_grant_templates_state_valid" CHECK("access_grant_templates"."state" in ('active', 'archived')),
	CONSTRAINT "access_grant_templates_revision_positive" CHECK("access_grant_templates"."revision" > 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `access_grant_templates_key_unique` ON `access_grant_templates` (`template_key`);--> statement-breakpoint
CREATE UNIQUE INDEX `access_grant_templates_operation_key_unique` ON `access_grant_templates` (`last_operation_key`);--> statement-breakpoint
CREATE INDEX `access_grant_templates_state_label_idx` ON `access_grant_templates` (`state`,`label`);--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_installation_state` (
	`id` text PRIMARY KEY NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`owner_user_id` text,
	`schema_version` integer DEFAULT 17 NOT NULL,
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
CREATE UNIQUE INDEX `access_plans_identity_revision_unique` ON `access_plans` (`id`,`revision`);--> statement-breakpoint
UPDATE `installation_state`
SET `schema_version` = 17,
	`updated_at` = CURRENT_TIMESTAMP
WHERE `id` = 'installation' AND `schema_version` = 16;
