export interface SuccessEnvelope<T> {
  readonly status: "success";
  readonly data: T;
}

export interface FailureEnvelope {
  readonly status: "failure";
  readonly error: {
    readonly code: string;
    readonly message: string;
    readonly details?: unknown;
  };
}

export type ApiEnvelope<T> = SuccessEnvelope<T> | FailureEnvelope;

export const ok = <T>(data: T): SuccessEnvelope<T> => ({
  status: "success",
  data,
});

export const fail = (
  code: string,
  message: string,
  details?: unknown,
): FailureEnvelope => ({
  status: "failure",
  error: {
    code,
    message,
    ...(details !== undefined ? { details } : {}),
  },
});

interface MappedError {
  readonly httpStatus: number;
  readonly envelope: FailureEnvelope;
}

const isTagged = (error: unknown): error is { _tag: string } =>
  typeof error === "object" && error !== null && "_tag" in error;

/**
 * Maps typed domain errors onto HTTP statuses. Infrastructure errors are
 * deliberately flattened to an opaque INTERNAL_ERROR — their details belong
 * in logs, not in responses.
 */
export const errorToResponse = (error: unknown): MappedError => {
  if (isTagged(error)) {
    switch (error._tag) {
      case "ValidationError": {
        const e = error as unknown as { field: string; message: string };
        return {
          httpStatus: 400,
          envelope: fail("VALIDATION_ERROR", e.message, { field: e.field }),
        };
      }
      case "UnauthorizedError":
        return {
          httpStatus: 401,
          envelope: fail("UNAUTHORIZED", "authentication required"),
        };
      case "NotFoundError": {
        const e = error as unknown as { resource: string; id: string };
        return {
          httpStatus: 404,
          envelope: fail("NOT_FOUND", `${e.resource} ${e.id} not found`),
        };
      }
      case "ConflictError": {
        const e = error as unknown as { message: string; details?: unknown };
        return {
          httpStatus: 409,
          envelope: fail("CONFLICT", e.message, e.details),
        };
      }
      case "ProviderError":
        return {
          httpStatus: 502,
          envelope: fail("UPSTREAM_ERROR", "upstream provider failed"),
        };
      case "TimeoutError":
        return {
          httpStatus: 504,
          envelope: fail("TIMEOUT", "the request timed out"),
        };
      default:
        return {
          httpStatus: 500,
          envelope: fail("INTERNAL_ERROR", "internal error"),
        };
    }
  }
  return {
    httpStatus: 500,
    envelope: fail("INTERNAL_ERROR", "internal error"),
  };
};
