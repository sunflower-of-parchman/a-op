CREATE TABLE `checkout_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`customer_user_id` text NOT NULL,
	`commerce_product_id` text NOT NULL,
	`commerce_price_id` text NOT NULL,
	`license_request_id` text,
	`mode` text NOT NULL,
	`status` text DEFAULT 'creating' NOT NULL,
	`return_path` text DEFAULT '/account/orders' NOT NULL,
	`stripe_checkout_session_id` text,
	`stripe_checkout_url` text,
	`stripe_customer_id` text,
	`stripe_subscription_id` text,
	`stripe_payment_intent_id` text,
	`amount_minor` integer NOT NULL,
	`currency` text NOT NULL,
	`stripe_environment` text DEFAULT 'test' NOT NULL,
	`livemode` integer DEFAULT false NOT NULL,
	`idempotency_key` text NOT NULL,
	`request_fingerprint` text NOT NULL,
	`failure_category` text,
	`expires_at` text,
	`completed_at` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`customer_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`commerce_price_id`,`commerce_product_id`) REFERENCES `commerce_prices`(`id`,`commerce_product_id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "checkout_sessions_mode_valid" CHECK("checkout_sessions"."mode" in ('payment', 'subscription')),
	CONSTRAINT "checkout_sessions_status_valid" CHECK("checkout_sessions"."status" in ('creating', 'open', 'completed', 'expired', 'canceled', 'failed')),
	CONSTRAINT "checkout_sessions_return_path_valid" CHECK(substr("checkout_sessions"."return_path", 1, 1) = '/' and substr("checkout_sessions"."return_path", 1, 2) <> '//' and instr("checkout_sessions"."return_path", char(92)) = 0),
	CONSTRAINT "checkout_sessions_provider_fields_valid" CHECK((
        "checkout_sessions"."status" = 'creating'
        and "checkout_sessions"."stripe_checkout_session_id" is null
        and "checkout_sessions"."stripe_checkout_url" is null
      ) or (
        "checkout_sessions"."status" = 'failed'
        and (
          ("checkout_sessions"."stripe_checkout_session_id" is null and "checkout_sessions"."stripe_checkout_url" is null)
          or "checkout_sessions"."stripe_checkout_session_id" like 'cs_test_%'
        )
      ) or (
        "checkout_sessions"."status" in ('open', 'completed', 'expired', 'canceled')
        and "checkout_sessions"."stripe_checkout_session_id" like 'cs_test_%'
      )),
	CONSTRAINT "checkout_sessions_url_valid" CHECK("checkout_sessions"."stripe_checkout_url" is null or "checkout_sessions"."stripe_checkout_url" like 'https://checkout.stripe.com/%'),
	CONSTRAINT "checkout_sessions_amount_currency_valid" CHECK("checkout_sessions"."amount_minor" > 0 and length("checkout_sessions"."currency") = 3 and "checkout_sessions"."currency" = upper("checkout_sessions"."currency")),
	CONSTRAINT "checkout_sessions_test_only" CHECK("checkout_sessions"."stripe_environment" = 'test' and "checkout_sessions"."livemode" = 0),
	CONSTRAINT "checkout_sessions_fingerprint_valid" CHECK(length("checkout_sessions"."request_fingerprint") = 64 and "checkout_sessions"."request_fingerprint" = lower("checkout_sessions"."request_fingerprint")),
	CONSTRAINT "checkout_sessions_failure_category_length_valid" CHECK("checkout_sessions"."failure_category" is null or length("checkout_sessions"."failure_category") between 1 and 120)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `checkout_sessions_operation_unique` ON `checkout_sessions` (`customer_user_id`,`idempotency_key`);--> statement-breakpoint
CREATE UNIQUE INDEX `checkout_sessions_stripe_session_unique` ON `checkout_sessions` (`stripe_checkout_session_id`) WHERE "checkout_sessions"."stripe_checkout_session_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX `checkout_sessions_identity_subject_unique` ON `checkout_sessions` (`id`,`customer_user_id`,`commerce_product_id`,`commerce_price_id`);--> statement-breakpoint
CREATE INDEX `checkout_sessions_customer_created_idx` ON `checkout_sessions` (`customer_user_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `checkout_sessions_status_updated_idx` ON `checkout_sessions` (`status`,`updated_at`);--> statement-breakpoint
CREATE TABLE `commerce_events` (
	`id` text PRIMARY KEY NOT NULL,
	`stripe_event_id` text NOT NULL,
	`event_type` text NOT NULL,
	`stripe_object_id` text NOT NULL,
	`checkout_session_id` text,
	`event_created_at` text NOT NULL,
	`raw_body_digest` text NOT NULL,
	`facts_fingerprint` text NOT NULL,
	`status` text DEFAULT 'processing' NOT NULL,
	`failure_category` text,
	`stripe_environment` text DEFAULT 'test' NOT NULL,
	`livemode` integer DEFAULT false NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`processed_at` text,
	FOREIGN KEY (`checkout_session_id`) REFERENCES `checkout_sessions`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "commerce_events_stripe_id_valid" CHECK("commerce_events"."stripe_event_id" like 'evt_%'),
	CONSTRAINT "commerce_events_type_length_valid" CHECK(length("commerce_events"."event_type") between 3 and 160),
	CONSTRAINT "commerce_events_object_length_valid" CHECK(length("commerce_events"."stripe_object_id") between 3 and 255),
	CONSTRAINT "commerce_events_digests_valid" CHECK(length("commerce_events"."raw_body_digest") = 64 and "commerce_events"."raw_body_digest" = lower("commerce_events"."raw_body_digest") and length("commerce_events"."facts_fingerprint") = 64 and "commerce_events"."facts_fingerprint" = lower("commerce_events"."facts_fingerprint")),
	CONSTRAINT "commerce_events_status_valid" CHECK("commerce_events"."status" in ('processing', 'completed', 'ignored', 'failed')),
	CONSTRAINT "commerce_events_failure_valid" CHECK(("commerce_events"."status" = 'failed' and "commerce_events"."failure_category" is not null) or ("commerce_events"."status" <> 'failed' and "commerce_events"."failure_category" is null)),
	CONSTRAINT "commerce_events_test_only" CHECK("commerce_events"."stripe_environment" = 'test' and "commerce_events"."livemode" = 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `commerce_events_stripe_event_unique` ON `commerce_events` (`stripe_event_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `commerce_events_identity_fingerprint_unique` ON `commerce_events` (`id`,`facts_fingerprint`);--> statement-breakpoint
CREATE INDEX `commerce_events_status_received_idx` ON `commerce_events` (`status`,`created_at`);--> statement-breakpoint
CREATE INDEX `commerce_events_object_idx` ON `commerce_events` (`event_type`,`stripe_object_id`);--> statement-breakpoint
CREATE TABLE `commerce_prices` (
	`id` text PRIMARY KEY NOT NULL,
	`commerce_product_id` text NOT NULL,
	`amount_minor` integer NOT NULL,
	`currency` text NOT NULL,
	`billing_interval` text DEFAULT 'one_time' NOT NULL,
	`interval_count` integer DEFAULT 1 NOT NULL,
	`stripe_price_id` text NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`stripe_environment` text DEFAULT 'test' NOT NULL,
	`livemode` integer DEFAULT false NOT NULL,
	`revision` integer DEFAULT 1 NOT NULL,
	`last_operation_key` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`commerce_product_id`) REFERENCES `commerce_products`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "commerce_prices_amount_positive" CHECK("commerce_prices"."amount_minor" > 0),
	CONSTRAINT "commerce_prices_currency_normalized" CHECK(length("commerce_prices"."currency") = 3 and "commerce_prices"."currency" = upper("commerce_prices"."currency")),
	CONSTRAINT "commerce_prices_interval_valid" CHECK("commerce_prices"."billing_interval" in ('one_time', 'month', 'year') and "commerce_prices"."interval_count" > 0),
	CONSTRAINT "commerce_prices_stripe_price_valid" CHECK("commerce_prices"."stripe_price_id" like 'price_%' and length("commerce_prices"."stripe_price_id") between 12 and 255),
	CONSTRAINT "commerce_prices_test_only" CHECK("commerce_prices"."stripe_environment" = 'test' and "commerce_prices"."livemode" = 0),
	CONSTRAINT "commerce_prices_revision_positive" CHECK("commerce_prices"."revision" > 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `commerce_prices_product_terms_unique` ON `commerce_prices` (`commerce_product_id`,`currency`,`billing_interval`,`interval_count`,`revision`);--> statement-breakpoint
CREATE UNIQUE INDEX `commerce_prices_identity_product_unique` ON `commerce_prices` (`id`,`commerce_product_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `commerce_prices_stripe_price_unique` ON `commerce_prices` (`stripe_price_id`);--> statement-breakpoint
CREATE INDEX `commerce_prices_product_active_idx` ON `commerce_prices` (`commerce_product_id`,`active`);--> statement-breakpoint
CREATE TABLE `commerce_products` (
	`id` text PRIMARY KEY NOT NULL,
	`slug` text NOT NULL,
	`name` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`product_type` text NOT NULL,
	`resource_type` text,
	`resource_id` text,
	`access_plan_id` text,
	`access_plan_revision` integer,
	`membership_plan_id` text,
	`membership_plan_revision_id` text,
	`membership_plan_revision` integer,
	`subscription_plan_id` text,
	`credit_kind` text,
	`credit_quantity` integer,
	`state` text DEFAULT 'draft' NOT NULL,
	`revision` integer DEFAULT 1 NOT NULL,
	`created_by_user_id` text,
	`last_operation_key` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`access_plan_id`) REFERENCES `access_plans`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`membership_plan_id`) REFERENCES `membership_plans`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`subscription_plan_id`) REFERENCES `subscription_plans`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`created_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`membership_plan_revision_id`,`membership_plan_id`,`membership_plan_revision`) REFERENCES `membership_plan_revisions`(`id`,`membership_plan_id`,`revision`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "commerce_products_slug_normalized" CHECK("commerce_products"."slug" = lower(trim("commerce_products"."slug"))),
	CONSTRAINT "commerce_products_slug_no_slash" CHECK(instr("commerce_products"."slug", '/') = 0),
	CONSTRAINT "commerce_products_name_length_valid" CHECK(length(trim("commerce_products"."name")) between 1 and 160),
	CONSTRAINT "commerce_products_description_length_valid" CHECK(length("commerce_products"."description") <= 4000),
	CONSTRAINT "commerce_products_type_valid" CHECK("commerce_products"."product_type" in ('track', 'release', 'collection', 'membership', 'subscription', 'license', 'download-credits', 'license-credits')),
	CONSTRAINT "commerce_products_subject_valid" CHECK((
        "commerce_products"."product_type" in ('track', 'release', 'collection')
        and "commerce_products"."resource_type" = "commerce_products"."product_type"
        and "commerce_products"."resource_id" is not null
        and "commerce_products"."access_plan_id" is not null
        and "commerce_products"."access_plan_revision" > 0
        and "commerce_products"."membership_plan_id" is null
        and "commerce_products"."membership_plan_revision_id" is null
        and "commerce_products"."membership_plan_revision" is null
        and "commerce_products"."subscription_plan_id" is null
        and "commerce_products"."credit_kind" is null
        and "commerce_products"."credit_quantity" is null
      ) or (
        "commerce_products"."product_type" = 'membership'
        and "commerce_products"."resource_type" is null
        and "commerce_products"."resource_id" is null
        and "commerce_products"."access_plan_id" is null
        and "commerce_products"."access_plan_revision" is null
        and "commerce_products"."membership_plan_id" is not null
        and "commerce_products"."membership_plan_revision_id" is not null
        and "commerce_products"."membership_plan_revision" > 0
        and "commerce_products"."subscription_plan_id" is null
        and "commerce_products"."credit_kind" is null
        and "commerce_products"."credit_quantity" is null
      ) or (
        "commerce_products"."product_type" = 'subscription'
        and "commerce_products"."resource_type" is null
        and "commerce_products"."resource_id" is null
        and "commerce_products"."access_plan_id" is null
        and "commerce_products"."access_plan_revision" is null
        and "commerce_products"."membership_plan_id" is null
        and "commerce_products"."membership_plan_revision_id" is null
        and "commerce_products"."membership_plan_revision" is null
        and "commerce_products"."subscription_plan_id" is not null
        and "commerce_products"."credit_kind" is null
        and "commerce_products"."credit_quantity" is null
      ) or (
        "commerce_products"."product_type" = 'license'
        and "commerce_products"."resource_type" = 'track'
        and "commerce_products"."resource_id" is not null
        and "commerce_products"."access_plan_id" is null
        and "commerce_products"."access_plan_revision" is null
        and "commerce_products"."membership_plan_id" is null
        and "commerce_products"."membership_plan_revision_id" is null
        and "commerce_products"."membership_plan_revision" is null
        and "commerce_products"."subscription_plan_id" is null
        and "commerce_products"."credit_kind" is null
        and "commerce_products"."credit_quantity" is null
      ) or (
        "commerce_products"."product_type" in ('download-credits', 'license-credits')
        and "commerce_products"."resource_type" is null
        and "commerce_products"."resource_id" is null
        and "commerce_products"."access_plan_id" is null
        and "commerce_products"."access_plan_revision" is null
        and "commerce_products"."membership_plan_id" is null
        and "commerce_products"."membership_plan_revision_id" is null
        and "commerce_products"."membership_plan_revision" is null
        and "commerce_products"."subscription_plan_id" is null
        and "commerce_products"."credit_kind" = case "commerce_products"."product_type" when 'download-credits' then 'download' else 'license' end
        and "commerce_products"."credit_quantity" > 0
      )),
	CONSTRAINT "commerce_products_state_valid" CHECK("commerce_products"."state" in ('draft', 'active', 'archived')),
	CONSTRAINT "commerce_products_revision_positive" CHECK("commerce_products"."revision" > 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `commerce_products_slug_unique` ON `commerce_products` (`slug`);--> statement-breakpoint
CREATE UNIQUE INDEX `commerce_products_identity_revision_unique` ON `commerce_products` (`id`,`revision`);--> statement-breakpoint
CREATE INDEX `commerce_products_state_type_idx` ON `commerce_products` (`state`,`product_type`);--> statement-breakpoint
CREATE INDEX `commerce_products_resource_idx` ON `commerce_products` (`resource_type`,`resource_id`);--> statement-breakpoint
CREATE TABLE `credit_accounts` (
	`id` text PRIMARY KEY NOT NULL,
	`customer_user_id` text NOT NULL,
	`credit_kind` text NOT NULL,
	`available_balance` integer DEFAULT 0 NOT NULL,
	`reserved_balance` integer DEFAULT 0 NOT NULL,
	`consumed_balance` integer DEFAULT 0 NOT NULL,
	`stripe_environment` text DEFAULT 'test' NOT NULL,
	`livemode` integer DEFAULT false NOT NULL,
	`revision` integer DEFAULT 1 NOT NULL,
	`last_operation_key` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`customer_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "credit_accounts_kind_valid" CHECK("credit_accounts"."credit_kind" in ('download', 'license')),
	CONSTRAINT "credit_accounts_balances_nonnegative" CHECK("credit_accounts"."available_balance" >= 0 and "credit_accounts"."reserved_balance" >= 0 and "credit_accounts"."consumed_balance" >= 0),
	CONSTRAINT "credit_accounts_test_only" CHECK("credit_accounts"."stripe_environment" = 'test' and "credit_accounts"."livemode" = 0),
	CONSTRAINT "credit_accounts_revision_positive" CHECK("credit_accounts"."revision" > 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `credit_accounts_customer_kind_unique` ON `credit_accounts` (`customer_user_id`,`credit_kind`);--> statement-breakpoint
CREATE UNIQUE INDEX `credit_accounts_identity_customer_unique` ON `credit_accounts` (`id`,`customer_user_id`);--> statement-breakpoint
CREATE INDEX `credit_accounts_customer_idx` ON `credit_accounts` (`customer_user_id`);--> statement-breakpoint
CREATE TABLE `credit_grant_lots` (
	`id` text PRIMARY KEY NOT NULL,
	`credit_account_id` text NOT NULL,
	`customer_user_id` text NOT NULL,
	`credit_kind` text NOT NULL,
	`origin_type` text NOT NULL,
	`origin_id` text NOT NULL,
	`quantity_granted` integer NOT NULL,
	`quantity_available` integer NOT NULL,
	`quantity_reserved` integer DEFAULT 0 NOT NULL,
	`quantity_consumed` integer DEFAULT 0 NOT NULL,
	`quantity_expired` integer DEFAULT 0 NOT NULL,
	`quantity_reversed` integer DEFAULT 0 NOT NULL,
	`state` text DEFAULT 'active' NOT NULL,
	`expires_at` text,
	`expired_at` text,
	`reversed_at` text,
	`fulfillment_event_id` text,
	`stripe_environment` text DEFAULT 'test' NOT NULL,
	`livemode` integer DEFAULT false NOT NULL,
	`revision` integer DEFAULT 1 NOT NULL,
	`last_operation_key` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`fulfillment_event_id`) REFERENCES `fulfillment_events`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`credit_account_id`,`customer_user_id`) REFERENCES `credit_accounts`(`id`,`customer_user_id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "credit_grant_lots_kind_valid" CHECK("credit_grant_lots"."credit_kind" in ('download', 'license')),
	CONSTRAINT "credit_grant_lots_origin_valid" CHECK("credit_grant_lots"."origin_type" in ('owner', 'membership', 'subscription', 'order', 'reversal')),
	CONSTRAINT "credit_grant_lots_quantities_valid" CHECK("credit_grant_lots"."quantity_granted" > 0 and "credit_grant_lots"."quantity_available" >= 0 and "credit_grant_lots"."quantity_reserved" >= 0 and "credit_grant_lots"."quantity_consumed" >= 0 and "credit_grant_lots"."quantity_expired" >= 0 and "credit_grant_lots"."quantity_reversed" >= 0 and "credit_grant_lots"."quantity_available" + "credit_grant_lots"."quantity_reserved" + "credit_grant_lots"."quantity_consumed" + "credit_grant_lots"."quantity_expired" + "credit_grant_lots"."quantity_reversed" = "credit_grant_lots"."quantity_granted"),
	CONSTRAINT "credit_grant_lots_state_valid" CHECK((
        "credit_grant_lots"."state" = 'active'
        and "credit_grant_lots"."quantity_available" + "credit_grant_lots"."quantity_reserved" > 0
        and "credit_grant_lots"."quantity_expired" = 0
        and "credit_grant_lots"."quantity_reversed" = 0
        and "credit_grant_lots"."expired_at" is null
        and "credit_grant_lots"."reversed_at" is null
      ) or (
        "credit_grant_lots"."state" = 'exhausted'
        and "credit_grant_lots"."quantity_available" = 0
        and "credit_grant_lots"."quantity_reserved" = 0
        and "credit_grant_lots"."quantity_expired" = 0
        and "credit_grant_lots"."quantity_reversed" = 0
        and "credit_grant_lots"."expired_at" is null
        and "credit_grant_lots"."reversed_at" is null
      ) or (
        "credit_grant_lots"."state" = 'expired'
        and "credit_grant_lots"."quantity_available" = 0
        and "credit_grant_lots"."quantity_reserved" = 0
        and "credit_grant_lots"."quantity_expired" > 0
        and "credit_grant_lots"."quantity_reversed" = 0
        and "credit_grant_lots"."expired_at" is not null
        and "credit_grant_lots"."reversed_at" is null
      ) or (
        "credit_grant_lots"."state" = 'reversed'
        and "credit_grant_lots"."quantity_available" = 0
        and "credit_grant_lots"."quantity_reserved" = 0
        and "credit_grant_lots"."quantity_reversed" > 0
        and "credit_grant_lots"."reversed_at" is not null
      )),
	CONSTRAINT "credit_grant_lots_test_only" CHECK("credit_grant_lots"."stripe_environment" = 'test' and "credit_grant_lots"."livemode" = 0),
	CONSTRAINT "credit_grant_lots_revision_positive" CHECK("credit_grant_lots"."revision" > 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `credit_grant_lots_origin_unique` ON `credit_grant_lots` (`credit_account_id`,`origin_type`,`origin_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `credit_grant_lots_identity_account_unique` ON `credit_grant_lots` (`id`,`credit_account_id`,`customer_user_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `credit_grant_lots_operation_unique` ON `credit_grant_lots` (`credit_account_id`,`last_operation_key`);--> statement-breakpoint
CREATE INDEX `credit_grant_lots_account_state_expiry_idx` ON `credit_grant_lots` (`credit_account_id`,`state`,`expires_at`);--> statement-breakpoint
CREATE TABLE `credit_ledger_entries` (
	`id` text PRIMARY KEY NOT NULL,
	`credit_account_id` text NOT NULL,
	`customer_user_id` text NOT NULL,
	`credit_kind` text NOT NULL,
	`credit_grant_lot_id` text,
	`credit_reservation_id` text,
	`entry_type` text NOT NULL,
	`available_delta` integer NOT NULL,
	`reserved_delta` integer NOT NULL,
	`consumed_delta` integer NOT NULL,
	`available_after` integer NOT NULL,
	`reserved_after` integer NOT NULL,
	`consumed_after` integer NOT NULL,
	`origin_type` text NOT NULL,
	`origin_id` text NOT NULL,
	`fulfillment_event_id` text,
	`stripe_environment` text DEFAULT 'test' NOT NULL,
	`livemode` integer DEFAULT false NOT NULL,
	`idempotency_key` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`credit_grant_lot_id`) REFERENCES `credit_grant_lots`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`credit_reservation_id`) REFERENCES `credit_reservations`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`fulfillment_event_id`) REFERENCES `fulfillment_events`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`credit_account_id`,`customer_user_id`) REFERENCES `credit_accounts`(`id`,`customer_user_id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "credit_ledger_entries_kind_valid" CHECK("credit_ledger_entries"."credit_kind" in ('download', 'license')),
	CONSTRAINT "credit_ledger_entries_type_valid" CHECK("credit_ledger_entries"."entry_type" in ('grant', 'reservation', 'consumption', 'release', 'reversal', 'expiration')),
	CONSTRAINT "credit_ledger_entries_delta_valid" CHECK((
        "credit_ledger_entries"."entry_type" = 'grant'
        and "credit_ledger_entries"."available_delta" > 0
        and "credit_ledger_entries"."reserved_delta" = 0
        and "credit_ledger_entries"."consumed_delta" = 0
      ) or (
        "credit_ledger_entries"."entry_type" = 'reservation'
        and "credit_ledger_entries"."available_delta" < 0
        and "credit_ledger_entries"."reserved_delta" = -"credit_ledger_entries"."available_delta"
        and "credit_ledger_entries"."consumed_delta" = 0
      ) or (
        "credit_ledger_entries"."entry_type" = 'consumption'
        and "credit_ledger_entries"."available_delta" = 0
        and "credit_ledger_entries"."reserved_delta" < 0
        and "credit_ledger_entries"."consumed_delta" = -"credit_ledger_entries"."reserved_delta"
      ) or (
        "credit_ledger_entries"."entry_type" = 'release'
        and "credit_ledger_entries"."available_delta" > 0
        and "credit_ledger_entries"."reserved_delta" = -"credit_ledger_entries"."available_delta"
        and "credit_ledger_entries"."consumed_delta" = 0
      ) or (
        "credit_ledger_entries"."entry_type" = 'reversal'
        and "credit_ledger_entries"."available_delta" > 0
        and "credit_ledger_entries"."reserved_delta" = 0
        and "credit_ledger_entries"."consumed_delta" = -"credit_ledger_entries"."available_delta"
      ) or (
        "credit_ledger_entries"."entry_type" = 'expiration'
        and "credit_ledger_entries"."available_delta" < 0
        and "credit_ledger_entries"."reserved_delta" = 0
        and "credit_ledger_entries"."consumed_delta" = 0
      )),
	CONSTRAINT "credit_ledger_entries_balances_nonnegative" CHECK("credit_ledger_entries"."available_after" >= 0 and "credit_ledger_entries"."reserved_after" >= 0 and "credit_ledger_entries"."consumed_after" >= 0),
	CONSTRAINT "credit_ledger_entries_origin_valid" CHECK("credit_ledger_entries"."origin_type" in ('owner', 'membership', 'subscription', 'order', 'download', 'license', 'expiration', 'reversal')),
	CONSTRAINT "credit_ledger_entries_test_only" CHECK("credit_ledger_entries"."stripe_environment" = 'test' and "credit_ledger_entries"."livemode" = 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `credit_ledger_entries_operation_unique` ON `credit_ledger_entries` (`credit_account_id`,`idempotency_key`);--> statement-breakpoint
CREATE UNIQUE INDEX `credit_ledger_entries_identity_customer_unique` ON `credit_ledger_entries` (`id`,`customer_user_id`);--> statement-breakpoint
CREATE INDEX `credit_ledger_entries_account_created_idx` ON `credit_ledger_entries` (`credit_account_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `credit_ledger_entries_customer_created_idx` ON `credit_ledger_entries` (`customer_user_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `credit_reservation_allocations` (
	`id` text PRIMARY KEY NOT NULL,
	`credit_reservation_id` text NOT NULL,
	`credit_grant_lot_id` text NOT NULL,
	`position` integer NOT NULL,
	`quantity` integer NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`credit_reservation_id`) REFERENCES `credit_reservations`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`credit_grant_lot_id`) REFERENCES `credit_grant_lots`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "credit_reservation_allocations_positive" CHECK("credit_reservation_allocations"."position" > 0 and "credit_reservation_allocations"."quantity" > 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `credit_reservation_allocations_pair_unique` ON `credit_reservation_allocations` (`credit_reservation_id`,`credit_grant_lot_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `credit_reservation_allocations_position_unique` ON `credit_reservation_allocations` (`credit_reservation_id`,`position`);--> statement-breakpoint
CREATE INDEX `credit_reservation_allocations_lot_idx` ON `credit_reservation_allocations` (`credit_grant_lot_id`);--> statement-breakpoint
CREATE TABLE `credit_reservations` (
	`id` text PRIMARY KEY NOT NULL,
	`credit_account_id` text NOT NULL,
	`customer_user_id` text NOT NULL,
	`credit_kind` text NOT NULL,
	`purpose_type` text NOT NULL,
	`purpose_id` text NOT NULL,
	`quantity` integer NOT NULL,
	`state` text DEFAULT 'reserved' NOT NULL,
	`expires_at` text NOT NULL,
	`consumed_at` text,
	`released_at` text,
	`expired_at` text,
	`reversed_at` text,
	`request_id` text NOT NULL,
	`stripe_environment` text DEFAULT 'test' NOT NULL,
	`livemode` integer DEFAULT false NOT NULL,
	`revision` integer DEFAULT 1 NOT NULL,
	`last_operation_key` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`credit_account_id`,`customer_user_id`) REFERENCES `credit_accounts`(`id`,`customer_user_id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "credit_reservations_kind_purpose_valid" CHECK(("credit_reservations"."credit_kind" = 'download' and "credit_reservations"."purpose_type" = 'download') or ("credit_reservations"."credit_kind" = 'license' and "credit_reservations"."purpose_type" = 'license_request')),
	CONSTRAINT "credit_reservations_quantity_positive" CHECK("credit_reservations"."quantity" > 0),
	CONSTRAINT "credit_reservations_state_valid" CHECK("credit_reservations"."state" in ('reserved', 'consumed', 'released', 'expired', 'reversed')),
	CONSTRAINT "credit_reservations_terminal_state_valid" CHECK((
        "credit_reservations"."state" = 'reserved'
        and "credit_reservations"."consumed_at" is null
        and "credit_reservations"."released_at" is null
        and "credit_reservations"."expired_at" is null
        and "credit_reservations"."reversed_at" is null
      ) or (
        "credit_reservations"."state" = 'consumed'
        and "credit_reservations"."consumed_at" is not null
        and "credit_reservations"."released_at" is null
        and "credit_reservations"."expired_at" is null
        and "credit_reservations"."reversed_at" is null
      ) or (
        "credit_reservations"."state" = 'released'
        and "credit_reservations"."released_at" is not null
        and "credit_reservations"."expired_at" is null
        and "credit_reservations"."reversed_at" is null
      ) or (
        "credit_reservations"."state" = 'expired'
        and "credit_reservations"."expired_at" is not null
        and "credit_reservations"."reversed_at" is null
      ) or (
        "credit_reservations"."state" = 'reversed'
        and "credit_reservations"."consumed_at" is not null
        and "credit_reservations"."reversed_at" is not null
      )),
	CONSTRAINT "credit_reservations_test_only" CHECK("credit_reservations"."stripe_environment" = 'test' and "credit_reservations"."livemode" = 0),
	CONSTRAINT "credit_reservations_revision_positive" CHECK("credit_reservations"."revision" > 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `credit_reservations_request_unique` ON `credit_reservations` (`request_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `credit_reservations_purpose_unique` ON `credit_reservations` (`credit_account_id`,`purpose_type`,`purpose_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `credit_reservations_identity_account_unique` ON `credit_reservations` (`id`,`credit_account_id`,`customer_user_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `credit_reservations_operation_unique` ON `credit_reservations` (`credit_account_id`,`last_operation_key`);--> statement-breakpoint
CREATE INDEX `credit_reservations_account_state_expiry_idx` ON `credit_reservations` (`credit_account_id`,`state`,`expires_at`);--> statement-breakpoint
CREATE TABLE `fulfillment_events` (
	`id` text PRIMARY KEY NOT NULL,
	`commerce_event_id` text NOT NULL,
	`checkout_session_id` text,
	`order_id` text,
	`customer_user_id` text NOT NULL,
	`commerce_product_id` text,
	`kind` text NOT NULL,
	`provider_object_id` text NOT NULL,
	`facts_fingerprint` text NOT NULL,
	`status` text DEFAULT 'processing' NOT NULL,
	`result_json` text DEFAULT '{}' NOT NULL,
	`failure_category` text,
	`stripe_environment` text DEFAULT 'test' NOT NULL,
	`livemode` integer DEFAULT false NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`completed_at` text,
	FOREIGN KEY (`commerce_event_id`) REFERENCES `commerce_events`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`checkout_session_id`) REFERENCES `checkout_sessions`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`order_id`) REFERENCES `orders`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`customer_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`commerce_product_id`) REFERENCES `commerce_products`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "fulfillment_events_kind_valid" CHECK("fulfillment_events"."kind" in ('one_time', 'initial_subscription', 'renewal', 'subscription_state')),
	CONSTRAINT "fulfillment_events_fingerprint_valid" CHECK(length("fulfillment_events"."facts_fingerprint") = 64 and "fulfillment_events"."facts_fingerprint" = lower("fulfillment_events"."facts_fingerprint")),
	CONSTRAINT "fulfillment_events_status_valid" CHECK("fulfillment_events"."status" in ('processing', 'fulfilled', 'ignored', 'failed')),
	CONSTRAINT "fulfillment_events_result_json_valid" CHECK(json_valid("fulfillment_events"."result_json") and json_type("fulfillment_events"."result_json") = 'object'),
	CONSTRAINT "fulfillment_events_failure_valid" CHECK(("fulfillment_events"."status" = 'failed' and "fulfillment_events"."failure_category" is not null) or ("fulfillment_events"."status" <> 'failed' and "fulfillment_events"."failure_category" is null)),
	CONSTRAINT "fulfillment_events_test_only" CHECK("fulfillment_events"."stripe_environment" = 'test' and "fulfillment_events"."livemode" = 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `fulfillment_events_commerce_event_unique` ON `fulfillment_events` (`commerce_event_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `fulfillment_events_provider_object_unique` ON `fulfillment_events` (`kind`,`provider_object_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `fulfillment_events_identity_customer_unique` ON `fulfillment_events` (`id`,`customer_user_id`);--> statement-breakpoint
CREATE INDEX `fulfillment_events_customer_created_idx` ON `fulfillment_events` (`customer_user_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `fulfillment_events_status_created_idx` ON `fulfillment_events` (`status`,`created_at`);--> statement-breakpoint
CREATE TABLE `issued_licenses` (
	`id` text PRIMARY KEY NOT NULL,
	`customer_user_id` text NOT NULL,
	`license_request_id` text NOT NULL,
	`track_id` text NOT NULL,
	`license_terms_version_id` text NOT NULL,
	`license_option_id` text NOT NULL,
	`source` text NOT NULL,
	`order_id` text,
	`credit_ledger_entry_id` text,
	`fulfillment_event_id` text,
	`terms_snapshot_json` text NOT NULL,
	`state` text DEFAULT 'active' NOT NULL,
	`issued_at` text NOT NULL,
	`expires_at` text,
	`revoked_at` text,
	`expired_at` text,
	`stripe_environment` text DEFAULT 'test' NOT NULL,
	`livemode` integer DEFAULT false NOT NULL,
	`revision` integer DEFAULT 1 NOT NULL,
	`last_operation_key` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`track_id`) REFERENCES `tracks`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`license_terms_version_id`) REFERENCES `license_terms_versions`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`license_option_id`) REFERENCES `license_options`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`order_id`) REFERENCES `orders`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`credit_ledger_entry_id`) REFERENCES `credit_ledger_entries`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`fulfillment_event_id`) REFERENCES `fulfillment_events`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`license_request_id`,`customer_user_id`) REFERENCES `license_requests`(`id`,`customer_user_id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "issued_licenses_source_valid" CHECK("issued_licenses"."source" in ('owner_approval', 'credit_redemption', 'stripe_test_order')),
	CONSTRAINT "issued_licenses_source_links_valid" CHECK((
        "issued_licenses"."source" = 'owner_approval'
        and "issued_licenses"."order_id" is null
        and "issued_licenses"."credit_ledger_entry_id" is null
        and "issued_licenses"."fulfillment_event_id" is null
      ) or (
        "issued_licenses"."source" = 'credit_redemption'
        and "issued_licenses"."order_id" is null
        and "issued_licenses"."credit_ledger_entry_id" is not null
        and "issued_licenses"."fulfillment_event_id" is null
      ) or (
        "issued_licenses"."source" = 'stripe_test_order'
        and "issued_licenses"."order_id" is not null
        and "issued_licenses"."credit_ledger_entry_id" is null
        and "issued_licenses"."fulfillment_event_id" is not null
      )),
	CONSTRAINT "issued_licenses_snapshot_valid" CHECK(json_valid("issued_licenses"."terms_snapshot_json") and json_type("issued_licenses"."terms_snapshot_json") = 'object'),
	CONSTRAINT "issued_licenses_state_valid" CHECK((
        "issued_licenses"."state" = 'active'
        and "issued_licenses"."revoked_at" is null
        and "issued_licenses"."expired_at" is null
      ) or (
        "issued_licenses"."state" = 'revoked'
        and "issued_licenses"."revoked_at" is not null
        and "issued_licenses"."expired_at" is null
      ) or (
        "issued_licenses"."state" = 'expired'
        and "issued_licenses"."expired_at" is not null
        and "issued_licenses"."revoked_at" is null
      )),
	CONSTRAINT "issued_licenses_test_only" CHECK("issued_licenses"."stripe_environment" = 'test' and "issued_licenses"."livemode" = 0),
	CONSTRAINT "issued_licenses_revision_positive" CHECK("issued_licenses"."revision" > 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `issued_licenses_request_unique` ON `issued_licenses` (`license_request_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `issued_licenses_operation_unique` ON `issued_licenses` (`last_operation_key`);--> statement-breakpoint
CREATE UNIQUE INDEX `issued_licenses_identity_customer_unique` ON `issued_licenses` (`id`,`customer_user_id`);--> statement-breakpoint
CREATE INDEX `issued_licenses_customer_state_idx` ON `issued_licenses` (`customer_user_id`,`state`,`issued_at`);--> statement-breakpoint
CREATE INDEX `issued_licenses_track_state_idx` ON `issued_licenses` (`track_id`,`state`);--> statement-breakpoint
CREATE TABLE `license_document_jobs` (
	`id` text PRIMARY KEY NOT NULL,
	`license_document_id` text NOT NULL,
	`status` text DEFAULT 'queued' NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`worker_id` text,
	`lease_token` text,
	`lease_expires_at` text,
	`failure_category` text,
	`last_operation_key` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`license_document_id`) REFERENCES `license_documents`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "license_document_jobs_status_valid" CHECK("license_document_jobs"."status" in ('queued', 'processing', 'complete', 'failed')),
	CONSTRAINT "license_document_jobs_attempts_nonnegative" CHECK("license_document_jobs"."attempts" >= 0),
	CONSTRAINT "license_document_jobs_lease_valid" CHECK(("license_document_jobs"."status" = 'processing' and "license_document_jobs"."worker_id" is not null and "license_document_jobs"."lease_token" is not null and "license_document_jobs"."lease_expires_at" is not null) or ("license_document_jobs"."status" <> 'processing' and "license_document_jobs"."lease_token" is null and "license_document_jobs"."lease_expires_at" is null)),
	CONSTRAINT "license_document_jobs_failure_valid" CHECK(("license_document_jobs"."status" = 'failed' and "license_document_jobs"."failure_category" is not null) or ("license_document_jobs"."status" <> 'failed' and "license_document_jobs"."failure_category" is null))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `license_document_jobs_document_unique` ON `license_document_jobs` (`license_document_id`);--> statement-breakpoint
CREATE INDEX `license_document_jobs_status_created_idx` ON `license_document_jobs` (`status`,`created_at`);--> statement-breakpoint
CREATE TABLE `license_documents` (
	`id` text PRIMARY KEY NOT NULL,
	`issued_license_id` text NOT NULL,
	`customer_user_id` text NOT NULL,
	`state` text DEFAULT 'queued' NOT NULL,
	`media_object_id` text,
	`content_digest` text,
	`byte_length` integer,
	`failure_category` text,
	`stripe_environment` text DEFAULT 'test' NOT NULL,
	`livemode` integer DEFAULT false NOT NULL,
	`revision` integer DEFAULT 1 NOT NULL,
	`last_operation_key` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`issued_license_id`) REFERENCES `issued_licenses`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`media_object_id`) REFERENCES `media_objects`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`issued_license_id`,`customer_user_id`) REFERENCES `issued_licenses`(`id`,`customer_user_id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "license_documents_state_valid" CHECK("license_documents"."state" in ('queued', 'processing', 'ready', 'failed')),
	CONSTRAINT "license_documents_result_valid" CHECK((
        "license_documents"."state" in ('queued', 'processing')
        and "license_documents"."media_object_id" is null
        and "license_documents"."content_digest" is null
        and "license_documents"."byte_length" is null
        and "license_documents"."failure_category" is null
      ) or (
        "license_documents"."state" = 'ready'
        and "license_documents"."content_digest" is not null
        and length("license_documents"."content_digest") = 64
        and "license_documents"."byte_length" > 0
        and "license_documents"."failure_category" is null
      ) or (
        "license_documents"."state" = 'failed'
        and "license_documents"."media_object_id" is null
        and "license_documents"."content_digest" is null
        and "license_documents"."byte_length" is null
        and "license_documents"."failure_category" is not null
      )),
	CONSTRAINT "license_documents_test_only" CHECK("license_documents"."stripe_environment" = 'test' and "license_documents"."livemode" = 0),
	CONSTRAINT "license_documents_revision_positive" CHECK("license_documents"."revision" > 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `license_documents_license_unique` ON `license_documents` (`issued_license_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `license_documents_identity_customer_unique` ON `license_documents` (`id`,`customer_user_id`);--> statement-breakpoint
CREATE INDEX `license_documents_state_updated_idx` ON `license_documents` (`state`,`updated_at`);--> statement-breakpoint
CREATE TABLE `license_events` (
	`id` text PRIMARY KEY NOT NULL,
	`customer_user_id` text NOT NULL,
	`license_request_id` text,
	`issued_license_id` text,
	`event_type` text NOT NULL,
	`actor_user_id` text,
	`source` text NOT NULL,
	`order_id` text,
	`credit_ledger_entry_id` text,
	`fulfillment_event_id` text,
	`details_json` text DEFAULT '{}' NOT NULL,
	`idempotency_key` text NOT NULL,
	`stripe_environment` text DEFAULT 'test' NOT NULL,
	`livemode` integer DEFAULT false NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`customer_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`license_request_id`) REFERENCES `license_requests`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`issued_license_id`) REFERENCES `issued_licenses`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`actor_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`order_id`) REFERENCES `orders`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`credit_ledger_entry_id`) REFERENCES `credit_ledger_entries`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`fulfillment_event_id`) REFERENCES `fulfillment_events`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "license_events_subject_valid" CHECK("license_events"."license_request_id" is not null or "license_events"."issued_license_id" is not null),
	CONSTRAINT "license_events_type_valid" CHECK("license_events"."event_type" in ('submitted', 'approved', 'rejected', 'canceled', 'issued', 'revoked', 'expired', 'document_ready', 'document_failed')),
	CONSTRAINT "license_events_source_valid" CHECK("license_events"."source" in ('customer', 'owner', 'credit', 'stripe_test', 'system')),
	CONSTRAINT "license_events_details_json_valid" CHECK(json_valid("license_events"."details_json") and json_type("license_events"."details_json") = 'object'),
	CONSTRAINT "license_events_test_only" CHECK("license_events"."stripe_environment" = 'test' and "license_events"."livemode" = 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `license_events_operation_unique` ON `license_events` (`idempotency_key`);--> statement-breakpoint
CREATE INDEX `license_events_customer_created_idx` ON `license_events` (`customer_user_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `license_events_license_created_idx` ON `license_events` (`issued_license_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `license_offers` (
	`id` text PRIMARY KEY NOT NULL,
	`slug` text NOT NULL,
	`track_id` text NOT NULL,
	`track_revision_id` text NOT NULL,
	`license_terms_id` text NOT NULL,
	`license_terms_version_id` text NOT NULL,
	`license_terms_version` integer NOT NULL,
	`license_option_id` text NOT NULL,
	`commerce_product_id` text NOT NULL,
	`commerce_price_id` text NOT NULL,
	`state` text DEFAULT 'draft' NOT NULL,
	`revision` integer DEFAULT 1 NOT NULL,
	`created_by_user_id` text,
	`last_operation_key` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`track_id`) REFERENCES `tracks`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`commerce_product_id`) REFERENCES `commerce_products`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`created_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`track_id`,`track_revision_id`) REFERENCES `track_revisions`(`track_id`,`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`license_terms_version_id`,`license_terms_id`,`license_terms_version`) REFERENCES `license_terms_versions`(`id`,`license_terms_id`,`version`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`license_option_id`,`license_terms_version_id`) REFERENCES `license_options`(`id`,`license_terms_version_id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`commerce_price_id`,`commerce_product_id`) REFERENCES `commerce_prices`(`id`,`commerce_product_id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "license_offers_slug_normalized" CHECK("license_offers"."slug" = lower(trim("license_offers"."slug")) and instr("license_offers"."slug", '/') = 0),
	CONSTRAINT "license_offers_state_valid" CHECK("license_offers"."state" in ('draft', 'active', 'archived')),
	CONSTRAINT "license_offers_revision_positive" CHECK("license_offers"."revision" > 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `license_offers_slug_unique` ON `license_offers` (`slug`);--> statement-breakpoint
CREATE UNIQUE INDEX `license_offers_track_option_unique` ON `license_offers` (`track_id`,`license_terms_version_id`,`license_option_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `license_offers_identity_revision_unique` ON `license_offers` (`id`,`revision`);--> statement-breakpoint
CREATE INDEX `license_offers_track_state_idx` ON `license_offers` (`track_id`,`state`);--> statement-breakpoint
CREATE TABLE `license_options` (
	`id` text PRIMARY KEY NOT NULL,
	`license_terms_id` text NOT NULL,
	`license_terms_version_id` text NOT NULL,
	`license_terms_version` integer NOT NULL,
	`option_key` text NOT NULL,
	`label` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`usage_category` text NOT NULL,
	`allowed_media_json` text DEFAULT '[]' NOT NULL,
	`audience_label` text,
	`max_audience` integer,
	`distribution_label` text,
	`max_copies` integer,
	`term_months` integer,
	`territory` text DEFAULT 'Worldwide' NOT NULL,
	`attribution_required` integer DEFAULT true NOT NULL,
	`attribution_text` text,
	`exclusive` integer DEFAULT false NOT NULL,
	`requires_approval` integer DEFAULT false NOT NULL,
	`license_credit_cost` integer DEFAULT 1 NOT NULL,
	`includes_track_download` integer DEFAULT true NOT NULL,
	`position` integer NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`license_terms_version_id`,`license_terms_id`,`license_terms_version`) REFERENCES `license_terms_versions`(`id`,`license_terms_id`,`version`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "license_options_key_normalized" CHECK("license_options"."option_key" = lower(trim("license_options"."option_key")) and instr("license_options"."option_key", '/') = 0),
	CONSTRAINT "license_options_label_length_valid" CHECK(length(trim("license_options"."label")) between 1 and 160),
	CONSTRAINT "license_options_description_length_valid" CHECK(length("license_options"."description") <= 4000),
	CONSTRAINT "license_options_usage_length_valid" CHECK(length(trim("license_options"."usage_category")) between 1 and 120),
	CONSTRAINT "license_options_media_json_valid" CHECK(json_valid("license_options"."allowed_media_json") and json_type("license_options"."allowed_media_json") = 'array'),
	CONSTRAINT "license_options_limits_positive" CHECK(("license_options"."max_audience" is null or "license_options"."max_audience" > 0) and ("license_options"."max_copies" is null or "license_options"."max_copies" > 0) and ("license_options"."term_months" is null or "license_options"."term_months" > 0)),
	CONSTRAINT "license_options_attribution_valid" CHECK("license_options"."attribution_required" = 0 or "license_options"."attribution_text" is not null),
	CONSTRAINT "license_options_credit_cost_positive" CHECK("license_options"."license_credit_cost" > 0),
	CONSTRAINT "license_options_position_positive" CHECK("license_options"."position" > 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `license_options_version_key_unique` ON `license_options` (`license_terms_version_id`,`option_key`);--> statement-breakpoint
CREATE UNIQUE INDEX `license_options_version_position_unique` ON `license_options` (`license_terms_version_id`,`position`);--> statement-breakpoint
CREATE UNIQUE INDEX `license_options_identity_version_unique` ON `license_options` (`id`,`license_terms_version_id`);--> statement-breakpoint
CREATE TABLE `license_requests` (
	`id` text PRIMARY KEY NOT NULL,
	`customer_user_id` text NOT NULL,
	`license_offer_id` text NOT NULL,
	`license_offer_revision` integer NOT NULL,
	`track_id` text NOT NULL,
	`license_terms_version_id` text NOT NULL,
	`license_option_id` text NOT NULL,
	`licensee_name` text NOT NULL,
	`project_title` text NOT NULL,
	`intended_use` text NOT NULL,
	`project_description` text NOT NULL,
	`intended_use_snapshot_json` text NOT NULL,
	`terms_snapshot_json` text NOT NULL,
	`state` text DEFAULT 'draft' NOT NULL,
	`approved_by_user_id` text,
	`approved_at` text,
	`rejected_by_user_id` text,
	`rejected_at` text,
	`canceled_at` text,
	`issued_at` text,
	`stripe_environment` text DEFAULT 'test' NOT NULL,
	`livemode` integer DEFAULT false NOT NULL,
	`revision` integer DEFAULT 1 NOT NULL,
	`last_operation_key` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`customer_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`license_offer_id`) REFERENCES `license_offers`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`track_id`) REFERENCES `tracks`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`license_terms_version_id`) REFERENCES `license_terms_versions`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`license_option_id`) REFERENCES `license_options`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`approved_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`rejected_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`license_offer_id`,`license_offer_revision`) REFERENCES `license_offers`(`id`,`revision`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "license_requests_text_length_valid" CHECK(length(trim("license_requests"."licensee_name")) between 1 and 160 and length(trim("license_requests"."project_title")) between 1 and 240 and length(trim("license_requests"."intended_use")) between 1 and 2000 and length(trim("license_requests"."project_description")) between 1 and 12000),
	CONSTRAINT "license_requests_snapshots_valid" CHECK(json_valid("license_requests"."intended_use_snapshot_json") and json_type("license_requests"."intended_use_snapshot_json") = 'object' and json_valid("license_requests"."terms_snapshot_json") and json_type("license_requests"."terms_snapshot_json") = 'object'),
	CONSTRAINT "license_requests_state_valid" CHECK("license_requests"."state" in ('draft', 'submitted', 'pending_approval', 'approved', 'rejected', 'canceled', 'issued')),
	CONSTRAINT "license_requests_terminal_state_valid" CHECK((
        "license_requests"."state" in ('draft', 'submitted', 'pending_approval')
        and "license_requests"."approved_at" is null
        and "license_requests"."rejected_at" is null
        and "license_requests"."canceled_at" is null
        and "license_requests"."issued_at" is null
      ) or (
        "license_requests"."state" = 'approved'
        and "license_requests"."approved_by_user_id" is not null
        and "license_requests"."approved_at" is not null
        and "license_requests"."rejected_at" is null
        and "license_requests"."canceled_at" is null
        and "license_requests"."issued_at" is null
      ) or (
        "license_requests"."state" = 'rejected'
        and "license_requests"."rejected_by_user_id" is not null
        and "license_requests"."rejected_at" is not null
        and "license_requests"."canceled_at" is null
        and "license_requests"."issued_at" is null
      ) or (
        "license_requests"."state" = 'canceled'
        and "license_requests"."canceled_at" is not null
        and "license_requests"."issued_at" is null
      ) or (
        "license_requests"."state" = 'issued'
        and "license_requests"."issued_at" is not null
      )),
	CONSTRAINT "license_requests_test_only" CHECK("license_requests"."stripe_environment" = 'test' and "license_requests"."livemode" = 0),
	CONSTRAINT "license_requests_revision_positive" CHECK("license_requests"."revision" > 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `license_requests_identity_customer_unique` ON `license_requests` (`id`,`customer_user_id`);--> statement-breakpoint
CREATE INDEX `license_requests_customer_state_idx` ON `license_requests` (`customer_user_id`,`state`,`created_at`);--> statement-breakpoint
CREATE INDEX `license_requests_offer_state_idx` ON `license_requests` (`license_offer_id`,`state`);--> statement-breakpoint
CREATE TABLE `license_terms` (
	`id` text PRIMARY KEY NOT NULL,
	`slug` text NOT NULL,
	`state` text DEFAULT 'draft' NOT NULL,
	`current_version` integer DEFAULT 1 NOT NULL,
	`created_by_user_id` text,
	`last_operation_key` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`created_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "license_terms_slug_normalized" CHECK("license_terms"."slug" = lower(trim("license_terms"."slug"))),
	CONSTRAINT "license_terms_slug_no_slash" CHECK(instr("license_terms"."slug", '/') = 0),
	CONSTRAINT "license_terms_state_valid" CHECK("license_terms"."state" in ('draft', 'active', 'archived')),
	CONSTRAINT "license_terms_version_positive" CHECK("license_terms"."current_version" > 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `license_terms_slug_unique` ON `license_terms` (`slug`);--> statement-breakpoint
CREATE UNIQUE INDEX `license_terms_identity_version_unique` ON `license_terms` (`id`,`current_version`);--> statement-breakpoint
CREATE INDEX `license_terms_state_slug_idx` ON `license_terms` (`state`,`slug`);--> statement-breakpoint
CREATE TABLE `license_terms_versions` (
	`id` text PRIMARY KEY NOT NULL,
	`license_terms_id` text NOT NULL,
	`version` integer NOT NULL,
	`name` text NOT NULL,
	`title` text NOT NULL,
	`introduction` text DEFAULT '' NOT NULL,
	`general_terms` text NOT NULL,
	`disclaimer` text DEFAULT '' NOT NULL,
	`created_by_user_id` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`license_terms_id`) REFERENCES `license_terms`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`created_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "license_terms_versions_name_length_valid" CHECK(length(trim("license_terms_versions"."name")) between 1 and 120),
	CONSTRAINT "license_terms_versions_title_length_valid" CHECK(length(trim("license_terms_versions"."title")) between 1 and 240),
	CONSTRAINT "license_terms_versions_content_length_valid" CHECK(length("license_terms_versions"."introduction") <= 12000 and length("license_terms_versions"."general_terms") between 1 and 100000 and length("license_terms_versions"."disclaimer") <= 12000),
	CONSTRAINT "license_terms_versions_version_positive" CHECK("license_terms_versions"."version" > 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `license_terms_versions_terms_version_unique` ON `license_terms_versions` (`license_terms_id`,`version`);--> statement-breakpoint
CREATE UNIQUE INDEX `license_terms_versions_identity_unique` ON `license_terms_versions` (`id`,`license_terms_id`,`version`);--> statement-breakpoint
CREATE TABLE `membership_plan_revisions` (
	`id` text PRIMARY KEY NOT NULL,
	`membership_plan_id` text NOT NULL,
	`revision` integer NOT NULL,
	`name` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`benefits_json` text DEFAULT '[]' NOT NULL,
	`access_plan_id` text,
	`access_plan_revision` integer,
	`download_credits` integer DEFAULT 0 NOT NULL,
	`license_credits` integer DEFAULT 0 NOT NULL,
	`duration_days` integer,
	`created_by_user_id` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`membership_plan_id`) REFERENCES `membership_plans`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`access_plan_id`) REFERENCES `access_plans`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`created_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "membership_plan_revisions_name_length_valid" CHECK(length(trim("membership_plan_revisions"."name")) between 1 and 120),
	CONSTRAINT "membership_plan_revisions_description_length_valid" CHECK(length("membership_plan_revisions"."description") <= 4000),
	CONSTRAINT "membership_plan_revisions_benefits_json_valid" CHECK(json_valid("membership_plan_revisions"."benefits_json") and json_type("membership_plan_revisions"."benefits_json") = 'array'),
	CONSTRAINT "membership_plan_revisions_access_plan_valid" CHECK(("membership_plan_revisions"."access_plan_id" is null and "membership_plan_revisions"."access_plan_revision" is null) or ("membership_plan_revisions"."access_plan_id" is not null and "membership_plan_revisions"."access_plan_revision" > 0)),
	CONSTRAINT "membership_plan_revisions_credits_nonnegative" CHECK("membership_plan_revisions"."download_credits" >= 0 and "membership_plan_revisions"."license_credits" >= 0),
	CONSTRAINT "membership_plan_revisions_duration_positive" CHECK("membership_plan_revisions"."duration_days" is null or "membership_plan_revisions"."duration_days" > 0),
	CONSTRAINT "membership_plan_revisions_revision_positive" CHECK("membership_plan_revisions"."revision" > 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `membership_plan_revisions_plan_revision_unique` ON `membership_plan_revisions` (`membership_plan_id`,`revision`);--> statement-breakpoint
CREATE UNIQUE INDEX `membership_plan_revisions_identity_unique` ON `membership_plan_revisions` (`id`,`membership_plan_id`,`revision`);--> statement-breakpoint
CREATE INDEX `membership_plan_revisions_access_plan_idx` ON `membership_plan_revisions` (`access_plan_id`);--> statement-breakpoint
CREATE TABLE `membership_plans` (
	`id` text PRIMARY KEY NOT NULL,
	`slug` text NOT NULL,
	`state` text DEFAULT 'draft' NOT NULL,
	`current_revision` integer DEFAULT 1 NOT NULL,
	`created_by_user_id` text,
	`last_operation_key` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`created_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "membership_plans_slug_normalized" CHECK("membership_plans"."slug" = lower(trim("membership_plans"."slug"))),
	CONSTRAINT "membership_plans_slug_no_slash" CHECK(instr("membership_plans"."slug", '/') = 0),
	CONSTRAINT "membership_plans_state_valid" CHECK("membership_plans"."state" in ('draft', 'active', 'archived')),
	CONSTRAINT "membership_plans_revision_positive" CHECK("membership_plans"."current_revision" > 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `membership_plans_slug_unique` ON `membership_plans` (`slug`);--> statement-breakpoint
CREATE UNIQUE INDEX `membership_plans_identity_revision_unique` ON `membership_plans` (`id`,`current_revision`);--> statement-breakpoint
CREATE INDEX `membership_plans_state_slug_idx` ON `membership_plans` (`state`,`slug`);--> statement-breakpoint
CREATE TABLE `memberships` (
	`id` text PRIMARY KEY NOT NULL,
	`customer_user_id` text NOT NULL,
	`membership_plan_id` text NOT NULL,
	`membership_plan_revision_id` text NOT NULL,
	`membership_plan_revision` integer NOT NULL,
	`source` text NOT NULL,
	`source_order_id` text,
	`source_fulfillment_event_id` text,
	`state` text DEFAULT 'pending' NOT NULL,
	`starts_at` text NOT NULL,
	`current_period_start` text NOT NULL,
	`current_period_end` text NOT NULL,
	`cancel_at` text,
	`canceled_at` text,
	`expired_at` text,
	`stripe_environment` text DEFAULT 'test' NOT NULL,
	`livemode` integer DEFAULT false NOT NULL,
	`revision` integer DEFAULT 1 NOT NULL,
	`last_operation_key` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`customer_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`membership_plan_id`) REFERENCES `membership_plans`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`source_order_id`) REFERENCES `orders`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`source_fulfillment_event_id`) REFERENCES `fulfillment_events`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`membership_plan_revision_id`,`membership_plan_id`,`membership_plan_revision`) REFERENCES `membership_plan_revisions`(`id`,`membership_plan_id`,`revision`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "memberships_source_valid" CHECK("memberships"."source" in ('owner', 'stripe_test')),
	CONSTRAINT "memberships_source_links_valid" CHECK(("memberships"."source" = 'owner' and "memberships"."source_order_id" is null and "memberships"."source_fulfillment_event_id" is null) or ("memberships"."source" = 'stripe_test' and "memberships"."source_order_id" is not null and "memberships"."source_fulfillment_event_id" is not null)),
	CONSTRAINT "memberships_state_valid" CHECK("memberships"."state" in ('pending', 'active', 'paused', 'cancellation_scheduled', 'canceled', 'expired')),
	CONSTRAINT "memberships_period_valid" CHECK("memberships"."current_period_start" < "memberships"."current_period_end" and "memberships"."starts_at" <= "memberships"."current_period_start"),
	CONSTRAINT "memberships_terminal_state_valid" CHECK((
        "memberships"."state" in ('pending', 'active', 'paused')
        and "memberships"."cancel_at" is null
        and "memberships"."canceled_at" is null
        and "memberships"."expired_at" is null
      ) or (
        "memberships"."state" = 'cancellation_scheduled'
        and "memberships"."cancel_at" is not null
        and "memberships"."canceled_at" is null
        and "memberships"."expired_at" is null
      ) or (
        "memberships"."state" = 'canceled'
        and "memberships"."canceled_at" is not null
        and "memberships"."expired_at" is null
      ) or (
        "memberships"."state" = 'expired'
        and "memberships"."expired_at" is not null
        and "memberships"."canceled_at" is null
      )),
	CONSTRAINT "memberships_test_only" CHECK("memberships"."stripe_environment" = 'test' and "memberships"."livemode" = 0),
	CONSTRAINT "memberships_revision_positive" CHECK("memberships"."revision" > 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `memberships_identity_customer_unique` ON `memberships` (`id`,`customer_user_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `memberships_fulfillment_unique` ON `memberships` (`source_fulfillment_event_id`) WHERE "memberships"."source_fulfillment_event_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX `memberships_active_customer_plan_unique` ON `memberships` (`customer_user_id`,`membership_plan_id`) WHERE "memberships"."state" in ('pending', 'active', 'paused', 'cancellation_scheduled');--> statement-breakpoint
CREATE INDEX `memberships_customer_state_idx` ON `memberships` (`customer_user_id`,`state`,`current_period_end`);--> statement-breakpoint
CREATE INDEX `memberships_plan_state_idx` ON `memberships` (`membership_plan_id`,`state`);--> statement-breakpoint
CREATE TABLE `order_items` (
	`id` text PRIMARY KEY NOT NULL,
	`order_id` text NOT NULL,
	`commerce_product_id` text NOT NULL,
	`commerce_product_revision` integer NOT NULL,
	`commerce_price_id` text NOT NULL,
	`product_type` text NOT NULL,
	`product_name` text NOT NULL,
	`fulfillment_snapshot_json` text DEFAULT '{}' NOT NULL,
	`quantity` integer DEFAULT 1 NOT NULL,
	`unit_amount_minor` integer NOT NULL,
	`currency` text NOT NULL,
	`stripe_environment` text DEFAULT 'test' NOT NULL,
	`livemode` integer DEFAULT false NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`order_id`) REFERENCES `orders`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`commerce_product_id`) REFERENCES `commerce_products`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`commerce_price_id`) REFERENCES `commerce_prices`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "order_items_product_type_valid" CHECK("order_items"."product_type" in ('track', 'release', 'collection', 'membership', 'subscription', 'license', 'download-credits', 'license-credits')),
	CONSTRAINT "order_items_snapshot_json_valid" CHECK(json_valid("order_items"."fulfillment_snapshot_json") and json_type("order_items"."fulfillment_snapshot_json") = 'object'),
	CONSTRAINT "order_items_amount_valid" CHECK("order_items"."quantity" = 1 and "order_items"."unit_amount_minor" > 0 and length("order_items"."currency") = 3 and "order_items"."currency" = upper("order_items"."currency")),
	CONSTRAINT "order_items_test_only" CHECK("order_items"."stripe_environment" = 'test' and "order_items"."livemode" = 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `order_items_order_position_unique` ON `order_items` (`order_id`);--> statement-breakpoint
CREATE INDEX `order_items_product_idx` ON `order_items` (`commerce_product_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `orders` (
	`id` text PRIMARY KEY NOT NULL,
	`customer_user_id` text NOT NULL,
	`checkout_session_id` text NOT NULL,
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
	CONSTRAINT "orders_status_valid" CHECK("orders"."status" in ('pending', 'fulfilled', 'failed', 'canceled', 'reversed')),
	CONSTRAINT "orders_amount_currency_valid" CHECK("orders"."total_minor" > 0 and length("orders"."currency") = 3 and "orders"."currency" = upper("orders"."currency")),
	CONSTRAINT "orders_test_only" CHECK("orders"."stripe_environment" = 'test' and "orders"."livemode" = 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `orders_checkout_session_unique` ON `orders` (`checkout_session_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `orders_commerce_event_unique` ON `orders` (`commerce_event_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `orders_identity_customer_unique` ON `orders` (`id`,`customer_user_id`);--> statement-breakpoint
CREATE INDEX `orders_customer_created_idx` ON `orders` (`customer_user_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `orders_status_updated_idx` ON `orders` (`status`,`updated_at`);--> statement-breakpoint
CREATE TABLE `subscription_events` (
	`id` text PRIMARY KEY NOT NULL,
	`subscription_id` text NOT NULL,
	`customer_user_id` text NOT NULL,
	`event_type` text NOT NULL,
	`source` text NOT NULL,
	`from_state` text,
	`to_state` text NOT NULL,
	`period_start` text NOT NULL,
	`period_end` text NOT NULL,
	`stripe_event_id` text,
	`provider_object_id` text,
	`fulfillment_event_id` text,
	`order_id` text,
	`idempotency_key` text NOT NULL,
	`stripe_environment` text DEFAULT 'test' NOT NULL,
	`livemode` integer DEFAULT false NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`fulfillment_event_id`) REFERENCES `fulfillment_events`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`order_id`) REFERENCES `orders`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`subscription_id`,`customer_user_id`) REFERENCES `subscriptions`(`id`,`customer_user_id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "subscription_events_type_valid" CHECK("subscription_events"."event_type" in ('activated', 'renewed', 'paused', 'resumed', 'cancellation_scheduled', 'cancellation_cleared', 'canceled', 'expired')),
	CONSTRAINT "subscription_events_source_valid" CHECK("subscription_events"."source" in ('owner', 'stripe_test')),
	CONSTRAINT "subscription_events_state_valid" CHECK(("subscription_events"."from_state" is null or "subscription_events"."from_state" in ('pending', 'active', 'paused', 'cancellation_scheduled', 'canceled', 'expired')) and "subscription_events"."to_state" in ('pending', 'active', 'paused', 'cancellation_scheduled', 'canceled', 'expired')),
	CONSTRAINT "subscription_events_period_valid" CHECK("subscription_events"."period_start" < "subscription_events"."period_end"),
	CONSTRAINT "subscription_events_provider_valid" CHECK(("subscription_events"."source" = 'owner' and "subscription_events"."stripe_event_id" is null and "subscription_events"."provider_object_id" is null and "subscription_events"."fulfillment_event_id" is null) or ("subscription_events"."source" = 'stripe_test' and "subscription_events"."stripe_event_id" like 'evt_%' and "subscription_events"."provider_object_id" is not null and "subscription_events"."fulfillment_event_id" is not null)),
	CONSTRAINT "subscription_events_test_only" CHECK("subscription_events"."stripe_environment" = 'test' and "subscription_events"."livemode" = 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `subscription_events_operation_unique` ON `subscription_events` (`subscription_id`,`idempotency_key`);--> statement-breakpoint
CREATE UNIQUE INDEX `subscription_events_provider_cycle_unique` ON `subscription_events` (`event_type`,`provider_object_id`) WHERE "subscription_events"."provider_object_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX `subscription_events_fulfillment_unique` ON `subscription_events` (`fulfillment_event_id`) WHERE "subscription_events"."fulfillment_event_id" is not null;--> statement-breakpoint
CREATE INDEX `subscription_events_customer_created_idx` ON `subscription_events` (`customer_user_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `subscription_events_subscription_created_idx` ON `subscription_events` (`subscription_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `subscription_plans` (
	`id` text PRIMARY KEY NOT NULL,
	`slug` text NOT NULL,
	`name` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`membership_plan_id` text NOT NULL,
	`membership_plan_revision_id` text NOT NULL,
	`membership_plan_revision` integer NOT NULL,
	`billing_interval` text DEFAULT 'month' NOT NULL,
	`interval_count` integer DEFAULT 1 NOT NULL,
	`state` text DEFAULT 'draft' NOT NULL,
	`revision` integer DEFAULT 1 NOT NULL,
	`created_by_user_id` text,
	`last_operation_key` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`membership_plan_id`) REFERENCES `membership_plans`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`created_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`membership_plan_revision_id`,`membership_plan_id`,`membership_plan_revision`) REFERENCES `membership_plan_revisions`(`id`,`membership_plan_id`,`revision`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "subscription_plans_slug_normalized" CHECK("subscription_plans"."slug" = lower(trim("subscription_plans"."slug"))),
	CONSTRAINT "subscription_plans_slug_no_slash" CHECK(instr("subscription_plans"."slug", '/') = 0),
	CONSTRAINT "subscription_plans_name_length_valid" CHECK(length(trim("subscription_plans"."name")) between 1 and 120),
	CONSTRAINT "subscription_plans_description_length_valid" CHECK(length("subscription_plans"."description") <= 4000),
	CONSTRAINT "subscription_plans_interval_valid" CHECK("subscription_plans"."billing_interval" in ('month', 'year') and "subscription_plans"."interval_count" > 0),
	CONSTRAINT "subscription_plans_state_valid" CHECK("subscription_plans"."state" in ('draft', 'active', 'archived')),
	CONSTRAINT "subscription_plans_revision_positive" CHECK("subscription_plans"."revision" > 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `subscription_plans_slug_unique` ON `subscription_plans` (`slug`);--> statement-breakpoint
CREATE UNIQUE INDEX `subscription_plans_identity_revision_unique` ON `subscription_plans` (`id`,`revision`);--> statement-breakpoint
CREATE INDEX `subscription_plans_state_slug_idx` ON `subscription_plans` (`state`,`slug`);--> statement-breakpoint
CREATE TABLE `subscriptions` (
	`id` text PRIMARY KEY NOT NULL,
	`customer_user_id` text NOT NULL,
	`membership_id` text NOT NULL,
	`subscription_plan_id` text NOT NULL,
	`commerce_product_id` text,
	`commerce_price_id` text,
	`source` text NOT NULL,
	`stripe_subscription_id` text,
	`stripe_customer_id` text,
	`state` text DEFAULT 'pending' NOT NULL,
	`current_period_start` text NOT NULL,
	`current_period_end` text NOT NULL,
	`cancel_at_period_end` integer DEFAULT false NOT NULL,
	`cancel_at` text,
	`canceled_at` text,
	`expired_at` text,
	`last_provider_event_created_at` text,
	`stripe_environment` text DEFAULT 'test' NOT NULL,
	`livemode` integer DEFAULT false NOT NULL,
	`revision` integer DEFAULT 1 NOT NULL,
	`last_operation_key` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`subscription_plan_id`) REFERENCES `subscription_plans`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`commerce_product_id`) REFERENCES `commerce_products`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`commerce_price_id`) REFERENCES `commerce_prices`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`membership_id`,`customer_user_id`) REFERENCES `memberships`(`id`,`customer_user_id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "subscriptions_source_valid" CHECK("subscriptions"."source" in ('owner', 'stripe_test')),
	CONSTRAINT "subscriptions_source_fields_valid" CHECK(("subscriptions"."source" = 'owner' and "subscriptions"."stripe_subscription_id" is null and "subscriptions"."stripe_customer_id" is null and "subscriptions"."commerce_product_id" is null and "subscriptions"."commerce_price_id" is null) or ("subscriptions"."source" = 'stripe_test' and "subscriptions"."stripe_subscription_id" like 'sub_%' and "subscriptions"."commerce_product_id" is not null and "subscriptions"."commerce_price_id" is not null)),
	CONSTRAINT "subscriptions_state_valid" CHECK("subscriptions"."state" in ('pending', 'active', 'paused', 'cancellation_scheduled', 'canceled', 'expired')),
	CONSTRAINT "subscriptions_period_valid" CHECK("subscriptions"."current_period_start" < "subscriptions"."current_period_end"),
	CONSTRAINT "subscriptions_cancellation_valid" CHECK((
        "subscriptions"."state" in ('pending', 'active', 'paused')
        and "subscriptions"."cancel_at_period_end" = 0
        and "subscriptions"."cancel_at" is null
        and "subscriptions"."canceled_at" is null
        and "subscriptions"."expired_at" is null
      ) or (
        "subscriptions"."state" = 'cancellation_scheduled'
        and "subscriptions"."cancel_at_period_end" = 1
        and "subscriptions"."cancel_at" is not null
        and "subscriptions"."canceled_at" is null
        and "subscriptions"."expired_at" is null
      ) or (
        "subscriptions"."state" = 'canceled'
        and "subscriptions"."canceled_at" is not null
        and "subscriptions"."expired_at" is null
      ) or (
        "subscriptions"."state" = 'expired'
        and "subscriptions"."expired_at" is not null
        and "subscriptions"."canceled_at" is null
      )),
	CONSTRAINT "subscriptions_test_only" CHECK("subscriptions"."stripe_environment" = 'test' and "subscriptions"."livemode" = 0),
	CONSTRAINT "subscriptions_revision_positive" CHECK("subscriptions"."revision" > 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `subscriptions_membership_unique` ON `subscriptions` (`membership_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `subscriptions_identity_customer_unique` ON `subscriptions` (`id`,`customer_user_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `subscriptions_stripe_subscription_unique` ON `subscriptions` (`stripe_subscription_id`) WHERE "subscriptions"."stripe_subscription_id" is not null;--> statement-breakpoint
CREATE INDEX `subscriptions_customer_state_idx` ON `subscriptions` (`customer_user_id`,`state`,`current_period_end`);--> statement-breakpoint
CREATE INDEX `subscriptions_plan_state_idx` ON `subscriptions` (`subscription_plan_id`,`state`);--> statement-breakpoint
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
	CONSTRAINT "download_events_access_source_valid" CHECK("__new_download_events"."access_source" in ('public', 'account', 'role', 'ownership', 'grant', 'membership', 'subscription', 'license', 'credit')),
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
        "__new_download_events"."access_source" in ('membership', 'subscription', 'license', 'credit')
        and "__new_download_events"."stripe_environment" = 'test'
        and "__new_download_events"."livemode" = 0
      ) or (
        "__new_download_events"."access_source" not in ('membership', 'subscription', 'license', 'credit')
        and "__new_download_events"."stripe_environment" is null
        and "__new_download_events"."livemode" is null
      )),
	CONSTRAINT "download_events_credit_reservation_valid" CHECK("__new_download_events"."access_source" = 'credit' or "__new_download_events"."credit_reservation_id" is null),
	CONSTRAINT "download_events_anonymous_public_only" CHECK("__new_download_events"."user_id" is not null or "__new_download_events"."access_source" = 'public'),
	CONSTRAINT "download_events_byte_length_nonnegative" CHECK("__new_download_events"."byte_length" >= 0)
);
--> statement-breakpoint
INSERT INTO `__new_download_events`("id", "user_id", "resource_type", "resource_id", "media_derivative_id", "entitlement_id", "access_source", "entitlement_source_type", "entitlement_source_id", "credit_reservation_id", "stripe_environment", "livemode", "byte_length", "request_id", "delivered_at", "created_at") SELECT "id", "user_id", "resource_type", "resource_id", "media_derivative_id", "entitlement_id", "access_source", NULL, NULL, NULL, NULL, NULL, "byte_length", "request_id", "delivered_at", "created_at" FROM `download_events`;--> statement-breakpoint
DROP TABLE `download_events`;--> statement-breakpoint
ALTER TABLE `__new_download_events` RENAME TO `download_events`;--> statement-breakpoint
CREATE UNIQUE INDEX `download_events_request_unique` ON `download_events` (`request_id`);--> statement-breakpoint
CREATE INDEX `download_events_user_delivered_idx` ON `download_events` (`user_id`,`delivered_at`);--> statement-breakpoint
CREATE INDEX `download_events_resource_delivered_idx` ON `download_events` (`resource_type`,`resource_id`,`delivered_at`);--> statement-breakpoint
CREATE TABLE `__new_installation_state` (
	`id` text PRIMARY KEY NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`owner_user_id` text,
	`schema_version` integer DEFAULT 7 NOT NULL,
	`last_operation_key` text,
	`bootstrap_completed_at` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`owner_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "installation_state_status_valid" CHECK("__new_installation_state"."status" in ('pending', 'active')),
	CONSTRAINT "installation_state_schema_version_positive" CHECK("__new_installation_state"."schema_version" > 0)
);
--> statement-breakpoint
INSERT INTO `__new_installation_state`("id", "status", "owner_user_id", "schema_version", "last_operation_key", "bootstrap_completed_at", "created_at", "updated_at") SELECT "id", "status", "owner_user_id", 7, "last_operation_key", "bootstrap_completed_at", "created_at", "updated_at" FROM `installation_state`;--> statement-breakpoint
DROP TABLE `installation_state`;--> statement-breakpoint
ALTER TABLE `__new_installation_state` RENAME TO `installation_state`;--> statement-breakpoint
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
INSERT INTO `__new_entitlements`("id", "user_id", "source_type", "source_id", "grant_id", "resource_type", "resource_id", "actions_json", "state", "starts_at", "expires_at", "remaining_uses", "download_disposition", "stripe_environment", "livemode", "fulfillment_event_id", "credit_reservation_id", "revision", "last_operation_key", "created_at", "updated_at") SELECT "id", "user_id", "source_type", "source_id", "grant_id", "resource_type", "resource_id", "actions_json", "state", "starts_at", "expires_at", "remaining_uses", "download_disposition", NULL, NULL, NULL, NULL, "revision", "last_operation_key", "created_at", "updated_at" FROM `entitlements`;--> statement-breakpoint
DROP TABLE `entitlements`;--> statement-breakpoint
ALTER TABLE `__new_entitlements` RENAME TO `entitlements`;--> statement-breakpoint
CREATE UNIQUE INDEX `entitlements_source_resource_unique` ON `entitlements` (`source_type`,`source_id`,`resource_type`,`resource_id`);--> statement-breakpoint
CREATE INDEX `entitlements_user_state_resource_idx` ON `entitlements` (`user_id`,`state`,`resource_type`,`resource_id`);--> statement-breakpoint
CREATE INDEX `entitlements_expiry_idx` ON `entitlements` (`state`,`expires_at`);--> statement-breakpoint
PRAGMA foreign_keys=ON;
