CREATE TABLE "attempts" (
	"id" serial PRIMARY KEY NOT NULL,
	"problem_id" integer NOT NULL,
	"attempted_on" date NOT NULL,
	"rating" text NOT NULL,
	"minutes" integer,
	"insight" text,
	CONSTRAINT "attempts_rating_check" CHECK ("attempts"."rating" in ('easy','struggled','needed_solution'))
);
--> statement-breakpoint
CREATE TABLE "problems" (
	"id" integer PRIMARY KEY NOT NULL,
	"position" integer NOT NULL,
	"title" text NOT NULL,
	"slug" text NOT NULL,
	"url" text NOT NULL,
	"pattern" text NOT NULL,
	"difficulty" text NOT NULL,
	"insight" text,
	CONSTRAINT "problems_slug_unique" UNIQUE("slug"),
	CONSTRAINT "problems_difficulty_check" CHECK ("problems"."difficulty" in ('Easy','Medium','Hard'))
);
--> statement-breakpoint
CREATE TABLE "review_state" (
	"problem_id" integer PRIMARY KEY NOT NULL,
	"interval_days" integer NOT NULL,
	"next_review" date,
	"last_reviewed" date NOT NULL,
	"times_reviewed" integer NOT NULL,
	"status" text NOT NULL,
	CONSTRAINT "review_state_status_check" CHECK ("review_state"."status" in ('in_review','mastered','retired'))
);
--> statement-breakpoint
ALTER TABLE "attempts" ADD CONSTRAINT "attempts_problem_id_problems_id_fk" FOREIGN KEY ("problem_id") REFERENCES "public"."problems"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_state" ADD CONSTRAINT "review_state_problem_id_problems_id_fk" FOREIGN KEY ("problem_id") REFERENCES "public"."problems"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "attempts_problem_id_idx" ON "attempts" USING btree ("problem_id");--> statement-breakpoint
CREATE INDEX "review_state_next_review_idx" ON "review_state" USING btree ("next_review");