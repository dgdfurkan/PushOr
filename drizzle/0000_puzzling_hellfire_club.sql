CREATE TABLE `devices` (
	`id` text PRIMARY KEY NOT NULL,
	`settings` text NOT NULL,
	`subscription` text,
	`revision` integer DEFAULT 0 NOT NULL,
	`updated` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `events` (
	`id` text PRIMARY KEY NOT NULL,
	`device` text NOT NULL,
	`group_id` text NOT NULL,
	`revision` integer NOT NULL,
	`due` integer NOT NULL,
	`expires` integer NOT NULL,
	`payload` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`lease` integer DEFAULT 0 NOT NULL,
	`sent` integer,
	`delivered` integer,
	`error` text
);
--> statement-breakpoint
CREATE INDEX `events_due_status` ON `events` (`status`,`due`);--> statement-breakpoint
CREATE INDEX `events_device_group` ON `events` (`device`,`group_id`);--> statement-breakpoint
CREATE TABLE `kv` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL,
	`updated` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`device` text NOT NULL,
	`kind` text NOT NULL,
	`started` integer NOT NULL,
	`ends` integer NOT NULL,
	`duration` integer NOT NULL,
	`elapsed` integer DEFAULT 0 NOT NULL,
	`status` text NOT NULL,
	`day` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `sessions_device_day` ON `sessions` (`device`,`day`);