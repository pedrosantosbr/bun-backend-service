import { handle } from "hono/aws-lambda";
import { app } from "./app";

/** Lambda entrypoint (see infra/api.ts). */
export const handler = handle(app);
