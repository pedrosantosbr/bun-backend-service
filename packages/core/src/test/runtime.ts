import { type Effect, type Layer, ManagedRuntime } from "effect";

export interface TestRuntime<R> {
  readonly runTest: <A, E>(effect: Effect.Effect<A, E, R>) => Promise<A>;
  readonly dispose: () => Promise<void>;
}

/**
 * Builds a ManagedRuntime for a test suite. Call in beforeAll, dispose in
 * afterAll so scoped resources (db pools, mongo connections) are released.
 */
export const setupTestRuntime = <R, E>(
  layer: Layer.Layer<R, E>,
): TestRuntime<R> => {
  const runtime = ManagedRuntime.make(layer);
  return {
    runTest: (effect) => runtime.runPromise(effect),
    dispose: () => runtime.dispose(),
  };
};
