import { describe, expect, it } from "bun:test";
import { Effect } from "effect";
import {
  AppError,
  DatabaseQueryError,
  NotFoundError,
  ProviderError,
  toAppError,
} from "./index";

describe("shared errors", () => {
  it("tagged errors carry their tag and fields", () => {
    const error = new NotFoundError({ resource: "task", id: "abc" });
    expect(error._tag).toBe("NotFoundError");
    expect(error.displayMessage).toBe("task abc not found");
  });

  it("tagged errors are yieldable in Effect and catchable by tag", async () => {
    const program = Effect.gen(function* () {
      yield* new ProviderError({
        provider: "echo",
        code: "SERVER_ERROR",
        message: "boom",
      });
      return "unreachable";
    }).pipe(
      Effect.catchTag("ProviderError", (e) =>
        Effect.succeed(`caught:${e.code}`),
      ),
    );
    expect(await Effect.runPromise(program)).toBe("caught:SERVER_ERROR");
  });

  it("toAppError passes AppError through", () => {
    const original = new AppError({ code: "X", message: "y" });
    expect(toAppError(original)).toBe(original);
  });

  it("toAppError maps tagged errors to their tag as code", () => {
    const mapped = toAppError(
      new DatabaseQueryError({ message: "db down", operation: "insert" }),
    );
    expect(mapped.code).toBe("DatabaseQueryError");
    expect(mapped.message).toBe("db down");
  });

  it("toAppError wraps plain errors and unknown values", () => {
    expect(toAppError(new Error("plain")).code).toBe("UNKNOWN");
    expect(toAppError("weird").message).toBe("weird");
  });
});
