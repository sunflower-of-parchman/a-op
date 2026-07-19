PRAGMA foreign_keys=OFF;--> statement-breakpoint
PRAGMA defer_foreign_keys=ON;--> statement-breakpoint
CREATE TABLE `__new_legal_documents` (
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
	FOREIGN KEY (`draft_version_id`,`id`) REFERENCES `__new_legal_document_versions`(`id`,`document_id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`approved_version_id`,`id`) REFERENCES `__new_legal_document_versions`(`id`,`document_id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`published_version_id`,`id`) REFERENCES `__new_legal_document_versions`(`id`,`document_id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "legal_documents_id_valid" CHECK("__new_legal_documents"."id" in ('privacy', 'terms')),
	CONSTRAINT "legal_documents_title_present" CHECK(length(trim("__new_legal_documents"."title")) between 1 and 160),
	CONSTRAINT "legal_documents_version_positive" CHECK("__new_legal_documents"."current_version" > 0),
	CONSTRAINT "legal_documents_revision_positive" CHECK("__new_legal_documents"."revision" > 0),
	CONSTRAINT "legal_documents_publication_consistent" CHECK(("__new_legal_documents"."published_version_id" is null and "__new_legal_documents"."published_at" is null) or ("__new_legal_documents"."published_version_id" is not null and "__new_legal_documents"."published_at" is not null))
);--> statement-breakpoint
CREATE TABLE `__new_legal_document_versions` (
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
	FOREIGN KEY (`document_id`) REFERENCES `__new_legal_documents`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`created_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`approved_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "legal_document_versions_number_positive" CHECK("__new_legal_document_versions"."version" > 0),
	CONSTRAINT "legal_document_versions_content_present" CHECK(length(trim("__new_legal_document_versions"."title")) between 1 and 160 and length(trim("__new_legal_document_versions"."body_text")) between 1 and 40000 and length("__new_legal_document_versions"."introduction") <= 4000),
	CONSTRAINT "legal_document_versions_answers_json_valid" CHECK(json_valid("__new_legal_document_versions"."setup_answers_json") and json_type("__new_legal_document_versions"."setup_answers_json") = 'object'),
	CONSTRAINT "legal_document_versions_approval_consistent" CHECK(("__new_legal_document_versions"."approved_by_user_id" is null and "__new_legal_document_versions"."approved_at" is null) or ("__new_legal_document_versions"."approved_by_user_id" is not null and "__new_legal_document_versions"."approved_at" is not null))
);--> statement-breakpoint
CREATE UNIQUE INDEX `__new_legal_document_versions_document_number_unique` ON `__new_legal_document_versions` (`document_id`,`version`);--> statement-breakpoint
CREATE UNIQUE INDEX `__new_legal_document_versions_identity_document_unique` ON `__new_legal_document_versions` (`id`,`document_id`);--> statement-breakpoint
INSERT INTO `__new_legal_documents`
  (`id`, `title`, `draft_version_id`, `approved_version_id`,
   `published_version_id`, `current_version`, `revision`,
   `last_operation_key`, `published_at`, `created_at`, `updated_at`)
SELECT `id`, `title`, `draft_version_id`, `approved_version_id`,
       `published_version_id`, `current_version`, `revision`,
       `last_operation_key`, `published_at`, `created_at`, `updated_at`
FROM `legal_documents`;--> statement-breakpoint
INSERT INTO `__new_legal_document_versions`
  (`id`, `document_id`, `version`, `title`, `introduction`, `body_text`,
   `setup_answers_json`, `created_by_user_id`, `approved_by_user_id`,
   `approved_at`, `created_at`)
SELECT `id`, `document_id`, `version`, `title`, `introduction`, `body_text`,
       `setup_answers_json`, `created_by_user_id`, `approved_by_user_id`,
       `approved_at`, `created_at`
FROM `legal_document_versions`;--> statement-breakpoint
DROP TABLE `legal_document_versions`;--> statement-breakpoint
DROP TABLE `legal_documents`;--> statement-breakpoint
ALTER TABLE `__new_legal_documents` RENAME TO `legal_documents`;--> statement-breakpoint
ALTER TABLE `__new_legal_document_versions` RENAME TO `legal_document_versions`;--> statement-breakpoint
DROP INDEX `__new_legal_document_versions_document_number_unique`;--> statement-breakpoint
DROP INDEX `__new_legal_document_versions_identity_document_unique`;--> statement-breakpoint
CREATE UNIQUE INDEX `legal_document_versions_document_number_unique` ON `legal_document_versions` (`document_id`,`version`);--> statement-breakpoint
CREATE UNIQUE INDEX `legal_document_versions_identity_document_unique` ON `legal_document_versions` (`id`,`document_id`);--> statement-breakpoint
PRAGMA foreign_keys=ON;
