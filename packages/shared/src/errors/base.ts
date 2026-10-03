import { Schema } from "effect";

export class AppError extends Schema.TaggedError<AppError>()("AppError", {
  code: Schema.String,
  message: Schema.String,
  details: Schema.optional(Schema.Record(Schema.String, Schema.Unknown)),
  cause: Schema.optional(Schema.Unknown),
}) {}

export class ValidationError extends Schema.TaggedError<ValidationError>()(
  "ValidationError",
  {
    field: Schema.String,
    message: Schema.String,
  },
) {}

export class NotFoundError extends Schema.TaggedError<NotFoundError>()(
  "NotFoundError",
  {
    resource: Schema.String,
    id: Schema.String,
  },
) {
  get displayMessage(): string {
    return `${this.resource} ${this.id} not found`;
  }
}

export class ConflictError extends Schema.TaggedError<ConflictError>()(
  "ConflictError",
  {
    message: Schema.String,
    details: Schema.optional(Schema.Record(Schema.String, Schema.Unknown)),
  },
) {}

export class UnauthorizedError extends Schema.TaggedError<UnauthorizedError>()(
  "UnauthorizedError",
  {
    message: Schema.optional(Schema.String),
  },
) {
  get displayMessage(): string {
    return this.message ?? "Authentication required";
  }
}

export class DatabaseQueryError extends Schema.TaggedError<DatabaseQueryError>()(
  "DatabaseQueryError",
  {
    message: Schema.String,
    operation: Schema.String,
    cause: Schema.optional(Schema.Unknown),
  },
) {}

export class MongoQueryError extends Schema.TaggedError<MongoQueryError>()(
  "MongoQueryError",
  {
    message: Schema.String,
    operation: Schema.String,
    cause: Schema.optional(Schema.Unknown),
  },
) {}

export class QueueError extends Schema.TaggedError<QueueError>()("QueueError", {
  message: Schema.String,
  operation: Schema.String,
  cause: Schema.optional(Schema.Unknown),
}) {}

export class NetworkError extends Schema.TaggedError<NetworkError>()(
  "NetworkError",
  {
    message: Schema.String,
    cause: Schema.optional(Schema.Unknown),
  },
) {}

export class TimeoutError extends Schema.TaggedError<TimeoutError>()(
  "TimeoutError",
  {
    message: Schema.String,
    timeoutMs: Schema.Number,
  },
) {}

export class ProviderError extends Schema.TaggedError<ProviderError>()(
  "ProviderError",
  {
    provider: Schema.String,
    code: Schema.String,
    message: Schema.String,
    retryable: Schema.optional(Schema.Boolean),
    cause: Schema.optional(Schema.Unknown),
  },
) {}

export const toAppError = (error: unknown): AppError => {
  if (error instanceof AppError) return error;
  if (error && typeof error === "object" && "_tag" in error) {
    const tagged = error as { _tag: string; message?: unknown };
    return new AppError({
      code: tagged._tag,
      message:
        typeof tagged.message === "string" ? tagged.message : String(error),
      cause: error,
    });
  }
  if (error instanceof Error) {
    return new AppError({
      code: "UNKNOWN",
      message: error.message,
      cause: error,
    });
  }
  return new AppError({ code: "UNKNOWN", message: String(error) });
};
