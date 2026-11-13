ALTER TABLE "review_state" DROP CONSTRAINT "review_state_status_check";--> statement-breakpoint
ALTER TABLE "review_state" ALTER COLUMN "next_review" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "review_state" ADD COLUMN "ease_factor" integer NOT NULL;--> statement-breakpoint
ALTER TABLE "review_state" ADD COLUMN "repetitions" integer NOT NULL;--> statement-breakpoint
ALTER TABLE "review_state" DROP COLUMN "status";