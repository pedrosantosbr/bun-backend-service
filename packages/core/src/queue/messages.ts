import { Schema } from "effect";

/**
 * Queue message contracts. Producers encode with the schema and consumers
 * decode with it, so both sides fail loudly on drift.
 */
export const TaskExecuteMessage = Schema.Struct({
  type: Schema.Literal("task.execute"),
  taskId: Schema.String.check(Schema.isUUID()),
});

export type TaskExecuteMessage = Schema.Schema.Type<typeof TaskExecuteMessage>;

export const encodeTaskExecuteMessage = (taskId: string): string =>
  JSON.stringify({ type: "task.execute", taskId } satisfies TaskExecuteMessage);

export const decodeTaskExecuteMessage = Schema.decodeUnknownEffect(
  Schema.fromJsonString(TaskExecuteMessage),
);
