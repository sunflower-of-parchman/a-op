CREATE TABLE `commerce_binding_intents` (
	`id` text PRIMARY KEY NOT NULL,
	`intent_key` text NOT NULL,
	`intent_kind` text NOT NULL,
	`name` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`membership_plan_id` text,
	`membership_plan_revision_id` text,
	`membership_plan_revision` integer,
	`subscription_plan_id` text,
	`subscription_plan_revision` integer,
	`track_id` text,
	`track_revision_id` text,
	`track_revision` integer,
	`license_terms_id` text,
	`license_terms_version_id` text,
	`license_terms_version` integer,
	`license_option_id` text,
	`amount_minor` integer NOT NULL,
	`currency` text NOT NULL,
	`billing_interval` text NOT NULL,
	`interval_count` integer DEFAULT 1 NOT NULL,
	`binding_state` text DEFAULT 'pending' NOT NULL,
	`commerce_product_id` text,
	`commerce_price_id` text,
	`stripe_environment` text DEFAULT 'test' NOT NULL,
	`livemode` integer DEFAULT false NOT NULL,
	`revision` integer DEFAULT 1 NOT NULL,
	`created_by_user_id` text,
	`last_operation_key` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`created_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`membership_plan_revision_id`,`membership_plan_id`,`membership_plan_revision`) REFERENCES `membership_plan_revisions`(`id`,`membership_plan_id`,`revision`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`subscription_plan_id`,`subscription_plan_revision`) REFERENCES `subscription_plans`(`id`,`revision`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`track_id`,`track_revision_id`,`track_revision`) REFERENCES `track_revisions`(`track_id`,`id`,`revision`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`license_terms_version_id`,`license_terms_id`,`license_terms_version`) REFERENCES `license_terms_versions`(`id`,`license_terms_id`,`version`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`license_option_id`,`license_terms_version_id`) REFERENCES `license_options`(`id`,`license_terms_version_id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`commerce_price_id`,`commerce_product_id`) REFERENCES `commerce_prices`(`id`,`commerce_product_id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "commerce_binding_intents_key_valid" CHECK(length("commerce_binding_intents"."intent_key") between 1 and 120 and "commerce_binding_intents"."intent_key" = lower(trim("commerce_binding_intents"."intent_key")) and "commerce_binding_intents"."intent_key" not glob '*[^a-z0-9-]*' and "commerce_binding_intents"."intent_key" not like '-%' and "commerce_binding_intents"."intent_key" not like '%-' and instr("commerce_binding_intents"."intent_key", '--') = 0),
	CONSTRAINT "commerce_binding_intents_text_valid" CHECK(length(trim("commerce_binding_intents"."name")) between 1 and 160 and length("commerce_binding_intents"."description") <= 4000),
	CONSTRAINT "commerce_binding_intents_subject_valid" CHECK((
        "commerce_binding_intents"."intent_kind" = 'membership'
        and "commerce_binding_intents"."membership_plan_id" is not null
        and "commerce_binding_intents"."membership_plan_revision_id" is not null
        and "commerce_binding_intents"."membership_plan_revision" > 0
        and "commerce_binding_intents"."subscription_plan_id" is null
        and "commerce_binding_intents"."subscription_plan_revision" is null
        and "commerce_binding_intents"."track_id" is null
        and "commerce_binding_intents"."track_revision_id" is null
        and "commerce_binding_intents"."track_revision" is null
        and "commerce_binding_intents"."license_terms_id" is null
        and "commerce_binding_intents"."license_terms_version_id" is null
        and "commerce_binding_intents"."license_terms_version" is null
        and "commerce_binding_intents"."license_option_id" is null
      ) or (
        "commerce_binding_intents"."intent_kind" = 'subscription'
        and "commerce_binding_intents"."membership_plan_id" is null
        and "commerce_binding_intents"."membership_plan_revision_id" is null
        and "commerce_binding_intents"."membership_plan_revision" is null
        and "commerce_binding_intents"."subscription_plan_id" is not null
        and "commerce_binding_intents"."subscription_plan_revision" > 0
        and "commerce_binding_intents"."track_id" is null
        and "commerce_binding_intents"."track_revision_id" is null
        and "commerce_binding_intents"."track_revision" is null
        and "commerce_binding_intents"."license_terms_id" is null
        and "commerce_binding_intents"."license_terms_version_id" is null
        and "commerce_binding_intents"."license_terms_version" is null
        and "commerce_binding_intents"."license_option_id" is null
      ) or (
        "commerce_binding_intents"."intent_kind" = 'license'
        and "commerce_binding_intents"."membership_plan_id" is null
        and "commerce_binding_intents"."membership_plan_revision_id" is null
        and "commerce_binding_intents"."membership_plan_revision" is null
        and "commerce_binding_intents"."subscription_plan_id" is null
        and "commerce_binding_intents"."subscription_plan_revision" is null
        and "commerce_binding_intents"."track_id" is not null
        and "commerce_binding_intents"."track_revision_id" is not null
        and "commerce_binding_intents"."track_revision" > 0
        and "commerce_binding_intents"."license_terms_id" is not null
        and "commerce_binding_intents"."license_terms_version_id" is not null
        and "commerce_binding_intents"."license_terms_version" > 0
        and "commerce_binding_intents"."license_option_id" is not null
      )),
	CONSTRAINT "commerce_binding_intents_price_valid" CHECK("commerce_binding_intents"."amount_minor" > 0 and length("commerce_binding_intents"."currency") = 3 and "commerce_binding_intents"."currency" = upper("commerce_binding_intents"."currency") and "commerce_binding_intents"."interval_count" > 0 and (("commerce_binding_intents"."intent_kind" = 'subscription' and "commerce_binding_intents"."billing_interval" in ('month', 'year')) or ("commerce_binding_intents"."intent_kind" in ('membership', 'license') and "commerce_binding_intents"."billing_interval" = 'one_time'))),
	CONSTRAINT "commerce_binding_intents_binding_valid" CHECK((
        "commerce_binding_intents"."binding_state" = 'pending'
        and "commerce_binding_intents"."commerce_product_id" is null
        and "commerce_binding_intents"."commerce_price_id" is null
      ) or (
        "commerce_binding_intents"."binding_state" = 'bound'
        and "commerce_binding_intents"."commerce_product_id" is not null
        and "commerce_binding_intents"."commerce_price_id" is not null
      ) or (
        "commerce_binding_intents"."binding_state" = 'archived'
        and (("commerce_binding_intents"."commerce_product_id" is null and "commerce_binding_intents"."commerce_price_id" is null) or ("commerce_binding_intents"."commerce_product_id" is not null and "commerce_binding_intents"."commerce_price_id" is not null))
      )),
	CONSTRAINT "commerce_binding_intents_test_only" CHECK("commerce_binding_intents"."stripe_environment" = 'test' and "commerce_binding_intents"."livemode" = 0),
	CONSTRAINT "commerce_binding_intents_revision_positive" CHECK("commerce_binding_intents"."revision" > 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `commerce_binding_intents_key_unique` ON `commerce_binding_intents` (`intent_key`);--> statement-breakpoint
CREATE UNIQUE INDEX `commerce_binding_intents_operation_key_unique` ON `commerce_binding_intents` (`last_operation_key`);--> statement-breakpoint
CREATE UNIQUE INDEX `commerce_binding_intents_membership_revision_unique` ON `commerce_binding_intents` (`membership_plan_revision_id`) WHERE "commerce_binding_intents"."membership_plan_revision_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX `commerce_binding_intents_subscription_revision_unique` ON `commerce_binding_intents` (`subscription_plan_id`,`subscription_plan_revision`) WHERE "commerce_binding_intents"."subscription_plan_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX `commerce_binding_intents_license_subject_unique` ON `commerce_binding_intents` (`track_revision_id`,`license_option_id`) WHERE "commerce_binding_intents"."track_revision_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX `commerce_binding_intents_bound_product_unique` ON `commerce_binding_intents` (`commerce_product_id`) WHERE "commerce_binding_intents"."commerce_product_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX `commerce_binding_intents_bound_price_unique` ON `commerce_binding_intents` (`commerce_price_id`) WHERE "commerce_binding_intents"."commerce_price_id" is not null;--> statement-breakpoint
CREATE INDEX `commerce_binding_intents_state_kind_idx` ON `commerce_binding_intents` (`binding_state`,`intent_kind`,`intent_key`);--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_installation_state` (
	`id` text PRIMARY KEY NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`owner_user_id` text,
	`schema_version` integer DEFAULT 18 NOT NULL,
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
CREATE UNIQUE INDEX `track_revisions_identity_number_unique` ON `track_revisions` (`track_id`,`id`,`revision`);--> statement-breakpoint
UPDATE `installation_state`
SET `schema_version` = 18,
	`updated_at` = CURRENT_TIMESTAMP
WHERE `id` = 'installation' AND `schema_version` = 17;
