PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_telemetry_aggregate_days` (
	`day_utc` text PRIMARY KEY NOT NULL,
	`source_event_count` integer NOT NULL,
	`group_count` integer NOT NULL,
	`session_count` integer NOT NULL,
	`linked_user_count` integer NOT NULL,
	`finalized_at` text NOT NULL,
	`last_operation_key` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	CONSTRAINT "telemetry_aggregate_days_counts_valid" CHECK("__new_telemetry_aggregate_days"."source_event_count" > 0 and "__new_telemetry_aggregate_days"."group_count" > 0 and "__new_telemetry_aggregate_days"."session_count" > 0 and "__new_telemetry_aggregate_days"."linked_user_count" >= 0 and "__new_telemetry_aggregate_days"."group_count" <= "__new_telemetry_aggregate_days"."source_event_count" and "__new_telemetry_aggregate_days"."session_count" <= "__new_telemetry_aggregate_days"."source_event_count" and "__new_telemetry_aggregate_days"."linked_user_count" <= "__new_telemetry_aggregate_days"."session_count")
);
--> statement-breakpoint
INSERT INTO `__new_telemetry_aggregate_days`
  ("day_utc", "source_event_count", "group_count", "session_count",
   "linked_user_count", "finalized_at", "last_operation_key", "created_at",
   "updated_at")
SELECT aggregate_day."day_utc", aggregate_day."source_event_count",
       aggregate_day."group_count",
       CASE
         WHEN EXISTS (
           SELECT 1 FROM "telemetry_events" AS source_event
           WHERE source_event."day_utc" = aggregate_day."day_utc"
         ) THEN (
           SELECT COUNT(DISTINCT source_event."session_id")
           FROM "telemetry_events" AS source_event
           WHERE source_event."day_utc" = aggregate_day."day_utc"
         )
         ELSE aggregate_day."source_event_count"
       END,
       COALESCE((
         SELECT COUNT(DISTINCT source_event."user_id")
         FROM "telemetry_events" AS source_event
         WHERE source_event."day_utc" = aggregate_day."day_utc"
       ), 0),
       aggregate_day."finalized_at", aggregate_day."last_operation_key",
       aggregate_day."created_at", aggregate_day."updated_at"
FROM `telemetry_aggregate_days` AS aggregate_day;--> statement-breakpoint
DROP TABLE `telemetry_aggregate_days`;--> statement-breakpoint
ALTER TABLE `__new_telemetry_aggregate_days` RENAME TO `telemetry_aggregate_days`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `telemetry_aggregate_days_operation_unique` ON `telemetry_aggregate_days` (`last_operation_key`);--> statement-breakpoint
CREATE TABLE `__new_installation_state` (
	`id` text PRIMARY KEY NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`owner_user_id` text,
	`schema_version` integer DEFAULT 15 NOT NULL,
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
SET `schema_version` = 15,
    `updated_at` = CURRENT_TIMESTAMP
WHERE `id` = 'installation' AND `schema_version` = 14;
