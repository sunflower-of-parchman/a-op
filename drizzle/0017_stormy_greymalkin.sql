PRAGMA foreign_keys=OFF;--> statement-breakpoint
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
	`stripe_environment` text,
	`livemode` integer,
	`fulfillment_event_id` text,
	`credit_reservation_id` text,
	`revision` integer DEFAULT 1 NOT NULL,
	`last_operation_key` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`grant_id`,`user_id`,`resource_type`,`resource_id`) REFERENCES `access_grants`(`id`,`grantee_user_id`,`resource_type`,`resource_id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "entitlements_source_type_valid" CHECK("__new_entitlements"."source_type" in ('grant', 'order', 'membership', 'subscription', 'license', 'credit')),
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
	CONSTRAINT "entitlements_commerce_environment_valid" CHECK((
        "__new_entitlements"."source_type" = 'grant'
        and "__new_entitlements"."stripe_environment" is null
        and "__new_entitlements"."livemode" is null
        and "__new_entitlements"."fulfillment_event_id" is null
      ) or (
        "__new_entitlements"."source_type" <> 'grant'
        and "__new_entitlements"."stripe_environment" = 'test'
        and "__new_entitlements"."livemode" = 0
        and "__new_entitlements"."fulfillment_event_id" is not null
      ) or (
        "__new_entitlements"."source_type" not in ('grant', 'order')
        and "__new_entitlements"."stripe_environment" = 'test'
        and "__new_entitlements"."livemode" = 0
        and "__new_entitlements"."fulfillment_event_id" is null
        and "__new_entitlements"."last_operation_key" is not null
      ) or (
        "__new_entitlements"."source_type" <> 'grant'
        and "__new_entitlements"."stripe_environment" is null
        and "__new_entitlements"."livemode" is null
        and "__new_entitlements"."fulfillment_event_id" is null
        and "__new_entitlements"."last_operation_key" is null
      )),
	CONSTRAINT "entitlements_credit_reservation_valid" CHECK("__new_entitlements"."source_type" = 'credit' or "__new_entitlements"."credit_reservation_id" is null),
	CONSTRAINT "entitlements_revision_positive" CHECK("__new_entitlements"."revision" > 0)
);
--> statement-breakpoint
INSERT INTO `__new_entitlements`("id", "user_id", "source_type", "source_id", "grant_id", "resource_type", "resource_id", "actions_json", "state", "starts_at", "expires_at", "remaining_uses", "download_disposition", "stripe_environment", "livemode", "fulfillment_event_id", "credit_reservation_id", "revision", "last_operation_key", "created_at", "updated_at") SELECT "id", "user_id", "source_type", "source_id", "grant_id", "resource_type", "resource_id", "actions_json", "state", "starts_at", "expires_at", "remaining_uses", "download_disposition", "stripe_environment", "livemode", "fulfillment_event_id", "credit_reservation_id", "revision", "last_operation_key", "created_at", "updated_at" FROM `entitlements`;--> statement-breakpoint
DROP TABLE `entitlements`;--> statement-breakpoint
ALTER TABLE `__new_entitlements` RENAME TO `entitlements`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `entitlements_source_resource_unique` ON `entitlements` (`source_type`,`source_id`,`resource_type`,`resource_id`);--> statement-breakpoint
CREATE INDEX `entitlements_user_state_resource_idx` ON `entitlements` (`user_id`,`state`,`resource_type`,`resource_id`);--> statement-breakpoint
CREATE INDEX `entitlements_expiry_idx` ON `entitlements` (`state`,`expires_at`);