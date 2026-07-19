CREATE TABLE `contact_consent_versions` (
	`id` text PRIMARY KEY NOT NULL,
	`contact_form_id` text NOT NULL,
	`version` integer NOT NULL,
	`consent_text` text NOT NULL,
	`approved_by_user_id` text,
	`effective_at` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`contact_form_id`) REFERENCES `contact_forms`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`approved_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "contact_consent_versions_number_positive" CHECK("contact_consent_versions"."version" > 0),
	CONSTRAINT "contact_consent_versions_text_present" CHECK(length(trim("contact_consent_versions"."consent_text")) > 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `contact_consent_versions_form_number_unique` ON `contact_consent_versions` (`contact_form_id`,`version`);--> statement-breakpoint
CREATE UNIQUE INDEX `contact_consent_versions_identity_form_unique` ON `contact_consent_versions` (`id`,`contact_form_id`);--> statement-breakpoint
CREATE TABLE `contact_forms` (
	`id` text PRIMARY KEY NOT NULL,
	`form_key` text NOT NULL,
	`title` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`categories_json` text DEFAULT '[]' NOT NULL,
	`state` text DEFAULT 'active' NOT NULL,
	`current_consent_version` integer NOT NULL,
	`delivery_adapter` text DEFAULT 'stored_only' NOT NULL,
	`revision` integer DEFAULT 1 NOT NULL,
	`last_operation_key` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	CONSTRAINT "contact_forms_key_normalized" CHECK("contact_forms"."form_key" = lower(trim("contact_forms"."form_key")) and instr("contact_forms"."form_key", '/') = 0),
	CONSTRAINT "contact_forms_categories_json_valid" CHECK(json_valid("contact_forms"."categories_json") and json_type("contact_forms"."categories_json") = 'array'),
	CONSTRAINT "contact_forms_state_valid" CHECK("contact_forms"."state" in ('active', 'disabled')),
	CONSTRAINT "contact_forms_consent_version_positive" CHECK("contact_forms"."current_consent_version" > 0),
	CONSTRAINT "contact_forms_adapter_valid" CHECK("contact_forms"."delivery_adapter" = 'stored_only'),
	CONSTRAINT "contact_forms_revision_positive" CHECK("contact_forms"."revision" > 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `contact_forms_key_unique` ON `contact_forms` (`form_key`);--> statement-breakpoint
CREATE TABLE `contact_notes` (
	`id` text PRIMARY KEY NOT NULL,
	`contact_submission_id` text NOT NULL,
	`author_user_id` text NOT NULL,
	`body` text NOT NULL,
	`last_operation_key` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`contact_submission_id`) REFERENCES `contact_submissions`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`author_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "contact_notes_body_length_valid" CHECK(length(trim("contact_notes"."body")) between 1 and 4000)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `contact_notes_operation_unique` ON `contact_notes` (`last_operation_key`);--> statement-breakpoint
