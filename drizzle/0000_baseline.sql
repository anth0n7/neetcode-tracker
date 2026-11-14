CREATE TABLE `attempts` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`problem_id` integer NOT NULL,
	`attempted_on` text NOT NULL,
	`rating` text NOT NULL,
	`minutes` integer,
	`insight` text,
	FOREIGN KEY (`problem_id`) REFERENCES `problems`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "attempts_rating_check" CHECK("attempts"."rating" in ('easy','struggled','needed_solution'))
);
--> statement-breakpoint
CREATE INDEX `attempts_problem_id_idx` ON `attempts` (`problem_id`);--> statement-breakpoint
CREATE TABLE `problems` (
	`id` integer PRIMARY KEY NOT NULL,
	`position` integer NOT NULL,
	`title` text NOT NULL,
	`slug` text NOT NULL,
	`url` text NOT NULL,
	`pattern` text NOT NULL,
	`difficulty` text NOT NULL,
	`insight` text,
	CONSTRAINT "problems_difficulty_check" CHECK("problems"."difficulty" in ('Easy','Medium','Hard'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `problems_slug_unique` ON `problems` (`slug`);--> statement-breakpoint
CREATE TABLE `review_state` (
	`problem_id` integer PRIMARY KEY NOT NULL,
	`interval_days` integer NOT NULL,
	`ease_factor` integer NOT NULL,
	`repetitions` integer NOT NULL,
	`next_review` text NOT NULL,
	`last_reviewed` text NOT NULL,
	`times_reviewed` integer NOT NULL,
	FOREIGN KEY (`problem_id`) REFERENCES `problems`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "review_state_ease_factor_check" CHECK("review_state"."ease_factor" >= 130),
	CONSTRAINT "review_state_repetitions_check" CHECK("review_state"."repetitions" >= 0)
);
--> statement-breakpoint
CREATE INDEX `review_state_next_review_idx` ON `review_state` (`next_review`);