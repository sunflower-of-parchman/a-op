CREATE TABLE `legal_document_versions` (
	`id` text PRIMARY KEY NOT NULL,
	`document_id` text NOT NULL,
	`version` integer NOT NULL,
	`title` text NOT NULL,
	`introduction` text NOT NULL,
	`body_text` text NOT NULL,
	`setup_answers_json` text DEFAULT '{}' NOT NULL,
	`created_by_user_id` text,
	`approved_by_user_id` text,
	`approved_at` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`document_id`) REFERENCES `legal_documents`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`created_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`approved_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "legal_document_versions_number_positive" CHECK("legal_document_versions"."version" > 0),
	CONSTRAINT "legal_document_versions_content_present" CHECK(length(trim("legal_document_versions"."title")) between 1 and 160 and length(trim("legal_document_versions"."body_text")) between 1 and 40000 and length("legal_document_versions"."introduction") <= 4000),
	CONSTRAINT "legal_document_versions_answers_json_valid" CHECK(json_valid("legal_document_versions"."setup_answers_json") and json_type("legal_document_versions"."setup_answers_json") = 'object'),
	CONSTRAINT "legal_document_versions_approval_consistent" CHECK(("legal_document_versions"."approved_by_user_id" is null and "legal_document_versions"."approved_at" is null) or ("legal_document_versions"."approved_by_user_id" is not null and "legal_document_versions"."approved_at" is not null))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `legal_document_versions_document_number_unique` ON `legal_document_versions` (`document_id`,`version`);--> statement-breakpoint
