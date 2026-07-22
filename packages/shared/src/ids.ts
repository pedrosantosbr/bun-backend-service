import { v7 as uuidv7 } from "uuid";

/**
 * Time-ordered UUIDs (v7) for all entity ids. The `uuid` package is used
 * instead of Bun.randomUUIDv7 so the same code runs on nodejs22.x Lambda.
 */
export const createId = (): string => uuidv7();
