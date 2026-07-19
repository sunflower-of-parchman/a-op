CREATE TABLE `export_manifests` (
	`id` text PRIMARY KEY NOT NULL,
	`export_key` text NOT NULL,
	`schema_version` integer NOT NULL,
	`source_state_fingerprint` text NOT NULL,
	`manifest_sha256` text,
	`file_count` integer DEFAULT 0 NOT NULL,
	`media_object_count` integer DEFAULT 0 NOT NULL,
	`byte_count` integer DEFAULT 0 NOT NULL,
	`status` text DEFAULT 'preparing' NOT NULL,
	`contains_customer_data` integer DEFAULT false NOT NULL,
	`contains_provider_payload` integer DEFAULT false NOT NULL,
	`archive_media_object_id` text,
	`safe_failure_code` text,
	`exported_by_user_id` text NOT NULL,
	`verified_at` text,
	`last_operation_key` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`archive_media_object_id`) REFERENCES `media_objects`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`exported_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "export_manifests_export_key_valid" CHECK(length("export_manifests"."export_key") between 16 and 160 and "export_manifests"."export_key" not glob '*[^a-zA-Z0-9:_-]*'),
	CONSTRAINT "export_manifests_schema_version_positive" CHECK("export_manifests"."schema_version" > 0),
	CONSTRAINT "export_manifests_source_fingerprint_valid" CHECK(length("export_manifests"."source_state_fingerprint") = 64 and "export_manifests"."source_state_fingerprint" = lower("export_manifests"."source_state_fingerprint") and "export_manifests"."source_state_fingerprint" not glob '*[^0-9a-f]*'),
	CONSTRAINT "export_manifests_hash_valid" CHECK("export_manifests"."manifest_sha256" is null or (length("export_manifests"."manifest_sha256") = 64 and "export_manifests"."manifest_sha256" = lower("export_manifests"."manifest_sha256") and "export_manifests"."manifest_sha256" not glob '*[^0-9a-f]*')),
	CONSTRAINT "export_manifests_counts_nonnegative" CHECK("export_manifests"."file_count" >= 0 and "export_manifests"."media_object_count" >= 0 and "export_manifests"."byte_count" >= 0),
	CONSTRAINT "export_manifests_status_valid" CHECK("export_manifests"."status" in ('preparing', 'ready', 'verified', 'failed')),
	CONSTRAINT "export_manifests_portable_only" CHECK("export_manifests"."contains_customer_data" = 0 and "export_manifests"."contains_provider_payload" = 0),
	CONSTRAINT "export_manifests_failure_code_safe" CHECK("export_manifests"."safe_failure_code" is null or (length("export_manifests"."safe_failure_code") between 1 and 96 and "export_manifests"."safe_failure_code" = upper("export_manifests"."safe_failure_code") and "export_manifests"."safe_failure_code" not glob '*[^A-Z0-9_]*')),
	CONSTRAINT "export_manifests_lifecycle_consistent" CHECK(("export_manifests"."status" = 'preparing' and "export_manifests"."manifest_sha256" is null and "export_manifests"."verified_at" is null and "export_manifests"."safe_failure_code" is null) or ("export_manifests"."status" = 'ready' and "export_manifests"."manifest_sha256" is not null and "export_manifests"."verified_at" is null and "export_manifests"."safe_failure_code" is null) or ("export_manifests"."status" = 'verified' and "export_manifests"."manifest_sha256" is not null and "export_manifests"."verified_at" is not null and "export_manifests"."safe_failure_code" is null) or ("export_manifests"."status" = 'failed' and "export_manifests"."verified_at" is null and "export_manifests"."safe_failure_code" is not null))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `export_manifests_export_key_unique` ON `export_manifests` (`export_key`);--> statement-breakpoint
CREATE UNIQUE INDEX `export_manifests_operation_key_unique` ON `export_manifests` (`last_operation_key`);--> statement-breakpoint
CREATE INDEX `export_manifests_status_recent_idx` ON `export_manifests` (`status`,`created_at`);--> statement-breakpoint
CREATE TABLE `setup_applications` (
	`id` text PRIMARY KEY NOT NULL,
	`application_key` text NOT NULL,
	`proposal_hash` text NOT NULL,
	`proposal_schema_version` integer NOT NULL,
	`source_state_fingerprint` text NOT NULL,
	`approval_hash` text NOT NULL,
	`approved_by_user_id` text NOT NULL,
	`approved_at` text NOT NULL,
	`status` text DEFAULT 'applying' NOT NULL,
	`result_state_fingerprint` text,
	`operation_count` integer DEFAULT 0 NOT NULL,
	`media_object_count` integer DEFAULT 0 NOT NULL,
	`media_byte_count` integer DEFAULT 0 NOT NULL,
	`result_json` text DEFAULT '{}' NOT NULL,
	`safe_failure_code` text,
	`last_operation_key` text,
	`started_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`completed_at` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`approved_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "setup_applications_application_key_valid" CHECK(length("setup_applications"."application_key") between 16 and 160 and "setup_applications"."application_key" not glob '*[^a-zA-Z0-9:_-]*'),
	CONSTRAINT "setup_applications_proposal_hash_valid" CHECK(length("setup_applications"."proposal_hash") = 64 and "setup_applications"."proposal_hash" = lower("setup_applications"."proposal_hash") and "setup_applications"."proposal_hash" not glob '*[^0-9a-f]*'),
	CONSTRAINT "setup_applications_schema_version_positive" CHECK("setup_applications"."proposal_schema_version" > 0),
	CONSTRAINT "setup_applications_source_fingerprint_valid" CHECK(length("setup_applications"."source_state_fingerprint") = 64 and "setup_applications"."source_state_fingerprint" = lower("setup_applications"."source_state_fingerprint") and "setup_applications"."source_state_fingerprint" not glob '*[^0-9a-f]*'),
	CONSTRAINT "setup_applications_approval_hash_valid" CHECK(length("setup_applications"."approval_hash") = 64 and "setup_applications"."approval_hash" = lower("setup_applications"."approval_hash") and "setup_applications"."approval_hash" not glob '*[^0-9a-f]*'),
	CONSTRAINT "setup_applications_status_valid" CHECK("setup_applications"."status" in ('applying', 'applied', 'failed')),
	CONSTRAINT "setup_applications_result_fingerprint_valid" CHECK("setup_applications"."result_state_fingerprint" is null or (length("setup_applications"."result_state_fingerprint") = 64 and "setup_applications"."result_state_fingerprint" = lower("setup_applications"."result_state_fingerprint") and "setup_applications"."result_state_fingerprint" not glob '*[^0-9a-f]*')),
	CONSTRAINT "setup_applications_counts_nonnegative" CHECK("setup_applications"."operation_count" >= 0 and "setup_applications"."media_object_count" >= 0 and "setup_applications"."media_byte_count" >= 0),
	CONSTRAINT "setup_applications_result_json_valid" CHECK(json_valid("setup_applications"."result_json") and json_type("setup_applications"."result_json") = 'object'),
	CONSTRAINT "setup_applications_failure_code_safe" CHECK("setup_applications"."safe_failure_code" is null or (length("setup_applications"."safe_failure_code") between 1 and 96 and "setup_applications"."safe_failure_code" = upper("setup_applications"."safe_failure_code") and "setup_applications"."safe_failure_code" not glob '*[^A-Z0-9_]*')),
	CONSTRAINT "setup_applications_completion_consistent" CHECK(("setup_applications"."status" = 'applying' and "setup_applications"."completed_at" is null and "setup_applications"."result_state_fingerprint" is null and "setup_applications"."safe_failure_code" is null) or ("setup_applications"."status" = 'applied' and "setup_applications"."completed_at" is not null and "setup_applications"."result_state_fingerprint" is not null and "setup_applications"."safe_failure_code" is null) or ("setup_applications"."status" = 'failed' and "setup_applications"."completed_at" is not null and "setup_applications"."safe_failure_code" is not null))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `setup_applications_application_key_unique` ON `setup_applications` (`application_key`);--> statement-breakpoint
CREATE UNIQUE INDEX `setup_applications_operation_key_unique` ON `setup_applications` (`last_operation_key`);--> statement-breakpoint
CREATE INDEX `setup_applications_status_recent_idx` ON `setup_applications` (`status`,`created_at`);--> statement-breakpoint
CREATE TABLE `setup_state` (
	`id` text PRIMARY KEY NOT NULL,
	`status` text DEFAULT 'unconfigured' NOT NULL,
	`proposal_schema_version` integer,
	`last_proposal_hash` text,
	`last_application_id` text,
	`state_fingerprint` text,
	`revision` integer DEFAULT 1 NOT NULL,
	`last_operation_key` text,
	`updated_by_user_id` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`last_application_id`) REFERENCES `setup_applications`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`updated_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "setup_state_singleton" CHECK("setup_state"."id" = 'setup'),
	CONSTRAINT "setup_state_status_valid" CHECK("setup_state"."status" in ('unconfigured', 'applying', 'applied', 'attention_required')),
	CONSTRAINT "setup_state_proposal_pair_consistent" CHECK(("setup_state"."proposal_schema_version" is null and "setup_state"."last_proposal_hash" is null) or ("setup_state"."proposal_schema_version" is not null and "setup_state"."proposal_schema_version" > 0 and length("setup_state"."last_proposal_hash") = 64 and "setup_state"."last_proposal_hash" = lower("setup_state"."last_proposal_hash") and "setup_state"."last_proposal_hash" not glob '*[^0-9a-f]*')),
	CONSTRAINT "setup_state_fingerprint_valid" CHECK("setup_state"."state_fingerprint" is null or (length("setup_state"."state_fingerprint") = 64 and "setup_state"."state_fingerprint" = lower("setup_state"."state_fingerprint") and "setup_state"."state_fingerprint" not glob '*[^0-9a-f]*')),
	CONSTRAINT "setup_state_application_consistent" CHECK("setup_state"."status" = 'unconfigured' or "setup_state"."last_application_id" is not null),
	CONSTRAINT "setup_state_revision_positive" CHECK("setup_state"."revision" > 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `setup_state_operation_key_unique` ON `setup_state` (`last_operation_key`);--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_installation_state` (
	`id` text PRIMARY KEY NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`owner_user_id` text,
	`schema_version` integer DEFAULT 16 NOT NULL,
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
UPDATE `installation_state`
SET `schema_version` = 16,
    `updated_at` = CURRENT_TIMESTAMP
WHERE `schema_version` = 15;--> statement-breakpoint
INSERT INTO `setup_state` (
  `id`,
  `status`,
  `revision`,
  `created_at`,
  `updated_at`
)
VALUES ('setup', 'unconfigured', 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT (`id`) DO NOTHING;
