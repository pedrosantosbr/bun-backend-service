import {
  index,
  integer,
  jsonb,
  pgEnum,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { pgTable } from "../../../../db/table";

export const taskStatus = pgEnum("tpl_task_status", [
  "pending",
  "processing",
  "completed",
  "failed",
  "cancelled",
]);

export const tasks = pgTable(
  "tasks",
  {
    id: uuid("id").primaryKey(),
    title: text("title").notNull(),
    description: text("description"),
    status: taskStatus("status").notNull().default("pending"),
    result: jsonb("result").$type<Record<string, unknown>>(),
    failureReason: text("failure_reason"),
    attemptCount: integer("attempt_count").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    startedAt: timestamp("started_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (table) => [
    index("tasks_status_updated_at_idx").on(table.status, table.updatedAt),
  ],
);

export type TaskRow = typeof tasks.$inferSelect;
export type NewTaskRow = typeof tasks.$inferInsert;
