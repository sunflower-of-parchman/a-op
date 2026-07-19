CREATE TABLE `artist_config` (
	`id` text PRIMARY KEY NOT NULL,
	`draft_revision_id` text NOT NULL,
	`published_revision_id` text,
	`version` integer DEFAULT 1 NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`published_at` text,
	CONSTRAINT "artist_config_version_positive" CHECK("artist_config"."version" > 0)
);
--> statement-breakpoint
CREATE TABLE `artist_config_revisions` (
	`id` text PRIMARY KEY NOT NULL,
	`artist_config_id` text NOT NULL,
	`revision` integer NOT NULL,
	`display_name` text NOT NULL,
	`site_title` text NOT NULL,
	`headline` text NOT NULL,
	`introduction` text NOT NULL,
	`footer_text` text NOT NULL,
	`created_by_user_id` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`artist_config_id`) REFERENCES `artist_config`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`created_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "artist_config_revisions_number_positive" CHECK("artist_config_revisions"."revision" > 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `artist_config_revisions_number_unique` ON `artist_config_revisions` (`artist_config_id`,`revision`);--> statement-breakpoint
CREATE TABLE `artist_domains` (
	`id` text PRIMARY KEY NOT NULL,
	`hostname` text NOT NULL,
	`kind` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`verified_at` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	CONSTRAINT "artist_domains_hostname_normalized" CHECK("artist_domains"."hostname" = lower(trim("artist_domains"."hostname"))),
	CONSTRAINT "artist_domains_kind_valid" CHECK("artist_domains"."kind" in ('canonical', 'redirect')),
	CONSTRAINT "artist_domains_status_valid" CHECK("artist_domains"."status" in ('pending', 'verified', 'active', 'disabled'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `artist_domains_hostname_unique` ON `artist_domains` (`hostname`);--> statement-breakpoint
CREATE INDEX `artist_domains_status_idx` ON `artist_domains` (`status`);--> statement-breakpoint
CREATE TABLE `artist_modules` (
	`module_key` text PRIMARY KEY NOT NULL,
	`active` integer DEFAULT false NOT NULL,
	`settings_json` text DEFAULT '{}' NOT NULL,
	`activated_at` text,
	`deactivated_at` text,
	`updated_by_user_id` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`updated_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "artist_modules_active_valid" CHECK("artist_modules"."active" in (0, 1)),
	CONSTRAINT "artist_modules_settings_json_valid" CHECK(json_valid("artist_modules"."settings_json"))
);
--> statement-breakpoint
CREATE INDEX `artist_modules_active_idx` ON `artist_modules` (`active`,`module_key`);--> statement-breakpoint
CREATE TABLE `editor_permissions` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`permission_key` text NOT NULL,
	`scope_id` text DEFAULT '*' NOT NULL,
	`assigned_by_user_id` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`revoked_at` text,
	`revoked_by_user_id` text,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`assigned_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`revoked_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "editor_permissions_key_valid" CHECK("editor_permissions"."permission_key" = 'pages.write')
);
--> statement-breakpoint
CREATE UNIQUE INDEX `editor_permissions_user_scope_unique` ON `editor_permissions` (`user_id`,`permission_key`,`scope_id`);--> statement-breakpoint
CREATE INDEX `editor_permissions_active_lookup` ON `editor_permissions` (`user_id`,`permission_key`,`revoked_at`);--> statement-breakpoint
CREATE TABLE `installation_state` (
	`id` text PRIMARY KEY NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`owner_user_id` text,
	`schema_version` integer DEFAULT 2 NOT NULL,
	`bootstrap_completed_at` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`owner_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "installation_state_status_valid" CHECK("installation_state"."status" in ('pending', 'active')),
	CONSTRAINT "installation_state_schema_version_positive" CHECK("installation_state"."schema_version" > 0)
);
--> statement-breakpoint
CREATE TABLE `navigation_items` (
	`id` text PRIMARY KEY NOT NULL,
	`navigation_set_id` text NOT NULL,
	`version` integer NOT NULL,
	`item_key` text NOT NULL,
	`label` text NOT NULL,
	`href` text NOT NULL,
	`position` integer NOT NULL,
	`module_key` text,
	`external` integer DEFAULT false NOT NULL,
	`created_by_user_id` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`navigation_set_id`) REFERENCES `navigation_sets`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`created_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "navigation_items_version_positive" CHECK("navigation_items"."version" > 0),
	CONSTRAINT "navigation_items_position_nonnegative" CHECK("navigation_items"."position" >= 0),
	CONSTRAINT "navigation_items_external_valid" CHECK("navigation_items"."external" in (0, 1))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `navigation_items_version_key_unique` ON `navigation_items` (`navigation_set_id`,`version`,`item_key`);--> statement-breakpoint
CREATE UNIQUE INDEX `navigation_items_version_position_unique` ON `navigation_items` (`navigation_set_id`,`version`,`position`);--> statement-breakpoint
CREATE INDEX `navigation_items_published_lookup` ON `navigation_items` (`navigation_set_id`,`version`,`position`);--> statement-breakpoint
CREATE TABLE `navigation_sets` (
	`id` text PRIMARY KEY NOT NULL,
	`label` text NOT NULL,
	`draft_version` integer DEFAULT 1 NOT NULL,
	`published_version` integer,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`published_at` text,
	CONSTRAINT "navigation_sets_id_valid" CHECK("navigation_sets"."id" in ('primary', 'footer')),
	CONSTRAINT "navigation_sets_draft_version_positive" CHECK("navigation_sets"."draft_version" > 0),
	CONSTRAINT "navigation_sets_published_version_positive" CHECK("navigation_sets"."published_version" is null or "navigation_sets"."published_version" > 0)
);
--> statement-breakpoint
CREATE TABLE `page_revisions` (
	`id` text PRIMARY KEY NOT NULL,
	`page_id` text NOT NULL,
	`revision` integer NOT NULL,
	`title` text NOT NULL,
	`introduction` text NOT NULL,
	`body_text` text NOT NULL,
	`created_by_user_id` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`page_id`) REFERENCES `pages`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`created_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "page_revisions_number_positive" CHECK("page_revisions"."revision" > 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `page_revisions_number_unique` ON `page_revisions` (`page_id`,`revision`);--> statement-breakpoint
CREATE INDEX `page_revisions_page_created_idx` ON `page_revisions` (`page_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `pages` (
	`id` text PRIMARY KEY NOT NULL,
	`slug` text NOT NULL,
	`module_key` text,
	`kind` text DEFAULT 'standard' NOT NULL,
	`draft_revision_id` text NOT NULL,
	`published_revision_id` text,
	`publication_state` text DEFAULT 'draft' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`published_at` text,
	CONSTRAINT "pages_slug_normalized" CHECK("pages"."slug" = lower(trim("pages"."slug"))),
	CONSTRAINT "pages_slug_no_slash" CHECK(instr("pages"."slug", '/') = 0),
	CONSTRAINT "pages_kind_valid" CHECK("pages"."kind" in ('standard', 'legal', 'system')),
	CONSTRAINT "pages_publication_state_valid" CHECK("pages"."publication_state" in ('draft', 'published', 'archived'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `pages_slug_unique` ON `pages` (`slug`);--> statement-breakpoint
CREATE INDEX `pages_public_lookup` ON `pages` (`publication_state`,`module_key`,`slug`);--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_audit_events` (
	`id` text PRIMARY KEY NOT NULL,
	`actor_user_id` text,
	`action` text NOT NULL,
	`subject_type` text NOT NULL,
	`subject_id` text NOT NULL,
	`idempotency_key` text,
	`request_fingerprint` text,
	`request_id` text,
	`details_json` text DEFAULT '{}' NOT NULL,
	`result_json` text DEFAULT '{}' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`actor_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "audit_events_details_json_valid" CHECK(json_valid("__new_audit_events"."details_json")),
	CONSTRAINT "audit_events_result_json_valid" CHECK(json_valid("__new_audit_events"."result_json"))
);
--> statement-breakpoint
INSERT INTO `__new_audit_events`("id", "actor_user_id", "action", "subject_type", "subject_id", "idempotency_key", "request_fingerprint", "request_id", "details_json", "result_json", "created_at") SELECT "id", "actor_user_id", "action", "subject_type", "subject_id", "idempotency_key", NULL, "request_id", "details_json", '{}', "created_at" FROM `audit_events`;--> statement-breakpoint
DROP TABLE `audit_events`;--> statement-breakpoint
ALTER TABLE `__new_audit_events` RENAME TO `audit_events`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `audit_events_subject_idx` ON `audit_events` (`subject_type`,`subject_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `audit_events_actor_idx` ON `audit_events` (`actor_user_id`,`created_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `audit_events_idempotency_key_unique` ON `audit_events` (`idempotency_key`);--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_role_assignments` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`role_key` text NOT NULL,
	`assigned_by_user_id` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`revoked_at` text,
	`revoked_by_user_id` text,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`role_key`) REFERENCES `roles`(`key`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`assigned_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`revoked_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
INSERT INTO `__new_role_assignments`("id", "user_id", "role_key", "assigned_by_user_id", "created_at", "updated_at", "revoked_at", "revoked_by_user_id") SELECT "id", "user_id", "role_key", "assigned_by_user_id", "created_at", "created_at", "revoked_at", NULL FROM `role_assignments`;--> statement-breakpoint
DROP TABLE `role_assignments`;--> statement-breakpoint
ALTER TABLE `__new_role_assignments` RENAME TO `role_assignments`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `role_assignments_user_role_unique` ON `role_assignments` (`user_id`,`role_key`);--> statement-breakpoint
CREATE INDEX `role_assignments_active_lookup` ON `role_assignments` (`user_id`,`revoked_at`);--> statement-breakpoint
INSERT INTO `installation_state` (`id`, `status`, `schema_version`) VALUES ('installation', 'pending', 2);--> statement-breakpoint
INSERT INTO `artist_config` (`id`, `draft_revision_id`, `published_revision_id`, `version`, `published_at`) VALUES ('artist', 'artist_revision_1', 'artist_revision_1', 1, CURRENT_TIMESTAMP);--> statement-breakpoint
INSERT INTO `artist_config_revisions` (`id`, `artist_config_id`, `revision`, `display_name`, `site_title`, `headline`, `introduction`, `footer_text`) VALUES (
	'artist_revision_1',
	'artist',
	1,
	'a-op',
	'a-op: artist-owned platform',
	'Music first.',
	'A neutral installation for a musician to publish and operate through their own site.',
	'Artists retain ownership of their music, images, writing, video, course material, code, and business data.'
);--> statement-breakpoint
INSERT INTO `artist_modules` (`module_key`, `active`) VALUES ('downloads', 0);--> statement-breakpoint
INSERT INTO `artist_modules` (`module_key`, `active`) VALUES ('customer-library', 0);--> statement-breakpoint
INSERT INTO `artist_modules` (`module_key`, `active`) VALUES ('licensing', 0);--> statement-breakpoint
INSERT INTO `artist_modules` (`module_key`, `active`) VALUES ('memberships', 0);--> statement-breakpoint
INSERT INTO `artist_modules` (`module_key`, `active`) VALUES ('subscriptions', 0);--> statement-breakpoint
INSERT INTO `artist_modules` (`module_key`, `active`) VALUES ('courses', 0);--> statement-breakpoint
INSERT INTO `artist_modules` (`module_key`, `active`) VALUES ('video', 0);--> statement-breakpoint
INSERT INTO `artist_modules` (`module_key`, `active`) VALUES ('whats-new', 0);--> statement-breakpoint
INSERT INTO `artist_modules` (`module_key`, `active`) VALUES ('contact', 0);--> statement-breakpoint
INSERT INTO `artist_modules` (`module_key`, `active`) VALUES ('telemetry', 0);--> statement-breakpoint
INSERT INTO `navigation_sets` (`id`, `label`, `draft_version`, `published_version`, `published_at`) VALUES ('primary', 'Primary navigation', 1, 1, CURRENT_TIMESTAMP);--> statement-breakpoint
INSERT INTO `navigation_sets` (`id`, `label`, `draft_version`, `published_version`, `published_at`) VALUES ('footer', 'Footer navigation', 1, 1, CURRENT_TIMESTAMP);--> statement-breakpoint
INSERT INTO `navigation_items` (`id`, `navigation_set_id`, `version`, `item_key`, `label`, `href`, `position`) VALUES ('nav_primary_1_music', 'primary', 1, 'music', 'Music', '/music', 0);--> statement-breakpoint
INSERT INTO `navigation_items` (`id`, `navigation_set_id`, `version`, `item_key`, `label`, `href`, `position`) VALUES ('nav_primary_1_about', 'primary', 1, 'about', 'About', '/about', 1);--> statement-breakpoint
INSERT INTO `navigation_items` (`id`, `navigation_set_id`, `version`, `item_key`, `label`, `href`, `position`, `module_key`) VALUES ('nav_primary_1_courses', 'primary', 1, 'courses', 'Courses', '/courses', 2, 'courses');--> statement-breakpoint
INSERT INTO `navigation_items` (`id`, `navigation_set_id`, `version`, `item_key`, `label`, `href`, `position`, `module_key`) VALUES ('nav_primary_1_videos', 'primary', 1, 'videos', 'Videos', '/videos', 3, 'video');--> statement-breakpoint
INSERT INTO `navigation_items` (`id`, `navigation_set_id`, `version`, `item_key`, `label`, `href`, `position`, `module_key`) VALUES ('nav_primary_1_membership', 'primary', 1, 'membership', 'Membership', '/membership', 4, 'memberships');--> statement-breakpoint
INSERT INTO `navigation_items` (`id`, `navigation_set_id`, `version`, `item_key`, `label`, `href`, `position`, `module_key`) VALUES ('nav_primary_1_licensing', 'primary', 1, 'licensing', 'Licensing', '/licensing', 5, 'licensing');--> statement-breakpoint
INSERT INTO `navigation_items` (`id`, `navigation_set_id`, `version`, `item_key`, `label`, `href`, `position`, `module_key`) VALUES ('nav_primary_1_contact', 'primary', 1, 'contact', 'Contact', '/contact', 6, 'contact');--> statement-breakpoint
INSERT INTO `navigation_items` (`id`, `navigation_set_id`, `version`, `item_key`, `label`, `href`, `position`, `module_key`) VALUES ('nav_primary_1_whats_new', 'primary', 1, 'whats-new', 'What''s New', '/whats-new', 7, 'whats-new');--> statement-breakpoint
INSERT INTO `navigation_items` (`id`, `navigation_set_id`, `version`, `item_key`, `label`, `href`, `position`) VALUES ('nav_footer_1_privacy', 'footer', 1, 'privacy', 'Privacy', '/privacy', 0);--> statement-breakpoint
INSERT INTO `navigation_items` (`id`, `navigation_set_id`, `version`, `item_key`, `label`, `href`, `position`) VALUES ('nav_footer_1_terms', 'footer', 1, 'terms', 'Terms', '/terms', 1);--> statement-breakpoint
INSERT INTO `navigation_items` (`id`, `navigation_set_id`, `version`, `item_key`, `label`, `href`, `position`) VALUES ('nav_footer_1_faq', 'footer', 1, 'faq', 'FAQ', '/faq', 2);--> statement-breakpoint
INSERT INTO `navigation_items` (`id`, `navigation_set_id`, `version`, `item_key`, `label`, `href`, `position`, `external`) VALUES ('nav_footer_1_repository', 'footer', 1, 'repository', 'GitHub repository', 'https://github.com/sunflower-of-parchman/a-op', 3, 1);--> statement-breakpoint
INSERT INTO `pages` (`id`, `slug`, `kind`, `draft_revision_id`, `published_revision_id`, `publication_state`, `published_at`) VALUES ('page_music', 'music', 'system', 'page_music_revision_1', 'page_music_revision_1', 'published', CURRENT_TIMESTAMP);--> statement-breakpoint
INSERT INTO `pages` (`id`, `slug`, `kind`, `draft_revision_id`, `published_revision_id`, `publication_state`, `published_at`) VALUES ('page_about', 'about', 'standard', 'page_about_revision_1', 'page_about_revision_1', 'published', CURRENT_TIMESTAMP);--> statement-breakpoint
INSERT INTO `pages` (`id`, `slug`, `kind`, `draft_revision_id`, `published_revision_id`, `publication_state`, `published_at`) VALUES ('page_privacy', 'privacy', 'legal', 'page_privacy_revision_1', 'page_privacy_revision_1', 'published', CURRENT_TIMESTAMP);--> statement-breakpoint
INSERT INTO `pages` (`id`, `slug`, `kind`, `draft_revision_id`, `published_revision_id`, `publication_state`, `published_at`) VALUES ('page_terms', 'terms', 'legal', 'page_terms_revision_1', 'page_terms_revision_1', 'published', CURRENT_TIMESTAMP);--> statement-breakpoint
INSERT INTO `pages` (`id`, `slug`, `kind`, `draft_revision_id`, `published_revision_id`, `publication_state`, `published_at`) VALUES ('page_faq', 'faq', 'standard', 'page_faq_revision_1', 'page_faq_revision_1', 'published', CURRENT_TIMESTAMP);--> statement-breakpoint
INSERT INTO `pages` (`id`, `slug`, `module_key`, `kind`, `draft_revision_id`, `published_revision_id`, `publication_state`, `published_at`) VALUES ('page_courses', 'courses', 'courses', 'standard', 'page_courses_revision_1', 'page_courses_revision_1', 'published', CURRENT_TIMESTAMP);--> statement-breakpoint
INSERT INTO `pages` (`id`, `slug`, `module_key`, `kind`, `draft_revision_id`, `published_revision_id`, `publication_state`, `published_at`) VALUES ('page_videos', 'videos', 'video', 'standard', 'page_videos_revision_1', 'page_videos_revision_1', 'published', CURRENT_TIMESTAMP);--> statement-breakpoint
INSERT INTO `pages` (`id`, `slug`, `module_key`, `kind`, `draft_revision_id`, `published_revision_id`, `publication_state`, `published_at`) VALUES ('page_membership', 'membership', 'memberships', 'standard', 'page_membership_revision_1', 'page_membership_revision_1', 'published', CURRENT_TIMESTAMP);--> statement-breakpoint
INSERT INTO `pages` (`id`, `slug`, `module_key`, `kind`, `draft_revision_id`, `published_revision_id`, `publication_state`, `published_at`) VALUES ('page_licensing', 'licensing', 'licensing', 'standard', 'page_licensing_revision_1', 'page_licensing_revision_1', 'published', CURRENT_TIMESTAMP);--> statement-breakpoint
INSERT INTO `pages` (`id`, `slug`, `module_key`, `kind`, `draft_revision_id`, `published_revision_id`, `publication_state`, `published_at`) VALUES ('page_contact', 'contact', 'contact', 'standard', 'page_contact_revision_1', 'page_contact_revision_1', 'published', CURRENT_TIMESTAMP);--> statement-breakpoint
INSERT INTO `pages` (`id`, `slug`, `module_key`, `kind`, `draft_revision_id`, `published_revision_id`, `publication_state`, `published_at`) VALUES ('page_whats_new', 'whats-new', 'whats-new', 'standard', 'page_whats_new_revision_1', 'page_whats_new_revision_1', 'published', CURRENT_TIMESTAMP);--> statement-breakpoint
INSERT INTO `page_revisions` (`id`, `page_id`, `revision`, `title`, `introduction`, `body_text`) VALUES ('page_music_revision_1', 'page_music', 1, 'Music', 'Releases, tracks, collections, artwork, credits, and streaming live at the center of the site.', 'This neutral installation is ready for the artist''s approved catalog and media.');--> statement-breakpoint
INSERT INTO `page_revisions` (`id`, `page_id`, `revision`, `title`, `introduction`, `body_text`) VALUES ('page_about_revision_1', 'page_about', 1, 'About', 'a-op is an open-source web application for musicians who want to publish and operate their work through their own site.', 'A fresh installation begins with music, streaming, identity, access, and administration. The artist activates other connected capabilities when they need them.');--> statement-breakpoint
INSERT INTO `page_revisions` (`id`, `page_id`, `revision`, `title`, `introduction`, `body_text`) VALUES ('page_privacy_revision_1', 'page_privacy', 1, 'Privacy', 'This installation includes an editable Privacy Policy starter for the artist to review, revise, approve, and publish.', 'The final policy describes the artist''s actual data collection, contact forms, accounts, access, telemetry, services, and retention choices.');--> statement-breakpoint
INSERT INTO `page_revisions` (`id`, `page_id`, `revision`, `title`, `introduction`, `body_text`) VALUES ('page_terms_revision_1', 'page_terms', 1, 'Terms and Conditions', 'This installation includes an editable Terms and Conditions starter for the artist to review, revise, approve, and publish.', 'The artist remains the authority for access plans, memberships, subscriptions, licensing terms, downloads, Courses, and customer policies.');--> statement-breakpoint
INSERT INTO `page_revisions` (`id`, `page_id`, `revision`, `title`, `introduction`, `body_text`) VALUES ('page_faq_revision_1', 'page_faq', 1, 'FAQ', 'Answers about listening, accounts, access, downloads, memberships, subscriptions, Courses, and licensing live here.', 'Each artist replaces these neutral placeholders with the information their visitors and customers need.');--> statement-breakpoint
INSERT INTO `page_revisions` (`id`, `page_id`, `revision`, `title`, `introduction`, `body_text`) VALUES ('page_courses_revision_1', 'page_courses', 1, 'Courses', 'Publish ordered Courses made from lessons, writing, audio, video, images, and downloads.', 'Each lesson can be public, account-based, or available through an artist-controlled access grant, membership, subscription, or license.');--> statement-breakpoint
INSERT INTO `page_revisions` (`id`, `page_id`, `revision`, `title`, `introduction`, `body_text`) VALUES ('page_videos_revision_1', 'page_videos', 1, 'Videos', 'Share video with artist context, credits, transcripts, and privacy-aware playback.', 'Artists control drafts, previews, publication, revisions, and whether media is hosted by the site or loaded from an approved external source.');--> statement-breakpoint
INSERT INTO `page_revisions` (`id`, `page_id`, `revision`, `title`, `introduction`, `body_text`) VALUES ('page_membership_revision_1', 'page_membership', 1, 'Membership', 'Define recurring access, benefits, renewal dates, cancellations, download credits, and license credits.', 'Customers can see their current access and history. Artists manage plans and durable access through administration.');--> statement-breakpoint
INSERT INTO `page_revisions` (`id`, `page_id`, `revision`, `title`, `introduction`, `body_text`) VALUES ('page_licensing_revision_1', 'page_licensing', 1, 'Licensing', 'Create artist-defined licensing options for specific tracks and supported uses.', 'The workflow records the selected music, intended use, customer, terms version, approval or credit source, issued license, and delivery history.');--> statement-breakpoint
INSERT INTO `page_revisions` (`id`, `page_id`, `revision`, `title`, `introduction`, `body_text`) VALUES ('page_contact_revision_1', 'page_contact', 1, 'Contact', 'Receive general messages, booking requests, teaching questions, support requests, and licensing inquiries.', 'Every submission records the sender''s consent to the artist''s current language and remains available in administration.');--> statement-breakpoint
INSERT INTO `page_revisions` (`id`, `page_id`, `revision`, `title`, `introduction`, `body_text`) VALUES ('page_whats_new_revision_1', 'page_whats_new', 1, 'What''s New', 'Publish updates that lead directly to new music, releases, Courses, videos, licenses, memberships, and subscriptions.', 'Signed-in customers receive an unread indicator, and the application remembers which updates they have read.');
