DROP INDEX `editor_permissions_user_scope_unique`;--> statement-breakpoint
CREATE UNIQUE INDEX `editor_permissions_active_user_scope_unique` ON `editor_permissions` (`user_id`,`permission_key`,`scope_id`) WHERE "editor_permissions"."revoked_at" is null;--> statement-breakpoint
DROP INDEX `role_assignments_user_role_unique`;--> statement-breakpoint
CREATE UNIQUE INDEX `role_assignments_active_user_role_unique` ON `role_assignments` (`user_id`,`role_key`) WHERE "role_assignments"."revoked_at" is null;