CREATE TABLE IF NOT EXISTS `outcomes` (
	`chart_id` text PRIMARY KEY NOT NULL,
	`symbol` text NOT NULL,
	`direction` text NOT NULL,
	`status` text NOT NULL,
	`pct_since_anchor` real NOT NULL,
	`resolved_at` integer NOT NULL,
	`judged_at` text NOT NULL
);
--> statement-breakpoint
ALTER TABLE `outcomes` ADD `rules` integer DEFAULT 1 NOT NULL;