CREATE UNIQUE INDEX `legal_document_versions_identity_document_unique` ON `legal_document_versions` (`id`,`document_id`);--> statement-breakpoint
CREATE TABLE `legal_documents` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`draft_version_id` text NOT NULL,
	`approved_version_id` text,
	`published_version_id` text,
	`current_version` integer DEFAULT 1 NOT NULL,
	`revision` integer DEFAULT 1 NOT NULL,
	`last_operation_key` text,
	`published_at` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	CONSTRAINT "legal_documents_id_valid" CHECK("legal_documents"."id" in ('privacy', 'terms')),
	CONSTRAINT "legal_documents_title_present" CHECK(length(trim("legal_documents"."title")) between 1 and 160),
	CONSTRAINT "legal_documents_version_positive" CHECK("legal_documents"."current_version" > 0),
	CONSTRAINT "legal_documents_revision_positive" CHECK("legal_documents"."revision" > 0),
	CONSTRAINT "legal_documents_publication_consistent" CHECK(("legal_documents"."published_version_id" is null and "legal_documents"."published_at" is null) or ("legal_documents"."published_version_id" is not null and "legal_documents"."published_at" is not null))
);
--> statement-breakpoint
CREATE TABLE `operational_failures` (
	`id` text PRIMARY KEY NOT NULL,
	`component` text NOT NULL,
	`code` text NOT NULL,
	`severity` text NOT NULL,
	`request_id` text,
	`subject_type` text,
	`subject_id` text,
	`occurrence_count` integer DEFAULT 1 NOT NULL,
	`first_occurred_at` text NOT NULL,
	`last_occurred_at` text NOT NULL,
	`resolved_at` text,
	`last_operation_key` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	CONSTRAINT "operational_failures_component_valid" CHECK("operational_failures"."component" in ('application', 'database', 'identity', 'media', 'migration', 'job', 'access')),
	CONSTRAINT "operational_failures_code_safe" CHECK(length("operational_failures"."code") between 1 and 96 and "operational_failures"."code" = upper("operational_failures"."code") and "operational_failures"."code" not glob '*[^A-Z0-9_]*'),
	CONSTRAINT "operational_failures_severity_valid" CHECK("operational_failures"."severity" in ('warning', 'error')),
	CONSTRAINT "operational_failures_subject_consistent" CHECK(("operational_failures"."subject_type" is null and "operational_failures"."subject_id" is null) or ("operational_failures"."subject_type" is not null and "operational_failures"."subject_id" is not null)),
	CONSTRAINT "operational_failures_count_positive" CHECK("operational_failures"."occurrence_count" > 0)
);
--> statement-breakpoint
CREATE INDEX `operational_failures_recent_idx` ON `operational_failures` (`resolved_at`,`last_occurred_at`);--> statement-breakpoint
CREATE INDEX `operational_failures_component_code_idx` ON `operational_failures` (`component`,`code`);--> statement-breakpoint
CREATE TABLE `telemetry_aggregate_days` (
	`day_utc` text PRIMARY KEY NOT NULL,
	`source_event_count` integer NOT NULL,
	`group_count` integer NOT NULL,
	`finalized_at` text NOT NULL,
	`last_operation_key` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	CONSTRAINT "telemetry_aggregate_days_counts_valid" CHECK("telemetry_aggregate_days"."source_event_count" > 0 and "telemetry_aggregate_days"."group_count" > 0 and "telemetry_aggregate_days"."group_count" <= "telemetry_aggregate_days"."source_event_count")
);
--> statement-breakpoint
CREATE UNIQUE INDEX `telemetry_aggregate_days_operation_unique` ON `telemetry_aggregate_days` (`last_operation_key`);--> statement-breakpoint
CREATE TABLE `telemetry_daily_aggregates` (
	`id` text PRIMARY KEY NOT NULL,
	`day_utc` text NOT NULL,
	`event_name` text NOT NULL,
	`resource_type` text NOT NULL,
	`resource_id` text NOT NULL,
	`event_count` integer NOT NULL,
	`session_count` integer NOT NULL,
	`linked_user_count` integer NOT NULL,
	`aggregated_at` text NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	CONSTRAINT "telemetry_daily_aggregates_counts_valid" CHECK("telemetry_daily_aggregates"."event_count" > 0 and "telemetry_daily_aggregates"."session_count" > 0 and "telemetry_daily_aggregates"."linked_user_count" >= 0 and "telemetry_daily_aggregates"."session_count" <= "telemetry_daily_aggregates"."event_count" and "telemetry_daily_aggregates"."linked_user_count" <= "telemetry_daily_aggregates"."session_count")
);
--> statement-breakpoint
CREATE UNIQUE INDEX `telemetry_daily_aggregates_group_unique` ON `telemetry_daily_aggregates` (`day_utc`,`event_name`,`resource_type`,`resource_id`);--> statement-breakpoint
CREATE INDEX `telemetry_daily_aggregates_day_idx` ON `telemetry_daily_aggregates` (`day_utc`);--> statement-breakpoint
CREATE TABLE `telemetry_events` (
	`id` text PRIMARY KEY NOT NULL,
	`session_id` text NOT NULL,
	`user_id` text,
	`event_name` text NOT NULL,
	`resource_type` text DEFAULT 'site' NOT NULL,
	`resource_id` text DEFAULT 'site' NOT NULL,
	`consent_basis` text NOT NULL,
	`day_utc` text NOT NULL,
	`occurred_at` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "telemetry_events_name_valid" CHECK("telemetry_events"."event_name" in ('contact-submitted', 'contact-view', 'course-view', 'download-delivered', 'favorite-saved', 'lesson-completed', 'license-issued', 'licensing-view', 'meaningful-listen', 'membership-activated', 'membership-view', 'music-view', 'playback-start', 'playlist-updated', 'protected-resource-delivered', 'release-view', 'subscription-activated', 'subscription-canceled', 'track-view', 'update-read', 'update-view', 'video-playback-start', 'video-view')),
	CONSTRAINT "telemetry_events_resource_type_valid" CHECK("telemetry_events"."resource_type" in ('site', 'track', 'release', 'collection', 'course', 'lesson', 'video', 'update', 'contact', 'membership', 'subscription', 'license', 'download', 'playlist', 'protected-resource')),
	CONSTRAINT "telemetry_events_resource_id_valid" CHECK(length(trim("telemetry_events"."resource_id")) between 1 and 128 and instr("telemetry_events"."resource_id", '/') = 0),
	CONSTRAINT "telemetry_events_consent_basis_valid" CHECK("telemetry_events"."consent_basis" in ('explicit', 'not_required')),
	CONSTRAINT "telemetry_events_day_valid" CHECK(length("telemetry_events"."day_utc") = 10 and substr("telemetry_events"."day_utc", 5, 1) = '-' and substr("telemetry_events"."day_utc", 8, 1) = '-')
);
--> statement-breakpoint
CREATE INDEX `telemetry_events_day_event_idx` ON `telemetry_events` (`day_utc`,`event_name`);--> statement-breakpoint
CREATE INDEX `telemetry_events_session_day_idx` ON `telemetry_events` (`session_id`,`day_utc`);--> statement-breakpoint
CREATE INDEX `telemetry_events_resource_day_idx` ON `telemetry_events` (`resource_type`,`resource_id`,`day_utc`);--> statement-breakpoint
CREATE TABLE `telemetry_settings` (
	`id` text PRIMARY KEY NOT NULL,
	`collection_mode` text DEFAULT 'consent_required' NOT NULL,
	`retention_days` integer DEFAULT 30 NOT NULL,
	`meaningful_listen_seconds` integer DEFAULT 10 NOT NULL,
	`revision` integer DEFAULT 1 NOT NULL,
	`updated_by_user_id` text,
	`last_operation_key` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`updated_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "telemetry_settings_singleton" CHECK("telemetry_settings"."id" = 'telemetry'),
	CONSTRAINT "telemetry_settings_mode_valid" CHECK("telemetry_settings"."collection_mode" in ('disabled', 'consent_required', 'anonymous')),
	CONSTRAINT "telemetry_settings_retention_valid" CHECK("telemetry_settings"."retention_days" between 1 and 365),
	CONSTRAINT "telemetry_settings_listen_threshold_valid" CHECK("telemetry_settings"."meaningful_listen_seconds" between 5 and 300),
	CONSTRAINT "telemetry_settings_revision_positive" CHECK("telemetry_settings"."revision" > 0)
);
--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_installation_state` (
	`id` text PRIMARY KEY NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`owner_user_id` text,
	`schema_version` integer DEFAULT 14 NOT NULL,
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
INSERT INTO `telemetry_settings`
  (`id`, `collection_mode`, `retention_days`, `meaningful_listen_seconds`, `revision`)
VALUES
  ('telemetry', 'consent_required', 30, 10, 1);--> statement-breakpoint
INSERT INTO `legal_documents`
  (`id`, `title`, `draft_version_id`, `current_version`, `revision`)
VALUES
  ('privacy', 'Privacy Policy', 'legal_privacy_version_1', 1, 1),
  ('terms', 'Terms and Conditions', 'legal_terms_version_1', 1, 1);--> statement-breakpoint
INSERT INTO `legal_document_versions`
  (`id`, `document_id`, `version`, `title`, `introduction`, `body_text`, `setup_answers_json`)
VALUES
  ('legal_privacy_version_1', 'privacy', 1, 'Privacy Policy',
   'Artist review required before publication.',
   'This starter records the topics the artist must review for their Site, including accounts, contact inquiries, telemetry, retention, protected delivery, Stripe Test Mode, Sites storage, and the services used to operate the installation.',
   '{}'),
  ('legal_terms_version_1', 'terms', 1, 'Terms and Conditions',
   'Artist review required before publication.',
   'This starter records the terms the artist must review for their Site. The installation demonstrates simulated commerce in Stripe Test Mode, accepts no real payment, and moves no money.',
   '{}');--> statement-breakpoint
UPDATE `installation_state`
SET `schema_version` = 14,
    `updated_at` = CURRENT_TIMESTAMP
WHERE `id` = 'installation' AND `schema_version` = 13;
