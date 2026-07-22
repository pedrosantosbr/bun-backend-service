import { Hono } from "hono";
import { fail } from "./lib/response";
import { bearerAuth } from "./middleware/auth";
import { commentsRoutes } from "./routes/comments";
import { healthRoutes } from "./routes/health";
import { tasksRoutes } from "./routes/tasks";

export const createApp = (): Hono => {
  const app = new Hono();

  app.route("/health", healthRoutes);
  app.use("/v1/*", bearerAuth);
  app.route("/v1/tasks", tasksRoutes);
  app.route("/v1/tasks", commentsRoutes);

  app.notFound((c) => c.json(fail("NOT_FOUND", "route not found"), 404));
  app.onError((error, c) => {
    console.error("[api] unhandled error", { path: c.req.path, error });
    return c.json(fail("INTERNAL_ERROR", "internal error"), 500);
  });

  return app;
};

export const app = createApp();
