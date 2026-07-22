import { app } from "./app";

/** Local dev server: `bun run dev` (hot reload via bun --hot). */
const port = Number(process.env.PORT ?? 3000);

const server = Bun.serve({ port, fetch: app.fetch });

console.log(`api listening on http://localhost:${server.port}`);
