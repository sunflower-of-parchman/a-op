WITH `neutral_navigation_items` (
	`id`,
	`navigation_set_id`,
	`set_label`,
	`item_key`,
	`label`,
	`href`,
	`position`,
	`module_key`,
	`external`
) AS (
	VALUES
		('nav_primary_1_music', 'primary', 'Primary navigation', 'music', 'Music', '/music', 0, NULL, 0),
		('nav_primary_1_about', 'primary', 'Primary navigation', 'about', 'About', '/about', 1, NULL, 0),
		('nav_primary_1_courses', 'primary', 'Primary navigation', 'courses', 'Courses', '/courses', 2, 'courses', 0),
		('nav_primary_1_videos', 'primary', 'Primary navigation', 'videos', 'Videos', '/videos', 3, 'video', 0),
		('nav_primary_1_membership', 'primary', 'Primary navigation', 'membership', 'Membership', '/membership', 4, 'memberships', 0),
		('nav_primary_1_licensing', 'primary', 'Primary navigation', 'licensing', 'Licensing', '/licensing', 5, 'licensing', 0),
		('nav_primary_1_contact', 'primary', 'Primary navigation', 'contact', 'Contact', '/contact', 6, 'contact', 0),
		('nav_primary_1_whats_new', 'primary', 'Primary navigation', 'whats-new', 'What''s New', '/whats-new', 7, 'whats-new', 0),
		('nav_footer_1_privacy', 'footer', 'Footer navigation', 'privacy', 'Privacy', '/privacy', 0, NULL, 0),
		('nav_footer_1_terms', 'footer', 'Footer navigation', 'terms', 'Terms', '/terms', 1, NULL, 0),
		('nav_footer_1_faq', 'footer', 'Footer navigation', 'faq', 'FAQ', '/faq', 2, NULL, 0),
		('nav_footer_1_repository', 'footer', 'Footer navigation', 'repository', 'GitHub repository', 'https://github.com/sunflower-of-parchman/a-op', 3, NULL, 1)
)
INSERT OR IGNORE INTO `navigation_items` (
	`id`,
	`navigation_set_id`,
	`version`,
	`item_key`,
	`label`,
	`href`,
	`position`,
	`module_key`,
	`external`,
	`created_at`
)
SELECT
	`seed`.`id`,
	`seed`.`navigation_set_id`,
	1,
	`seed`.`item_key`,
	`seed`.`label`,
	`seed`.`href`,
	`seed`.`position`,
	`seed`.`module_key`,
	`seed`.`external`,
	`sets`.`created_at`
FROM `neutral_navigation_items` AS `seed`
JOIN `navigation_sets` AS `sets`
	ON `sets`.`id` = `seed`.`navigation_set_id`
WHERE `sets`.`label` = `seed`.`set_label`
	AND `sets`.`draft_version` = 1
	AND `sets`.`published_version` = 1
	AND `sets`.`revision` = 1
	AND `sets`.`last_operation_key` IS NULL
	AND `sets`.`published_at` IS NOT NULL
	AND NOT EXISTS (
		SELECT 1
		FROM `navigation_items` AS `existing`
		WHERE `existing`.`navigation_set_id` = `sets`.`id`
			AND `existing`.`version` = 1
	);--> statement-breakpoint
