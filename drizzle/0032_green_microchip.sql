CREATE TABLE `membership_credit_rules` (
	`id` text PRIMARY KEY NOT NULL,
	`rule_key` text NOT NULL,
	`credit_kind` text NOT NULL,
	`membership_plan_id` text,
	`membership_plan_revision_id` text,
	`membership_plan_revision` integer,
	`subscription_plan_id` text,
	`subscription_plan_revision` integer,
	`amount` integer NOT NULL,
	`cadence` text NOT NULL,
	`state` text DEFAULT 'active' NOT NULL,
	`revision` integer DEFAULT 1 NOT NULL,
	`created_by_user_id` text,
	`last_operation_key` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`created_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`membership_plan_revision_id`,`membership_plan_id`,`membership_plan_revision`) REFERENCES `membership_plan_revisions`(`id`,`membership_plan_id`,`revision`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`subscription_plan_id`,`subscription_plan_revision`) REFERENCES `subscription_plans`(`id`,`revision`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "membership_credit_rules_key_valid" CHECK(length("membership_credit_rules"."rule_key") between 1 and 100 and "membership_credit_rules"."rule_key" = lower(trim("membership_credit_rules"."rule_key")) and "membership_credit_rules"."rule_key" not glob '*[^a-z0-9-]*' and "membership_credit_rules"."rule_key" not like '-%' and "membership_credit_rules"."rule_key" not like '%-' and instr("membership_credit_rules"."rule_key", '--') = 0),
	CONSTRAINT "membership_credit_rules_subject_valid" CHECK((
        "membership_credit_rules"."membership_plan_id" is not null
        and "membership_credit_rules"."membership_plan_revision_id" is not null
        and "membership_credit_rules"."membership_plan_revision" > 0
        and "membership_credit_rules"."subscription_plan_id" is null
        and "membership_credit_rules"."subscription_plan_revision" is null
        and "membership_credit_rules"."cadence" = 'once'
      ) or (
        "membership_credit_rules"."membership_plan_id" is null
        and "membership_credit_rules"."membership_plan_revision_id" is null
        and "membership_credit_rules"."membership_plan_revision" is null
        and "membership_credit_rules"."subscription_plan_id" is not null
        and "membership_credit_rules"."subscription_plan_revision" > 0
        and "membership_credit_rules"."cadence" in ('month', 'year')
      )),
	CONSTRAINT "membership_credit_rules_kind_valid" CHECK("membership_credit_rules"."credit_kind" in ('download', 'license')),
	CONSTRAINT "membership_credit_rules_amount_positive" CHECK("membership_credit_rules"."amount" > 0),
	CONSTRAINT "membership_credit_rules_state_valid" CHECK("membership_credit_rules"."state" in ('active', 'archived')),
	CONSTRAINT "membership_credit_rules_revision_positive" CHECK("membership_credit_rules"."revision" > 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `membership_credit_rules_key_unique` ON `membership_credit_rules` (`rule_key`);--> statement-breakpoint
CREATE UNIQUE INDEX `membership_credit_rules_operation_key_unique` ON `membership_credit_rules` (`last_operation_key`);--> statement-breakpoint
CREATE UNIQUE INDEX `membership_credit_rules_membership_kind_unique` ON `membership_credit_rules` (`membership_plan_revision_id`,`credit_kind`) WHERE "membership_credit_rules"."membership_plan_revision_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX `membership_credit_rules_subscription_kind_unique` ON `membership_credit_rules` (`subscription_plan_id`,`subscription_plan_revision`,`credit_kind`) WHERE "membership_credit_rules"."subscription_plan_id" is not null;--> statement-breakpoint
CREATE INDEX `membership_credit_rules_state_kind_idx` ON `membership_credit_rules` (`state`,`credit_kind`,`rule_key`);--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_installation_state` (
	`id` text PRIMARY KEY NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`owner_user_id` text,
	`schema_version` integer DEFAULT 19 NOT NULL,
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
UPDATE installation_state
SET schema_version = 19, updated_at = CURRENT_TIMESTAMP
WHERE id = 'installation' AND schema_version = 18;
