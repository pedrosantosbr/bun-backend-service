import { AppConfigService } from "@template/shared/config";
import { Option, Redacted } from "effect";
import type { MiddlewareHandler } from "hono";
import { getApiRuntime } from "../lib/handle-effect";
import { fail } from "../lib/response";

/**
 * Bearer-token stub. When API_TOKEN is unset (local dev, tests) auth is
 * disabled. Swap this middleware for real authentication (JWT, service
 * client, HMAC) when adopting the template — the shape stays the same.
 */
export const bearerAuth: MiddlewareHandler = async (c, next) => {
  const config = await getApiRuntime().runPromise(AppConfigService);
  const expected = Option.getOrUndefined(config.apiToken);
  if (!expected) return next();
  const header = c.req.header("authorization");
  if (header !== `Bearer ${Redacted.value(expected)}`) {
    return c.json(fail("UNAUTHORIZED", "invalid or missing bearer token"), 401);
  }
  return next();
};
