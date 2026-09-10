CREATE TABLE `reminder_media` (
	`id` text PRIMARY KEY NOT NULL,
	`device` text NOT NULL,
	`name` text NOT NULL,
	`type` text NOT NULL,
	`size` integer NOT NULL,
	`created` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `reminder_media_device` ON `reminder_media` (`device`);--> statement-breakpoint
CREATE TABLE `reminders` (
	`id` text PRIMARY KEY NOT NULL,
	`device` text NOT NULL,
	`title` text NOT NULL,
	`description` text NOT NULL,
	`due` integer NOT NULL,
	`media_id` text,
	`revision` integer DEFAULT 0 NOT NULL,
	`created` integer NOT NULL,
	`updated` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `reminders_device_due` ON `reminders` (`device`,`due`);