import { AppError, ValidationError } from "@template/shared/errors";
import { Effect } from "effect";
import type { Context as HonoContext } from "hono";
import type { z } from "zod";

const firstIssue = (error: z.ZodError): ValidationError => {
  const issue = error.issues[0];
  return new ValidationError({
    field: issue?.path.join(".") || "body",
    message: issue?.message ?? "invalid input",
  });
};

/** Parses and validates the JSON body inside the Effect pipeline. */
export const validateBody = <S extends z.ZodType>(
  c: HonoContext,
  schema: S,
): Effect.Effect<z.infer<S>, ValidationError | AppError> =>
  Effect.tryPromise({
    try: () => c.req.json() as Promise<unknown>,
    catch: () =>
      new ValidationError({ field: "body", message: "invalid JSON body" }),
  }).pipe(
    Effect.flatMap((raw) => {
      const parsed = schema.safeParse(raw);
      return parsed.success
        ? Effect.succeed(parsed.data as z.infer<S>)
        : Effect.fail(firstIssue(parsed.error));
    }),
  );

export const validateQuery = <S extends z.ZodType>(
  c: HonoContext,
  schema: S,
): Effect.Effect<z.infer<S>, ValidationError> => {
  const parsed = schema.safeParse(c.req.query());
  return parsed.success
    ? Effect.succeed(parsed.data as z.infer<S>)
    : Effect.fail(firstIssue(parsed.error));
};

export const validateParams = <S extends z.ZodType>(
  c: HonoContext,
  schema: S,
): Effect.Effect<z.infer<S>, ValidationError> => {
  const parsed = schema.safeParse(c.req.param());
  return parsed.success
    ? Effect.succeed(parsed.data as z.infer<S>)
    : Effect.fail(firstIssue(parsed.error));
};
