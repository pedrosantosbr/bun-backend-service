import { Layer } from "effect";
import { TaskStoreLive } from "./store";
import { TaskServiceLive } from "./task-service";

/**
 * Everything the tasks domain provides. Still requires
 * PostgresDatabaseService, QueuePublisher and AppConfigService from the
 * composing application layer.
 */
export const TasksLayer = Layer.mergeAll(
  TaskStoreLive,
  TaskServiceLive.pipe(Layer.provide(TaskStoreLive)),
);
