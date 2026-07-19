DROP INDEX `subscription_events_provider_cycle_unique`;--> statement-breakpoint
CREATE UNIQUE INDEX `subscription_events_stripe_event_unique` ON `subscription_events` (`stripe_event_id`) WHERE "subscription_events"."stripe_event_id" is not null;--> statement-breakpoint
CREATE INDEX `subscription_events_provider_object_idx` ON `subscription_events` (`provider_object_id`,`created_at`);--> statement-breakpoint
DROP INDEX `fulfillment_events_provider_object_unique`;--> statement-breakpoint
CREATE UNIQUE INDEX `fulfillment_events_provider_object_unique` ON `fulfillment_events` (`kind`,`provider_object_id`) WHERE "fulfillment_events"."kind" <> 'subscription_state';--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_installation_state` (
	`id` text PRIMARY KEY NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`owner_user_id` text,
	`schema_version` integer DEFAULT 9 NOT NULL,
	`last_operation_key` text,
	`bootstrap_completed_at` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`owner_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "installation_state_status_valid" CHECK("__new_installation_state"."status" in ('pending', 'active')),
	CONSTRAINT "installation_state_schema_version_positive" CHECK("__new_installation_state"."schema_version" > 0)
);
--> statement-breakpoint
INSERT INTO `__new_installation_state`("id", "status", "owner_user_id", "schema_version", "last_operation_key", "bootstrap_completed_at", "created_at", "updated_at") SELECT "id", "status", "owner_user_id", 9, "last_operation_key", "bootstrap_completed_at", "created_at", "updated_at" FROM `installation_state`;--> statement-breakpoint
DROP TABLE `installation_state`;--> statement-breakpoint
ALTER TABLE `__new_installation_state` RENAME TO `installation_state`;--> statement-breakpoint
PRAGMA foreign_keys=ON;
