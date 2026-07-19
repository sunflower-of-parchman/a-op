PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_course_revisions` (
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
	CONSTRAINT "course_revisions_number_positive" CHECK("__new_course_revisions"."revision" > 0),
	CONSTRAINT "course_revisions_access_mode_valid" CHECK("__new_course_revisions"."access_mode" in ('public', 'account', 'protected')),
	CONSTRAINT "course_revisions_access_plan_valid" CHECK(("__new_course_revisions"."access_plan_id" is null and "__new_course_revisions"."access_plan_revision" is null) or ("__new_course_revisions"."access_mode" = 'protected' and "__new_course_revisions"."access_plan_id" is not null and "__new_course_revisions"."access_plan_revision" > 0)),
	CONSTRAINT "course_revisions_estimate_positive" CHECK("__new_course_revisions"."estimated_minutes" is null or "__new_course_revisions"."estimated_minutes" > 0)
);
--> statement-breakpoint
INSERT INTO `__new_course_revisions`("id", "course_id", "revision", "title", "description", "access_mode", "access_plan_id", "access_plan_revision", "estimated_minutes", "created_by_user_id", "created_at") SELECT "id", "course_id", "revision", "title", "description", "access_mode", "access_plan_id", "access_plan_revision", "estimated_minutes", "created_by_user_id", "created_at" FROM `course_revisions`;--> statement-breakpoint
DROP TABLE `course_revisions`;--> statement-breakpoint
ALTER TABLE `__new_course_revisions` RENAME TO `course_revisions`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `course_revisions_number_unique` ON `course_revisions` (`course_id`,`revision`);--> statement-breakpoint
CREATE UNIQUE INDEX `course_revisions_identity_course_unique` ON `course_revisions` (`id`,`course_id`);