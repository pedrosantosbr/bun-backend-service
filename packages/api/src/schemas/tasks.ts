import type { TaskRow } from "@template/core/domains/tasks/db/schema/tasks.sql";
import { taskStatuses } from "@template/core/domains/tasks/types";
import { z } from "zod";

export const CreateTaskBody = z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(2_000).optional(),
});

export const ListTasksQuery = z.object({
  status: z.enum(taskStatuses).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
  cursor: z.uuid().optional(),
});

export const TaskIdParams = z.object({
  id: z.uuid(),
});

export const AddCommentBody = z.object({
  author: z.string().min(1).max(100),
  body: z.string().min(1).max(2_000),
});

export const ListCommentsQuery = z.object({
  limit: z.coerce.number().int().min(1).max(100).optional(),
  before: z.iso.datetime().optional(),
});

export interface TaskResponse {
  readonly id: string;
  readonly title: string;
  readonly description: string | null;
  readonly status: TaskRow["status"];
  readonly result: Record<string, unknown> | null;
  readonly failureReason: string | null;
  readonly attemptCount: number;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly startedAt: string | null;
  readonly completedAt: string | null;
}

export const serializeTask = (task: TaskRow): TaskResponse => ({
  id: task.id,
  title: task.title,
  description: task.description,
  status: task.status,
  result: task.result,
  failureReason: task.failureReason,
  attemptCount: task.attemptCount,
  createdAt: task.createdAt.toISOString(),
  updatedAt: task.updatedAt.toISOString(),
  startedAt: task.startedAt?.toISOString() ?? null,
  completedAt: task.completedAt?.toISOString() ?? null,
});
