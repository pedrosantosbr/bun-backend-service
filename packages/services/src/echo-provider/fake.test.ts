import { describe, expect, it } from "bun:test";
import { ProviderError } from "@template/shared/errors";
import { Effect } from "effect";
import { EchoProviderFake, makeEchoProviderFake } from "./fake";
import { EchoProvider } from "./service";

const run = <A, E>(
  layer: ReturnType<typeof makeEchoProviderFake>,
  effect: Effect.Effect<A, E, EchoProvider>,
) => Effect.runPromise(effect.pipe(Effect.provide(layer)));

describe("EchoProviderFake", () => {
  it("echoes the input deterministically", async () => {
    const result = await run(
      EchoProviderFake,
      Effect.gen(function* () {
        const provider = yield* EchoProvider;
        return yield* provider.process({ taskId: "t1", text: "hello world" });
      }),
    );
    expect(result.echoed).toBe("hello world");
    expect(result.sentiment).toBe("neutral");
    expect(new Date(result.processedAt).getTime()).not.toBeNaN();
  });

  it("infers sentiment from the text", async () => {
    const provider = Effect.gen(function* () {
      const p = yield* EchoProvider;
      const positive = yield* p.process({ taskId: "t", text: "great job!" });
      const negative = yield* p.process({ taskId: "t", text: "bad day" });
      return { positive, negative };
    });
    const { positive, negative } = await run(EchoProviderFake, provider);
    expect(positive.sentiment).toBe("positive");
    expect(negative.sentiment).toBe("negative");
  });

  it("fails with the configured error", async () => {
    const failing = makeEchoProviderFake({
      failWith: new ProviderError({
        provider: "echo",
        code: "SERVER_ERROR",
        message: "synthetic outage",
        retryable: true,
      }),
    });
    const error = await run(
      failing,
      Effect.gen(function* () {
        const provider = yield* EchoProvider;
        return yield* provider
          .process({ taskId: "t", text: "x" })
          .pipe(Effect.flip);
      }),
    );
    expect(error._tag).toBe("ProviderError");
    expect(error.code).toBe("SERVER_ERROR");
  });
});
