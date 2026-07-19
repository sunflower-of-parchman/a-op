PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_download_events` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text,
	`resource_type` text NOT NULL,
	`resource_id` text NOT NULL,
	`media_derivative_id` text,
	`entitlement_id` text,
	`access_source` text NOT NULL,
	`byte_length` integer NOT NULL,
	`request_id` text NOT NULL,
	`delivered_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`media_derivative_id`) REFERENCES `media_derivatives`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`entitlement_id`) REFERENCES `entitlements`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "download_events_resource_type_valid" CHECK("__new_download_events"."resource_type" in ('track', 'release', 'collection')),
	CONSTRAINT "download_events_access_source_valid" CHECK("__new_download_events"."access_source" in ('public', 'account', 'role', 'ownership', 'grant')),
	CONSTRAINT "download_events_anonymous_public_only" CHECK("__new_download_events"."user_id" is not null or "__new_download_events"."access_source" = 'public'),
	CONSTRAINT "download_events_byte_length_nonnegative" CHECK("__new_download_events"."byte_length" >= 0)
);
--> statement-breakpoint
INSERT INTO `__new_download_events`("id", "user_id", "resource_type", "resource_id", "media_derivative_id", "entitlement_id", "access_source", "byte_length", "request_id", "delivered_at", "created_at") SELECT "id", "user_id", "resource_type", "resource_id", "media_derivative_id", "entitlement_id", "access_source", "byte_length", "request_id", "delivered_at", "created_at" FROM `download_events`;--> statement-breakpoint
DROP TABLE `download_events`;--> statement-breakpoint
ALTER TABLE `__new_download_events` RENAME TO `download_events`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `download_events_request_unique` ON `download_events` (`request_id`);--> statement-breakpoint
CREATE INDEX `download_events_user_delivered_idx` ON `download_events` (`user_id`,`delivered_at`);--> statement-breakpoint
CREATE INDEX `download_events_resource_delivered_idx` ON `download_events` (`resource_type`,`resource_id`,`delivered_at`);