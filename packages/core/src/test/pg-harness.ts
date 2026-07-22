import { createHash } from "node:crypto";
import { join } from "node:path";
import pg from "pg";

/**
 * Integration-test harness for Postgres. Pushes the Drizzle schema into the
 * docker test database (drizzle-kit push --force), caching by a hash of the
 * schema files stored IN the database itself — so a wiped container never
 * leaves a stale "already pushed" marker behind.
 */
const coreDir = join(import.meta.dir, "..", "..");

export const testPostgresUrl: string =
  process.env.POSTGRES_URL ??
  "postgres://postgres:postgres@127.0.0.1:5433/template_test";

const adminUrl = (() => {
  const url = new URL(testPostgresUrl);
  url.pathname = "/template";
  return url.toString();
})();

const testDatabaseName = new URL(testPostgresUrl).pathname.slice(1);

const withClient = async <A>(
  connectionString: string,
  fn: (client: pg.Client) => Promise<A>,
): Promise<A> => {
  const client = new pg.Client({ connectionString });
  try {
    await client.connect();
  } catch (error) {
    throw new Error(
      `Cannot reach test Postgres at ${connectionString}. Run \`bun run deps:up\` first. (${String(error)})`,
    );
  }
  try {
    return await fn(client);
  } finally {
    await client.end();
  }
};

const computeSchemaHash = async (): Promise<string> => {
  const glob = new Bun.Glob("src/**/*.sql.ts");
  const files = (await Array.fromAsync(glob.scan({ cwd: coreDir }))).sort();
  files.push("drizzle.config.ts");
  const hash = createHash("sha256");
  for (const file of files) {
    hash.update(file);
    hash.update(await Bun.file(join(coreDir, file)).text());
  }
  return hash.digest("hex");
};

const ensureTestDatabase = () =>
  withClient(adminUrl, async (client) => {
    const existing = await client.query(
      "SELECT 1 FROM pg_database WHERE datname = $1",
      [testDatabaseName],
    );
    if (existing.rowCount === 0) {
      await client.query(`CREATE DATABASE "${testDatabaseName}"`);
    }
  });

let schemaReady = false;

export const createTestSchema = async (): Promise<void> => {
  if (schemaReady) return;
  await ensureTestDatabase();
  const hash = await computeSchemaHash();
  // The meta table deliberately does NOT match tablesFilter (tpl_*): if it
  // did, drizzle-kit push would see an unknown table and open an interactive
  // rename prompt (and it exits 0 even when that prompt fails).
  const upToDate = await withClient(testPostgresUrl, async (client) => {
    await client.query(
      "CREATE TABLE IF NOT EXISTS _test_meta (key text PRIMARY KEY, value text NOT NULL)",
    );
    const row = await client.query(
      "SELECT value FROM _test_meta WHERE key = 'schema_hash'",
    );
    return row.rows[0]?.value === hash;
  });
  if (!upToDate) {
    const proc = Bun.spawn(["bun", "run", "db:push"], {
      cwd: coreDir,
      env: { ...process.env, POSTGRES_URL: testPostgresUrl },
      stdout: "pipe",
      stderr: "pipe",
    });
    const [code, stdout, stderr] = await Promise.all([
      proc.exited,
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
    ]);
    // drizzle-kit can exit 0 even when it errored (e.g. TTY prompt failure),
    // so also scan its output.
    if (code !== 0 || /error/i.test(stdout) || /error/i.test(stderr)) {
      throw new Error(`drizzle-kit push failed:\n${stdout}\n${stderr}`);
    }
    await withClient(testPostgresUrl, (client) =>
      client.query(
        `INSERT INTO _test_meta (key, value) VALUES ('schema_hash', $1)
         ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
        [hash],
      ),
    );
  }
  schemaReady = true;
};

export const clearTestData = (): Promise<void> =>
  withClient(testPostgresUrl, async (client) => {
    const tables = await client.query(
      `SELECT tablename FROM pg_tables
       WHERE schemaname = 'public'
         AND tablename LIKE 'tpl_%'
         AND tablename <> 'tpl_migrations'`,
    );
    const names = tables.rows.map(
      (row: { tablename: string }) => `"${row.tablename}"`,
    );
    if (names.length > 0) {
      await client.query(
        `TRUNCATE ${names.join(", ")} RESTART IDENTITY CASCADE`,
      );
    }
  });
