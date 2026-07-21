PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_favorites` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`target_type` text NOT NULL,
	`track_id` text,
	`release_id` text,
	`collection_id` text,
	`state` text DEFAULT 'active' NOT NULL,
	`revision` integer DEFAULT 1 NOT NULL,
	`last_operation_key` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`track_id`) REFERENCES `tracks`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`release_id`) REFERENCES `releases`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`collection_id`) REFERENCES `collections`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "favorites_target_type_valid" CHECK("__new_favorites"."target_type" in ('track', 'release', 'collection')),
	CONSTRAINT "favorites_exact_target" CHECK((
        ("__new_favorites"."target_type" = 'track' and "__new_favorites"."track_id" is not null and "__new_favorites"."release_id" is null and "__new_favorites"."collection_id" is null)
        or
        ("__new_favorites"."target_type" = 'release' and "__new_favorites"."release_id" is not null and "__new_favorites"."track_id" is null and "__new_favorites"."collection_id" is null)
        or
        ("__new_favorites"."target_type" = 'collection' and "__new_favorites"."collection_id" is not null and "__new_favorites"."track_id" is null and "__new_favorites"."release_id" is null)
      )),
	CONSTRAINT "favorites_state_valid" CHECK("__new_favorites"."state" in ('active', 'removed')),
	CONSTRAINT "favorites_revision_positive" CHECK("__new_favorites"."revision" > 0)
);
--> statement-breakpoint
INSERT INTO `__new_favorites`("id", "user_id", "target_type", "track_id", "release_id", "collection_id", "state", "revision", "last_operation_key", "created_at", "updated_at") SELECT "id", "user_id", "target_type", "track_id", "release_id", NULL, "state", "revision", "last_operation_key", "created_at", "updated_at" FROM `favorites`;--> statement-breakpoint
DROP TABLE `favorites`;--> statement-breakpoint
ALTER TABLE `__new_favorites` RENAME TO `favorites`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `favorites_user_track_unique` ON `favorites` (`user_id`,`track_id`) WHERE "favorites"."track_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX `favorites_user_release_unique` ON `favorites` (`user_id`,`release_id`) WHERE "favorites"."release_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX `favorites_user_collection_unique` ON `favorites` (`user_id`,`collection_id`) WHERE "favorites"."collection_id" is not null;--> statement-breakpoint
CREATE INDEX `favorites_user_state_updated_idx` ON `favorites` (`user_id`,`state`,`updated_at`);