WITH `neutral_page_revisions` (
	`id`,
	`page_id`,
	`slug`,
	`module_key`,
	`kind`,
	`title`,
	`introduction`,
	`body_text`
) AS (
	VALUES
		('page_music_revision_1', 'page_music', 'music', NULL, 'system', 'Music', 'Releases, tracks, collections, artwork, credits, and streaming live at the center of the site.', 'This neutral installation is ready for the artist''s approved catalog and media.'),
		('page_about_revision_1', 'page_about', 'about', NULL, 'standard', 'About', 'a-op is an open-source web application for musicians who want to publish and operate their work through their own site.', 'A fresh installation begins with music, streaming, identity, access, and administration. The artist activates other connected capabilities when they need them.'),
		('page_privacy_revision_1', 'page_privacy', 'privacy', NULL, 'legal', 'Privacy', 'This installation includes an editable Privacy Policy starter for the artist to review, revise, approve, and publish.', 'The final policy describes the artist''s actual data collection, contact forms, accounts, access, telemetry, services, and retention choices.'),
		('page_terms_revision_1', 'page_terms', 'terms', NULL, 'legal', 'Terms and Conditions', 'This installation includes an editable Terms and Conditions starter for the artist to review, revise, approve, and publish.', 'The artist remains the authority for access plans, memberships, subscriptions, licensing terms, downloads, Courses, and customer policies.'),
		('page_faq_revision_1', 'page_faq', 'faq', NULL, 'standard', 'FAQ', 'Answers about listening, accounts, access, downloads, memberships, subscriptions, Courses, and licensing live here.', 'Each artist replaces these neutral placeholders with the information their visitors and customers need.'),
		('page_courses_revision_1', 'page_courses', 'courses', 'courses', 'standard', 'Courses', 'Publish ordered Courses made from lessons, writing, audio, video, images, and downloads.', 'Each lesson can be public, account-based, or available through an artist-controlled access grant, membership, subscription, or license.'),
		('page_videos_revision_1', 'page_videos', 'videos', 'video', 'standard', 'Videos', 'Share video with artist context, credits, transcripts, and privacy-aware playback.', 'Artists control drafts, previews, publication, revisions, and whether media is hosted by the site or loaded from an approved external source.'),
		('page_membership_revision_1', 'page_membership', 'membership', 'memberships', 'standard', 'Membership', 'Define recurring access, benefits, renewal dates, cancellations, download credits, and license credits.', 'Customers can see their current access and history. Artists manage plans and durable access through administration.'),
		('page_licensing_revision_1', 'page_licensing', 'licensing', 'licensing', 'standard', 'Licensing', 'Create artist-defined licensing options for specific tracks and supported uses.', 'The workflow records the selected music, intended use, customer, terms version, approval or credit source, issued license, and delivery history.'),
		('page_contact_revision_1', 'page_contact', 'contact', 'contact', 'standard', 'Contact', 'Receive general messages, booking requests, teaching questions, support requests, and licensing inquiries.', 'Every submission records the sender''s consent to the artist''s current language and remains available in administration.'),
		('page_whats_new_revision_1', 'page_whats_new', 'whats-new', 'whats-new', 'standard', 'What''s New', 'Publish updates that lead directly to new music, releases, Courses, videos, licenses, memberships, and subscriptions.', 'Signed-in customers receive an unread indicator, and the application remembers which updates they have read.')
)
INSERT OR IGNORE INTO `page_revisions` (
	`id`,
	`page_id`,
	`revision`,
	`module_key`,
	`kind`,
	`title`,
	`introduction`,
	`body_text`,
	`created_at`
)
SELECT
	`seed`.`id`,
	`seed`.`page_id`,
	1,
	`seed`.`module_key`,
	`seed`.`kind`,
	`seed`.`title`,
	`seed`.`introduction`,
	`seed`.`body_text`,
	`pages`.`created_at`
FROM `neutral_page_revisions` AS `seed`
JOIN `pages`
	ON `pages`.`id` = `seed`.`page_id`
WHERE `pages`.`slug` = `seed`.`slug`
	AND `pages`.`module_key` IS `seed`.`module_key`
	AND `pages`.`kind` = `seed`.`kind`
	AND `pages`.`draft_revision_id` = `seed`.`id`
	AND `pages`.`published_revision_id` = `seed`.`id`
	AND `pages`.`publication_state` = 'published'
	AND `pages`.`version` = 1
	AND `pages`.`last_operation_key` IS NULL
	AND `pages`.`published_at` IS NOT NULL
	AND NOT EXISTS (
		SELECT 1
		FROM `page_revisions` AS `existing`
		WHERE `existing`.`page_id` = `pages`.`id`
	);
