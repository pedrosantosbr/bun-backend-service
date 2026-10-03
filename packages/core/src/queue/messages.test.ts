import { describe, expect, it } from "bun:test";
import { Effect } from "effect";
import { decodeTaskExecuteMessage, encodeTaskExecuteMessage } from "./messages";

describe("queue message contracts", () => {
  it("round-trips a task.execute message", async () => {
    const taskId = "0197c9c1-0000-7000-8000-000000000000";
    const decoded = await Effect.runPromise(
      decodeTaskExecuteMessage(encodeTaskExecuteMessage(taskId)),
    );
    expect(decoded).toEqual({ type: "task.execute", taskId });
  });

  it("rejects malformed bodies", async () => {
    const result = await Effect.runPromise(
      decodeTaskExecuteMessage(
        '{"type":"task.execute","taskId":"not-a-uuid"}',
      ).pipe(Effect.flip),
    );
    expect(result._tag).toBe("SchemaError");
  });

  it("rejects non-JSON bodies", async () => {
    const result = await Effect.runPromise(
      decodeTaskExecuteMessage("not json").pipe(Effect.flip),
    );
    expect(result._tag).toBe("SchemaError");
  });
});