CREATE INDEX `contact_notes_submission_created_idx` ON `contact_notes` (`contact_submission_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `contact_submissions` (
	`id` text PRIMARY KEY NOT NULL,
	`contact_form_id` text NOT NULL,
	`consent_version_id` text NOT NULL,
	`submitter_user_id` text,
	`name` text NOT NULL,
	`email` text NOT NULL,
	`normalized_email` text NOT NULL,
	`category` text NOT NULL,
	`subject` text NOT NULL,
	`message` text NOT NULL,
	`state` text DEFAULT 'new' NOT NULL,
	`request_id` text NOT NULL,
	`consented_at` text NOT NULL,
	`revision` integer DEFAULT 1 NOT NULL,
	`last_operation_key` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`submitter_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`consent_version_id`,`contact_form_id`) REFERENCES `contact_consent_versions`(`id`,`contact_form_id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "contact_submissions_email_normalized" CHECK("contact_submissions"."normalized_email" = lower(trim("contact_submissions"."email"))),
	CONSTRAINT "contact_submissions_text_length_valid" CHECK(length(trim("contact_submissions"."name")) between 1 and 160 and length(trim("contact_submissions"."email")) between 3 and 320 and length(trim("contact_submissions"."category")) between 1 and 80 and length(trim("contact_submissions"."subject")) between 1 and 240 and length(trim("contact_submissions"."message")) between 1 and 12000),
	CONSTRAINT "contact_submissions_state_valid" CHECK("contact_submissions"."state" in ('new', 'in_progress', 'resolved', 'archived')),
	CONSTRAINT "contact_submissions_revision_positive" CHECK("contact_submissions"."revision" > 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `contact_submissions_request_unique` ON `contact_submissions` (`request_id`);--> statement-breakpoint
CREATE INDEX `contact_submissions_state_created_idx` ON `contact_submissions` (`state`,`created_at`);--> statement-breakpoint
CREATE INDEX `contact_submissions_email_created_idx` ON `contact_submissions` (`normalized_email`,`created_at`);--> statement-breakpoint
CREATE TABLE `course_progress` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`course_id` text NOT NULL,
	`lesson_key` text NOT NULL,
	`state` text DEFAULT 'in_progress' NOT NULL,
	`completed_item_keys_json` text DEFAULT '[]' NOT NULL,
	`last_item_key` text,
	`started_at` text NOT NULL,
	`completed_at` text,
	`revision` integer DEFAULT 1 NOT NULL,
	`last_operation_key` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`course_id`) REFERENCES `courses`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "course_progress_lesson_key_normalized" CHECK("course_progress"."lesson_key" = lower(trim("course_progress"."lesson_key")) and instr("course_progress"."lesson_key", '/') = 0),
	CONSTRAINT "course_progress_state_valid" CHECK("course_progress"."state" in ('in_progress', 'completed')),
	CONSTRAINT "course_progress_items_json_valid" CHECK(json_valid("course_progress"."completed_item_keys_json") and json_type("course_progress"."completed_item_keys_json") = 'array'),
	CONSTRAINT "course_progress_completion_valid" CHECK(("course_progress"."state" = 'in_progress' and "course_progress"."completed_at" is null) or ("course_progress"."state" = 'completed' and "course_progress"."completed_at" is not null)),
	CONSTRAINT "course_progress_revision_positive" CHECK("course_progress"."revision" > 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `course_progress_user_lesson_unique` ON `course_progress` (`user_id`,`course_id`,`lesson_key`);--> statement-breakpoint
CREATE INDEX `course_progress_user_updated_idx` ON `course_progress` (`user_id`,`updated_at`);--> statement-breakpoint
CREATE TABLE `course_revisions` (
	`id` text PRIMARY KEY NOT NULL,
	`course_id` text NOT NULL,
	`revision` integer NOT NULL,
	`title` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`access_mode` text DEFAULT 'public' NOT NULL,
	`access_plan_id` text,
	`access_plan_revision` integer,
	`estimated_minutes` integer,
	`created_by_user_id` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`course_id`) REFERENCES `courses`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`access_plan_id`) REFERENCES `access_plans`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`created_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "course_revisions_number_positive" CHECK("course_revisions"."revision" > 0),
	CONSTRAINT "course_revisions_access_mode_valid" CHECK("course_revisions"."access_mode" in ('public', 'account', 'protected')),
	CONSTRAINT "course_revisions_access_plan_valid" CHECK(("course_revisions"."access_plan_id" is null and "course_revisions"."access_plan_revision" is null) or ("course_revisions"."access_mode" = 'protected' and "course_revisions"."access_plan_id" is not null and "course_revisions"."access_plan_revision" > 0)),
	CONSTRAINT "course_revisions_estimate_positive" CHECK("course_revisions"."estimated_minutes" is null or "course_revisions"."estimated_minutes" > 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `course_revisions_number_unique` ON `course_revisions` (`course_id`,`revision`);--> statement-breakpoint
CREATE UNIQUE INDEX `course_revisions_identity_course_unique` ON `course_revisions` (`id`,`course_id`);--> statement-breakpoint
CREATE TABLE `course_sections` (
	`id` text PRIMARY KEY NOT NULL,
	`course_revision_id` text NOT NULL,
	`section_key` text NOT NULL,
	`position` integer NOT NULL,
	`title` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`course_revision_id`) REFERENCES `course_revisions`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "course_sections_key_normalized" CHECK("course_sections"."section_key" = lower(trim("course_sections"."section_key")) and instr("course_sections"."section_key", '/') = 0),
	CONSTRAINT "course_sections_position_positive" CHECK("course_sections"."position" > 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `course_sections_revision_key_unique` ON `course_sections` (`course_revision_id`,`section_key`);--> statement-breakpoint
CREATE UNIQUE INDEX `course_sections_revision_position_unique` ON `course_sections` (`course_revision_id`,`position`);--> statement-breakpoint
CREATE UNIQUE INDEX `course_sections_identity_revision_unique` ON `course_sections` (`id`,`course_revision_id`);--> statement-breakpoint
CREATE TABLE `courses` (
	`id` text PRIMARY KEY NOT NULL,
	`slug` text NOT NULL,
	`draft_revision_id` text NOT NULL,
	`published_revision_id` text,
	`publication_state` text DEFAULT 'draft' NOT NULL,
	`revision` integer DEFAULT 1 NOT NULL,
	`last_operation_key` text,
	`published_at` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	CONSTRAINT "courses_slug_normalized" CHECK("courses"."slug" = lower(trim("courses"."slug")) and instr("courses"."slug", '/') = 0),
	CONSTRAINT "courses_publication_state_valid" CHECK("courses"."publication_state" in ('draft', 'published', 'archived')),
	CONSTRAINT "courses_publication_fields_valid" CHECK(("courses"."publication_state" = 'published' and "courses"."published_revision_id" is not null and "courses"."published_at" is not null) or ("courses"."publication_state" <> 'published')),
	CONSTRAINT "courses_revision_positive" CHECK("courses"."revision" > 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `courses_slug_unique` ON `courses` (`slug`);--> statement-breakpoint
CREATE INDEX `courses_publication_lookup` ON `courses` (`publication_state`,`slug`);--> statement-breakpoint
CREATE TABLE `editorial_posts` (
	`id` text PRIMARY KEY NOT NULL,
	`slug` text NOT NULL,
	`title` text NOT NULL,
	`excerpt` text DEFAULT '' NOT NULL,
	`body_json` text DEFAULT '[]' NOT NULL,
	`state` text DEFAULT 'draft' NOT NULL,
	`published_at` text,
	`revision` integer DEFAULT 1 NOT NULL,
	`last_operation_key` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	CONSTRAINT "editorial_posts_slug_normalized" CHECK("editorial_posts"."slug" = lower(trim("editorial_posts"."slug")) and instr("editorial_posts"."slug", '/') = 0),
	CONSTRAINT "editorial_posts_body_json_valid" CHECK(json_valid("editorial_posts"."body_json") and json_type("editorial_posts"."body_json") = 'array'),
	CONSTRAINT "editorial_posts_state_valid" CHECK("editorial_posts"."state" in ('draft', 'published', 'archived')),
	CONSTRAINT "editorial_posts_publication_valid" CHECK(("editorial_posts"."state" = 'published' and "editorial_posts"."published_at" is not null) or ("editorial_posts"."state" <> 'published')),
	CONSTRAINT "editorial_posts_revision_positive" CHECK("editorial_posts"."revision" > 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `editorial_posts_slug_unique` ON `editorial_posts` (`slug`);--> statement-breakpoint
CREATE INDEX `editorial_posts_state_published_idx` ON `editorial_posts` (`state`,`published_at`);--> statement-breakpoint
CREATE TABLE `lesson_items` (
	`id` text PRIMARY KEY NOT NULL,
	`lesson_id` text NOT NULL,
	`item_key` text NOT NULL,
	`position` integer NOT NULL,
	`item_type` text NOT NULL,
	`content_json` text DEFAULT '{}' NOT NULL,
	`media_derivative_id` text,
	`alt_text` text,
	`transcript_text` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`lesson_id`) REFERENCES `lessons`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`media_derivative_id`) REFERENCES `media_derivatives`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "lesson_items_key_normalized" CHECK("lesson_items"."item_key" = lower(trim("lesson_items"."item_key")) and instr("lesson_items"."item_key", '/') = 0),
	CONSTRAINT "lesson_items_position_positive" CHECK("lesson_items"."position" > 0),
	CONSTRAINT "lesson_items_type_valid" CHECK("lesson_items"."item_type" in ('text', 'prompt', 'image', 'audio', 'video', 'download')),
	CONSTRAINT "lesson_items_content_json_valid" CHECK(json_valid("lesson_items"."content_json") and json_type("lesson_items"."content_json") = 'object'),
	CONSTRAINT "lesson_items_media_valid" CHECK(("lesson_items"."item_type" in ('text', 'prompt') and "lesson_items"."media_derivative_id" is null) or ("lesson_items"."item_type" in ('image', 'audio', 'video', 'download') and "lesson_items"."media_derivative_id" is not null))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `lesson_items_lesson_key_unique` ON `lesson_items` (`lesson_id`,`item_key`);--> statement-breakpoint
CREATE UNIQUE INDEX `lesson_items_lesson_position_unique` ON `lesson_items` (`lesson_id`,`position`);--> statement-breakpoint
CREATE TABLE `lessons` (
	`id` text PRIMARY KEY NOT NULL,
	`course_revision_id` text NOT NULL,
	`course_section_id` text NOT NULL,
	`lesson_key` text NOT NULL,
	`slug` text NOT NULL,
	`position` integer NOT NULL,
	`title` text NOT NULL,
	`summary` text DEFAULT '' NOT NULL,
	`access_mode` text DEFAULT 'inherit' NOT NULL,
	`estimated_minutes` integer,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`course_section_id`,`course_revision_id`) REFERENCES `course_sections`(`id`,`course_revision_id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "lessons_key_normalized" CHECK("lessons"."lesson_key" = lower(trim("lessons"."lesson_key")) and instr("lessons"."lesson_key", '/') = 0),
	CONSTRAINT "lessons_slug_normalized" CHECK("lessons"."slug" = lower(trim("lessons"."slug")) and instr("lessons"."slug", '/') = 0),
	CONSTRAINT "lessons_position_positive" CHECK("lessons"."position" > 0),
	CONSTRAINT "lessons_access_mode_valid" CHECK("lessons"."access_mode" in ('inherit', 'public', 'account', 'protected')),
	CONSTRAINT "lessons_estimate_positive" CHECK("lessons"."estimated_minutes" is null or "lessons"."estimated_minutes" > 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `lessons_revision_key_unique` ON `lessons` (`course_revision_id`,`lesson_key`);--> statement-breakpoint
CREATE UNIQUE INDEX `lessons_revision_slug_unique` ON `lessons` (`course_revision_id`,`slug`);--> statement-breakpoint
CREATE UNIQUE INDEX `lessons_section_position_unique` ON `lessons` (`course_section_id`,`position`);--> statement-breakpoint
CREATE UNIQUE INDEX `lessons_identity_revision_unique` ON `lessons` (`id`,`course_revision_id`);--> statement-breakpoint
CREATE TABLE `update_reads` (
	`id` text PRIMARY KEY NOT NULL,
	`update_id` text NOT NULL,
	`user_id` text NOT NULL,
	`read_at` text NOT NULL,
	`last_operation_key` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`update_id`) REFERENCES `updates`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `update_reads_update_user_unique` ON `update_reads` (`update_id`,`user_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `update_reads_operation_unique` ON `update_reads` (`last_operation_key`);--> statement-breakpoint
CREATE INDEX `update_reads_user_read_idx` ON `update_reads` (`user_id`,`read_at`);--> statement-breakpoint
CREATE TABLE `updates` (
	`id` text PRIMARY KEY NOT NULL,
	`slug` text NOT NULL,
	`title` text NOT NULL,
	`summary` text DEFAULT '' NOT NULL,
	`body_json` text DEFAULT '[]' NOT NULL,
	`audience` text DEFAULT 'public' NOT NULL,
	`resource_type` text,
	`resource_id` text,
	`state` text DEFAULT 'draft' NOT NULL,
	`published_at` text,
	`revision` integer DEFAULT 1 NOT NULL,
	`last_operation_key` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	CONSTRAINT "updates_slug_normalized" CHECK("updates"."slug" = lower(trim("updates"."slug")) and instr("updates"."slug", '/') = 0),
	CONSTRAINT "updates_body_json_valid" CHECK(json_valid("updates"."body_json") and json_type("updates"."body_json") = 'array'),
	CONSTRAINT "updates_audience_valid" CHECK("updates"."audience" in ('public', 'account')),
	CONSTRAINT "updates_resource_valid" CHECK(("updates"."resource_type" is null and "updates"."resource_id" is null) or ("updates"."resource_type" in ('track', 'release', 'collection', 'course', 'video', 'page') and "updates"."resource_id" is not null)),
	CONSTRAINT "updates_state_valid" CHECK("updates"."state" in ('draft', 'published', 'archived')),
	CONSTRAINT "updates_publication_valid" CHECK(("updates"."state" = 'published' and "updates"."published_at" is not null) or ("updates"."state" <> 'published')),
	CONSTRAINT "updates_revision_positive" CHECK("updates"."revision" > 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `updates_slug_unique` ON `updates` (`slug`);--> statement-breakpoint
CREATE INDEX `updates_state_published_idx` ON `updates` (`state`,`published_at`);--> statement-breakpoint
CREATE TABLE `video_revisions` (
	`id` text PRIMARY KEY NOT NULL,
	`video_id` text NOT NULL,
	`revision` integer NOT NULL,
	`title` text NOT NULL,
	`summary` text DEFAULT '' NOT NULL,
	`artist_context` text DEFAULT '' NOT NULL,
	`credits_json` text DEFAULT '[]' NOT NULL,
	`delivery_kind` text NOT NULL,
	`poster_derivative_id` text,
	`hosted_derivative_id` text,
	`external_provider` text,
	`external_embed_url` text,
	`created_by_user_id` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`video_id`) REFERENCES `videos`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`poster_derivative_id`) REFERENCES `media_derivatives`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`hosted_derivative_id`) REFERENCES `media_derivatives`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`created_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "video_revisions_number_positive" CHECK("video_revisions"."revision" > 0),
	CONSTRAINT "video_revisions_credits_json_valid" CHECK(json_valid("video_revisions"."credits_json") and json_type("video_revisions"."credits_json") = 'array'),
	CONSTRAINT "video_revisions_delivery_kind_valid" CHECK("video_revisions"."delivery_kind" in ('artist_hosted', 'external')),
	CONSTRAINT "video_revisions_delivery_fields_valid" CHECK(("video_revisions"."delivery_kind" = 'artist_hosted' and "video_revisions"."hosted_derivative_id" is not null and "video_revisions"."external_provider" is null and "video_revisions"."external_embed_url" is null) or ("video_revisions"."delivery_kind" = 'external' and "video_revisions"."hosted_derivative_id" is null and "video_revisions"."external_provider" is not null and "video_revisions"."external_embed_url" is not null)),
	CONSTRAINT "video_revisions_external_provider_valid" CHECK("video_revisions"."external_provider" is null or "video_revisions"."external_provider" in ('youtube', 'vimeo', 'other')),
	CONSTRAINT "video_revisions_external_url_valid" CHECK("video_revisions"."external_embed_url" is null or "video_revisions"."external_embed_url" glob 'https://*')
);
--> statement-breakpoint
CREATE UNIQUE INDEX `video_revisions_number_unique` ON `video_revisions` (`video_id`,`revision`);--> statement-breakpoint
CREATE UNIQUE INDEX `video_revisions_identity_video_unique` ON `video_revisions` (`id`,`video_id`);--> statement-breakpoint
CREATE TABLE `video_transcripts` (
	`id` text PRIMARY KEY NOT NULL,
	`video_revision_id` text NOT NULL,
	`language` text DEFAULT 'en' NOT NULL,
	`transcript_text` text NOT NULL,
	`captions_derivative_id` text,
	`revision` integer DEFAULT 1 NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`video_revision_id`) REFERENCES `video_revisions`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`captions_derivative_id`) REFERENCES `media_derivatives`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "video_transcripts_language_normalized" CHECK("video_transcripts"."language" = lower(trim("video_transcripts"."language")) and length("video_transcripts"."language") between 2 and 16),
	CONSTRAINT "video_transcripts_text_present" CHECK(length(trim("video_transcripts"."transcript_text")) > 0),
	CONSTRAINT "video_transcripts_revision_positive" CHECK("video_transcripts"."revision" > 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `video_transcripts_revision_language_unique` ON `video_transcripts` (`video_revision_id`,`language`);--> statement-breakpoint
CREATE TABLE `videos` (
	`id` text PRIMARY KEY NOT NULL,
	`slug` text NOT NULL,
	`draft_revision_id` text NOT NULL,
	`published_revision_id` text,
	`publication_state` text DEFAULT 'draft' NOT NULL,
	`revision` integer DEFAULT 1 NOT NULL,
	`last_operation_key` text,
	`published_at` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	CONSTRAINT "videos_slug_normalized" CHECK("videos"."slug" = lower(trim("videos"."slug")) and instr("videos"."slug", '/') = 0),
	CONSTRAINT "videos_publication_state_valid" CHECK("videos"."publication_state" in ('draft', 'published', 'archived')),
	CONSTRAINT "videos_publication_fields_valid" CHECK(("videos"."publication_state" = 'published' and "videos"."published_revision_id" is not null and "videos"."published_at" is not null) or ("videos"."publication_state" <> 'published')),
	CONSTRAINT "videos_revision_positive" CHECK("videos"."revision" > 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `videos_slug_unique` ON `videos` (`slug`);--> statement-breakpoint
CREATE INDEX `videos_publication_lookup` ON `videos` (`publication_state`,`slug`);--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_installation_state` (
	`id` text PRIMARY KEY NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`owner_user_id` text,
	`schema_version` integer DEFAULT 10 NOT NULL,
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
UPDATE `installation_state`
SET `schema_version` = 10,
    `updated_at` = CURRENT_TIMESTAMP
WHERE `id` = 'installation' AND `schema_version` = 9;--> statement-breakpoint
UPDATE `artist_config_revisions`
SET `footer_text` = 'Artists retain ownership of their music, images, writing, video, course material, artist-authored code and source changes, and business data.'
WHERE `id` = 'artist_revision_1'
  AND `artist_config_id` = 'artist'
  AND `revision` = 1
  AND `footer_text` = 'Artists retain ownership of their music, images, writing, video, course material, code, and business data.';--> statement-breakpoint
PRAGMA foreign_keys=ON;
