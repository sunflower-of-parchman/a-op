PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_download_events` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text,
	`resource_type` text NOT NULL,
	`resource_id` text NOT NULL,
	`media_derivative_id` text,
	`entitlement_id` text,
	`access_source` text NOT NULL,
	`entitlement_source_type` text,
	`entitlement_source_id` text,
	`credit_reservation_id` text,
	`stripe_environment` text,
	`livemode` integer,
	`byte_length` integer NOT NULL,
	`request_id` text NOT NULL,
	`delivered_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`media_derivative_id`) REFERENCES `media_derivatives`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`entitlement_id`) REFERENCES `entitlements`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "download_events_resource_type_valid" CHECK("__new_download_events"."resource_type" in ('track', 'release', 'collection')),
	CONSTRAINT "download_events_access_source_valid" CHECK("__new_download_events"."access_source" in ('public', 'account', 'role', 'ownership', 'grant', 'order', 'membership', 'subscription', 'license', 'credit')),
	CONSTRAINT "download_events_entitlement_source_valid" CHECK((
        "__new_download_events"."entitlement_id" is null
        and "__new_download_events"."entitlement_source_type" is null
        and "__new_download_events"."entitlement_source_id" is null
      ) or (
        "__new_download_events"."entitlement_id" is not null
        and (
          ("__new_download_events"."entitlement_source_type" is null and "__new_download_events"."entitlement_source_id" is null)
          or
          ("__new_download_events"."entitlement_source_type" is not null and "__new_download_events"."entitlement_source_id" is not null)
        )
      )),
	CONSTRAINT "download_events_commerce_environment_valid" CHECK((
        "__new_download_events"."access_source" in ('order', 'membership', 'subscription', 'license', 'credit')
        and "__new_download_events"."stripe_environment" = 'test'
        and "__new_download_events"."livemode" = 0
      ) or (
        "__new_download_events"."access_source" not in ('order', 'membership', 'subscription', 'license', 'credit')
        and "__new_download_events"."stripe_environment" is null
        and "__new_download_events"."livemode" is null
      )),
	CONSTRAINT "download_events_credit_reservation_valid" CHECK("__new_download_events"."access_source" = 'credit' or "__new_download_events"."credit_reservation_id" is null),
	CONSTRAINT "download_events_anonymous_public_only" CHECK("__new_download_events"."user_id" is not null or "__new_download_events"."access_source" = 'public'),
	CONSTRAINT "download_events_byte_length_nonnegative" CHECK("__new_download_events"."byte_length" >= 0)
);
--> statement-breakpoint
INSERT INTO `__new_download_events`("id", "user_id", "resource_type", "resource_id", "media_derivative_id", "entitlement_id", "access_source", "entitlement_source_type", "entitlement_source_id", "credit_reservation_id", "stripe_environment", "livemode", "byte_length", "request_id", "delivered_at", "created_at") SELECT "id", "user_id", "resource_type", "resource_id", "media_derivative_id", "entitlement_id", "access_source", "entitlement_source_type", "entitlement_source_id", "credit_reservation_id", "stripe_environment", "livemode", "byte_length", "request_id", "delivered_at", "created_at" FROM `download_events`;--> statement-breakpoint
DROP TABLE `download_events`;--> statement-breakpoint
ALTER TABLE `__new_download_events` RENAME TO `download_events`;--> statement-breakpoint
CREATE UNIQUE INDEX `download_events_request_unique` ON `download_events` (`request_id`);--> statement-breakpoint
CREATE INDEX `download_events_user_delivered_idx` ON `download_events` (`user_id`,`delivered_at`);--> statement-breakpoint
CREATE INDEX `download_events_resource_delivered_idx` ON `download_events` (`resource_type`,`resource_id`,`delivered_at`);--> statement-breakpoint
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
CREATE UNIQUE INDEX `entitlements_source_resource_unique` ON `entitlements` (`source_type`,`source_id`,`resource_type`,`resource_id`);--> statement-breakpoint
CREATE INDEX `entitlements_user_state_resource_idx` ON `entitlements` (`user_id`,`state`,`resource_type`,`resource_id`);--> statement-breakpoint
CREATE INDEX `entitlements_expiry_idx` ON `entitlements` (`state`,`expires_at`);--> statement-breakpoint
PRAGMA foreign_keys=ON;
