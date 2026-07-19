PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_orders` (
	`id` text PRIMARY KEY NOT NULL,
	`customer_user_id` text NOT NULL,
	`checkout_session_id` text,
	`commerce_event_id` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`total_minor` integer NOT NULL,
	`currency` text NOT NULL,
	`stripe_payment_intent_id` text,
	`stripe_subscription_id` text,
	`stripe_environment` text DEFAULT 'test' NOT NULL,
	`livemode` integer DEFAULT false NOT NULL,
	`completed_at` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`customer_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`checkout_session_id`) REFERENCES `checkout_sessions`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`commerce_event_id`) REFERENCES `commerce_events`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "orders_status_valid" CHECK("__new_orders"."status" in ('pending', 'fulfilled', 'failed', 'canceled', 'reversed')),
	CONSTRAINT "orders_amount_currency_valid" CHECK("__new_orders"."total_minor" > 0 and length("__new_orders"."currency") = 3 and "__new_orders"."currency" = upper("__new_orders"."currency")),
	CONSTRAINT "orders_test_only" CHECK("__new_orders"."stripe_environment" = 'test' and "__new_orders"."livemode" = 0),
	CONSTRAINT "orders_source_link_valid" CHECK("__new_orders"."checkout_session_id" is not null or ("__new_orders"."stripe_subscription_id" is not null and "__new_orders"."stripe_subscription_id" like 'sub_%'))
);
--> statement-breakpoint
INSERT INTO `__new_orders`("id", "customer_user_id", "checkout_session_id", "commerce_event_id", "status", "total_minor", "currency", "stripe_payment_intent_id", "stripe_subscription_id", "stripe_environment", "livemode", "completed_at", "created_at", "updated_at") SELECT "id", "customer_user_id", "checkout_session_id", "commerce_event_id", "status", "total_minor", "currency", "stripe_payment_intent_id", "stripe_subscription_id", "stripe_environment", "livemode", "completed_at", "created_at", "updated_at" FROM `orders`;--> statement-breakpoint
DROP TABLE `orders`;--> statement-breakpoint
ALTER TABLE `__new_orders` RENAME TO `orders`;--> statement-breakpoint
CREATE UNIQUE INDEX `orders_checkout_session_unique` ON `orders` (`checkout_session_id`) WHERE "orders"."checkout_session_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX `orders_commerce_event_unique` ON `orders` (`commerce_event_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `orders_identity_customer_unique` ON `orders` (`id`,`customer_user_id`);--> statement-breakpoint
CREATE INDEX `orders_customer_created_idx` ON `orders` (`customer_user_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `orders_status_updated_idx` ON `orders` (`status`,`updated_at`);--> statement-breakpoint
CREATE INDEX `orders_subscription_created_idx` ON `orders` (`stripe_subscription_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `__new_installation_state` (
	`id` text PRIMARY KEY NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`owner_user_id` text,
	`schema_version` integer DEFAULT 8 NOT NULL,
	`last_operation_key` text,
	`bootstrap_completed_at` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`owner_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "installation_state_status_valid" CHECK("__new_installation_state"."status" in ('pending', 'active')),
	CONSTRAINT "installation_state_schema_version_positive" CHECK("__new_installation_state"."schema_version" > 0)
);
--> statement-breakpoint
INSERT INTO `__new_installation_state`("id", "status", "owner_user_id", "schema_version", "last_operation_key", "bootstrap_completed_at", "created_at", "updated_at") SELECT "id", "status", "owner_user_id", 8, "last_operation_key", "bootstrap_completed_at", "created_at", "updated_at" FROM `installation_state`;--> statement-breakpoint
DROP TABLE `installation_state`;--> statement-breakpoint
ALTER TABLE `__new_installation_state` RENAME TO `installation_state`;--> statement-breakpoint
PRAGMA foreign_keys=ON;
