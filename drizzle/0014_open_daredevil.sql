PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `__access_subject_migration_guard` (
	`invalid_count` integer NOT NULL,
	CONSTRAINT "access_subject_migration_guard_zero" CHECK(`invalid_count` = 0)
);--> statement-breakpoint
DELETE FROM `__access_subject_migration_guard`;--> statement-breakpoint
INSERT INTO `__access_subject_migration_guard` (`invalid_count`)
SELECT COUNT(*)
FROM `entitlements` AS entitlement
LEFT JOIN `access_grants` AS access_grant
	ON access_grant.`id` = entitlement.`grant_id`
WHERE entitlement.`source_type` = 'grant'
	AND (
		access_grant.`id` IS NULL
		OR entitlement.`source_id` <> access_grant.`id`
		OR entitlement.`user_id` <> access_grant.`grantee_user_id`
		OR entitlement.`resource_type` <> access_grant.`resource_type`
		OR entitlement.`resource_id` <> access_grant.`resource_id`
	);--> statement-breakpoint
DROP TABLE `__access_subject_migration_guard`;--> statement-breakpoint
CREATE UNIQUE INDEX `__access_grants_identity_migration_unique` ON `access_grants` (`id`,`grantee_user_id`,`resource_type`,`resource_id`);--> statement-breakpoint
CREATE TABLE `access_grant_sets` (
	`id` text PRIMARY KEY NOT NULL,
	`access_plan_id` text NOT NULL,
	`access_plan_revision` integer NOT NULL,
	`grantee_user_id` text NOT NULL,
	`state` text DEFAULT 'pending' NOT NULL,
	`starts_at` text,
	`expires_at` text,
	`reason` text DEFAULT '' NOT NULL,
	`granted_by_user_id` text,
	`activated_at` text,
	`revoked_at` text,
	`revoked_by_user_id` text,
	`expired_at` text,
	`expired_by_user_id` text,
	`revision` integer DEFAULT 1 NOT NULL,
	`last_operation_key` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`access_plan_id`) REFERENCES `access_plans`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`grantee_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`granted_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`revoked_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`expired_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "access_grant_sets_state_valid" CHECK("access_grant_sets"."state" in ('pending', 'active', 'revoked', 'expired')),
	CONSTRAINT "access_grant_sets_window_valid" CHECK("access_grant_sets"."starts_at" is null or "access_grant_sets"."expires_at" is null or "access_grant_sets"."starts_at" < "access_grant_sets"."expires_at"),
	CONSTRAINT "access_grant_sets_reason_length_valid" CHECK(length("access_grant_sets"."reason") <= 1000),
	CONSTRAINT "access_grant_sets_terminal_state_valid" CHECK(("access_grant_sets"."state" = 'pending' and "access_grant_sets"."activated_at" is null and "access_grant_sets"."revoked_at" is null and "access_grant_sets"."expired_at" is null) or ("access_grant_sets"."state" = 'active' and "access_grant_sets"."activated_at" is not null and "access_grant_sets"."revoked_at" is null and "access_grant_sets"."expired_at" is null) or ("access_grant_sets"."state" = 'revoked' and "access_grant_sets"."activated_at" is not null and "access_grant_sets"."revoked_at" is not null and "access_grant_sets"."expired_at" is null) or ("access_grant_sets"."state" = 'expired' and "access_grant_sets"."activated_at" is not null and "access_grant_sets"."expired_at" is not null and "access_grant_sets"."revoked_at" is null)),
	CONSTRAINT "access_grant_sets_plan_revision_positive" CHECK("access_grant_sets"."access_plan_revision" > 0),
	CONSTRAINT "access_grant_sets_revision_positive" CHECK("access_grant_sets"."revision" > 0)
);
--> statement-breakpoint
CREATE INDEX `access_grant_sets_grantee_state_idx` ON `access_grant_sets` (`grantee_user_id`,`state`,`created_at`);--> statement-breakpoint
CREATE INDEX `access_grant_sets_plan_state_idx` ON `access_grant_sets` (`access_plan_id`,`state`);--> statement-breakpoint
CREATE INDEX `access_grant_sets_expiry_idx` ON `access_grant_sets` (`state`,`expires_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `access_grant_sets_identity_unique` ON `access_grant_sets` (`id`,`access_plan_id`,`grantee_user_id`);--> statement-breakpoint
CREATE TABLE `access_plan_items` (
	`id` text PRIMARY KEY NOT NULL,
	`access_plan_id` text NOT NULL,
	`position` integer NOT NULL,
	`resource_type` text NOT NULL,
	`resource_id` text NOT NULL,
	`actions_json` text NOT NULL,
	`remaining_uses` integer,
	`download_disposition` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`access_plan_id`) REFERENCES `access_plans`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "access_plan_items_position_positive" CHECK("access_plan_items"."position" > 0),
	CONSTRAINT "access_plan_items_resource_type_valid" CHECK("access_plan_items"."resource_type" in ('track', 'release', 'collection', 'course', 'lesson', 'license-document')),
	CONSTRAINT "access_plan_items_actions_json_valid" CHECK(json_valid("access_plan_items"."actions_json") and json_type("access_plan_items"."actions_json") = 'array' and json_array_length("access_plan_items"."actions_json") between 1 and 3),
	CONSTRAINT "access_plan_items_remaining_uses_nonnegative" CHECK("access_plan_items"."remaining_uses" is null or "access_plan_items"."remaining_uses" >= 0),
	CONSTRAINT "access_plan_items_download_disposition_valid" CHECK("access_plan_items"."download_disposition" is null or "access_plan_items"."download_disposition" in ('inline', 'attachment'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `access_plan_items_position_unique` ON `access_plan_items` (`access_plan_id`,`position`);--> statement-breakpoint
CREATE UNIQUE INDEX `access_plan_items_resource_unique` ON `access_plan_items` (`access_plan_id`,`resource_type`,`resource_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `access_plan_items_identity_unique` ON `access_plan_items` (`id`,`access_plan_id`,`resource_type`,`resource_id`);--> statement-breakpoint
CREATE INDEX `access_plan_items_resource_idx` ON `access_plan_items` (`resource_type`,`resource_id`);--> statement-breakpoint
CREATE TABLE `access_plans` (
	`id` text PRIMARY KEY NOT NULL,
	`slug` text NOT NULL,
	`name` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`state` text DEFAULT 'active' NOT NULL,
	`revision` integer DEFAULT 1 NOT NULL,
	`last_operation_key` text,
	`created_by_user_id` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`created_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "access_plans_slug_normalized" CHECK("access_plans"."slug" = lower(trim("access_plans"."slug"))),
	CONSTRAINT "access_plans_slug_no_slash" CHECK(instr("access_plans"."slug", '/') = 0),
	CONSTRAINT "access_plans_name_length_valid" CHECK(length(trim("access_plans"."name")) between 1 and 120),
	CONSTRAINT "access_plans_description_length_valid" CHECK(length("access_plans"."description") <= 2000),
	CONSTRAINT "access_plans_state_valid" CHECK("access_plans"."state" in ('active', 'archived')),
	CONSTRAINT "access_plans_revision_positive" CHECK("access_plans"."revision" > 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `access_plans_slug_unique` ON `access_plans` (`slug`);--> statement-breakpoint
CREATE INDEX `access_plans_state_name_idx` ON `access_plans` (`state`,`name`);--> statement-breakpoint
CREATE TABLE `__new_entitlements` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`source_type` text NOT NULL,
	`source_id` text NOT NULL,
	`grant_id` text,
	`resource_type` text NOT NULL,
	`resource_id` text NOT NULL,
	`actions_json` text DEFAULT '[]' NOT NULL,
	`state` text DEFAULT 'active' NOT NULL,
	`starts_at` text,
	`expires_at` text,
	`remaining_uses` integer,
	`download_disposition` text,
	`revision` integer DEFAULT 1 NOT NULL,
	`last_operation_key` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`grant_id`,`user_id`,`resource_type`,`resource_id`) REFERENCES `access_grants`(`id`,`grantee_user_id`,`resource_type`,`resource_id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "entitlements_source_type_valid" CHECK("__new_entitlements"."source_type" in ('grant', 'membership', 'subscription', 'license', 'credit')),
	CONSTRAINT "entitlements_grant_source_valid" CHECK((
        ("__new_entitlements"."source_type" = 'grant' and "__new_entitlements"."grant_id" is not null and "__new_entitlements"."source_id" = "__new_entitlements"."grant_id")
        or
        ("__new_entitlements"."source_type" <> 'grant' and "__new_entitlements"."grant_id" is null)
      )),
	CONSTRAINT "entitlements_resource_type_valid" CHECK("__new_entitlements"."resource_type" in ('track', 'release', 'collection', 'course', 'lesson', 'license-document')),
	CONSTRAINT "entitlements_actions_json_valid" CHECK(json_valid("__new_entitlements"."actions_json") and json_type("__new_entitlements"."actions_json") = 'array'),
	CONSTRAINT "entitlements_state_valid" CHECK("__new_entitlements"."state" in ('active', 'revoked', 'expired', 'exhausted')),
	CONSTRAINT "entitlements_remaining_uses_nonnegative" CHECK("__new_entitlements"."remaining_uses" is null or "__new_entitlements"."remaining_uses" >= 0),
	CONSTRAINT "entitlements_download_disposition_valid" CHECK("__new_entitlements"."download_disposition" is null or "__new_entitlements"."download_disposition" in ('inline', 'attachment')),
	CONSTRAINT "entitlements_revision_positive" CHECK("__new_entitlements"."revision" > 0)
);
--> statement-breakpoint
INSERT INTO `__new_entitlements`("id", "user_id", "source_type", "source_id", "grant_id", "resource_type", "resource_id", "actions_json", "state", "starts_at", "expires_at", "remaining_uses", "download_disposition", "revision", "last_operation_key", "created_at", "updated_at") SELECT "id", "user_id", "source_type", "source_id", "grant_id", "resource_type", "resource_id", "actions_json", "state", "starts_at", "expires_at", "remaining_uses", "download_disposition", "revision", "last_operation_key", "created_at", "updated_at" FROM `entitlements`;--> statement-breakpoint
DROP TABLE `entitlements`;--> statement-breakpoint
ALTER TABLE `__new_entitlements` RENAME TO `entitlements`;--> statement-breakpoint
CREATE UNIQUE INDEX `entitlements_source_resource_unique` ON `entitlements` (`source_type`,`source_id`,`resource_type`,`resource_id`);--> statement-breakpoint
CREATE INDEX `entitlements_user_state_resource_idx` ON `entitlements` (`user_id`,`state`,`resource_type`,`resource_id`);--> statement-breakpoint
CREATE INDEX `entitlements_expiry_idx` ON `entitlements` (`state`,`expires_at`);--> statement-breakpoint
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
INSERT INTO `__new_access_grants`("id", "grantee_user_id", "grant_set_id", "access_plan_id", "access_plan_item_id", "resource_type", "resource_id", "actions_json", "state", "starts_at", "expires_at", "remaining_uses", "download_disposition", "reason", "granted_by_user_id", "revoked_at", "revoked_by_user_id", "expired_at", "expired_by_user_id", "revision", "last_operation_key", "created_at", "updated_at")
SELECT "id", "grantee_user_id", NULL, NULL, NULL, "resource_type", "resource_id",
	"actions_json", "state", "starts_at", "expires_at", "remaining_uses",
	"download_disposition", "reason", "granted_by_user_id",
	CASE WHEN "state" = 'revoked'
		THEN COALESCE("revoked_at", "updated_at", "created_at", CURRENT_TIMESTAMP)
		ELSE NULL END,
	CASE WHEN "state" = 'revoked' THEN "revoked_by_user_id" ELSE NULL END,
	NULL, NULL, "revision", "last_operation_key", "created_at", "updated_at"
FROM `access_grants`;--> statement-breakpoint
DROP TABLE `access_grants`;--> statement-breakpoint
ALTER TABLE `__new_access_grants` RENAME TO `access_grants`;--> statement-breakpoint
CREATE INDEX `access_grants_grantee_state_resource_idx` ON `access_grants` (`grantee_user_id`,`state`,`resource_type`,`resource_id`);--> statement-breakpoint
CREATE INDEX `access_grants_expiry_idx` ON `access_grants` (`state`,`expires_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `access_grants_set_item_unique` ON `access_grants` (`grant_set_id`,`access_plan_item_id`) WHERE "access_grants"."grant_set_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX `access_grants_identity_unique` ON `access_grants` (`id`,`grantee_user_id`,`resource_type`,`resource_id`);--> statement-breakpoint
CREATE TABLE `__new_installation_state` (
	`id` text PRIMARY KEY NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`owner_user_id` text,
	`schema_version` integer DEFAULT 6 NOT NULL,
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
ALTER TABLE `__new_installation_state` RENAME TO `installation_state`;
--> statement-breakpoint
UPDATE `installation_state`
SET `schema_version` = 6,
	`updated_at` = CURRENT_TIMESTAMP
WHERE `id` = 'installation';--> statement-breakpoint
PRAGMA foreign_keys=ON;
