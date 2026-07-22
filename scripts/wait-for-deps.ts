/**
 * Polls the docker-compose dependencies (Postgres, Mongo, ElasticMQ) until
 * they accept connections, or exits 1 after the timeout. Used by
 * `bun run check` before the integration test phase.
 */
const TIMEOUT_MS = 60_000;
const POLL_MS = 500;

const targets: ReadonlyArray<{ name: string; host: string; port: number }> = [
  { name: "postgres", host: "127.0.0.1", port: 5433 },
  { name: "mongo", host: "127.0.0.1", port: 27018 },
  { name: "elasticmq", host: "127.0.0.1", port: 9324 },
];

const canConnect = async (host: string, port: number): Promise<boolean> => {
  try {
    await new Promise<void>((resolve, reject) => {
      const socket = Bun.connect({
        hostname: host,
        port,
        socket: {
          open(s) {
            s.end();
            resolve();
          },
          error(_s, error) {
            reject(error);
          },
          connectError(_s, error) {
            reject(error);
          },
          data() {},
        },
      });
      void socket;
    });
    return true;
  } catch {
    return false;
  }
};

const deadline = Date.now() + TIMEOUT_MS;
const pending = new Set(targets.map((t) => t.name));

while (pending.size > 0 && Date.now() < deadline) {
  for (const target of targets) {
    if (!pending.has(target.name)) continue;
    if (await canConnect(target.host, target.port)) {
      console.log(`ready: ${target.name} (${target.host}:${target.port})`);
      pending.delete(target.name);
    }
  }
  if (pending.size > 0) await Bun.sleep(POLL_MS);
}

if (pending.size > 0) {
  console.error(
    `Timed out waiting for: ${[...pending].join(", ")}. Run \`bun run deps:up\` first.`,
  );
  process.exit(1);
}
