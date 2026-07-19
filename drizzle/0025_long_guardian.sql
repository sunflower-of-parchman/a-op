PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_installation_state` (
	`id` text PRIMARY KEY NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`owner_user_id` text,
	`schema_version` integer DEFAULT 13 NOT NULL,
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
CREATE TABLE `__new_contact_forms` (
	`id` text PRIMARY KEY NOT NULL,
	`form_key` text NOT NULL,
	`title` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`booking_information` text DEFAULT '' NOT NULL,
	`public_contact_details` text DEFAULT '' NOT NULL,
	`categories_json` text DEFAULT '[]' NOT NULL,
	`state` text DEFAULT 'active' NOT NULL,
	`current_consent_version` integer NOT NULL,
	`delivery_adapter` text DEFAULT 'stored_only' NOT NULL,
	`revision` integer DEFAULT 1 NOT NULL,
	`last_operation_key` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	CONSTRAINT "contact_forms_key_normalized" CHECK("__new_contact_forms"."form_key" = lower(trim("__new_contact_forms"."form_key")) and instr("__new_contact_forms"."form_key", '/') = 0),
	CONSTRAINT "contact_forms_categories_json_valid" CHECK(json_valid("__new_contact_forms"."categories_json") and json_type("__new_contact_forms"."categories_json") = 'array'),
	CONSTRAINT "contact_forms_public_details_length_valid" CHECK(length("__new_contact_forms"."booking_information") <= 4000 and length("__new_contact_forms"."public_contact_details") <= 4000),
	CONSTRAINT "contact_forms_state_valid" CHECK("__new_contact_forms"."state" in ('active', 'disabled')),
	CONSTRAINT "contact_forms_consent_version_positive" CHECK("__new_contact_forms"."current_consent_version" > 0),
	CONSTRAINT "contact_forms_adapter_valid" CHECK("__new_contact_forms"."delivery_adapter" = 'stored_only'),
	CONSTRAINT "contact_forms_revision_positive" CHECK("__new_contact_forms"."revision" > 0)
);
--> statement-breakpoint
INSERT INTO `__new_contact_forms`("id", "form_key", "title", "description", "booking_information", "public_contact_details", "categories_json", "state", "current_consent_version", "delivery_adapter", "revision", "last_operation_key", "created_at", "updated_at") SELECT "id", "form_key", "title", "description", '', '', "categories_json", "state", "current_consent_version", "delivery_adapter", "revision", "last_operation_key", "created_at", "updated_at" FROM `contact_forms`;--> statement-breakpoint
DROP TABLE `contact_forms`;--> statement-breakpoint
ALTER TABLE `__new_contact_forms` RENAME TO `contact_forms`;--> statement-breakpoint
CREATE UNIQUE INDEX `contact_forms_key_unique` ON `contact_forms` (`form_key`);--> statement-breakpoint
UPDATE `installation_state`
SET `schema_version` = 13,
    `updated_at` = CURRENT_TIMESTAMP
WHERE `id` = 'installation' AND `schema_version` = 12;--> statement-breakpoint
PRAGMA foreign_keys=ON;
