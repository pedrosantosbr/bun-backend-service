export const taskStatuses = [
  "pending",
  "processing",
  "completed",
  "failed",
  "cancelled",
] as const;

export type TaskStatus = (typeof taskStatuses)[number];

/**
 * The task state machine, expressed as "which statuses may transition INTO
 * this one". The store enforces it atomically (UPDATE ... WHERE status IN).
 *
 *   pending → processing → completed | failed
 *   pending → cancelled
 *   failed → pending          (manual re-execution)
 *   processing → pending      (cron requeue of stuck tasks)
 */
export const transitionSources: Record<TaskStatus, readonly TaskStatus[]> = {
  pending: ["failed", "processing"],
  processing: ["pending"],
  completed: ["processing"],
  failed: ["processing"],
  cancelled: ["pending"],
};

export const canTransition = (from: TaskStatus, to: TaskStatus): boolean =>
  transitionSources[to].includes(from);

export interface CreateTaskInput {
  readonly title: string;
  readonly description?: string;
}

export interface ListTasksFilter {
  readonly status?: TaskStatus;
  readonly limit?: number;
  readonly cursor?: string;
}
