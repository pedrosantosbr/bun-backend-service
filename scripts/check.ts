/**
 * Full verification gate: typecheck, lint, format, unit tests, then boots
 * docker dependencies and runs integration tests. Fails fast on the first
 * broken step.
 */
const steps: ReadonlyArray<{ name: string; cmd: string[] }> = [
  { name: "typecheck", cmd: ["bun", "run", "typecheck"] },
  { name: "lint", cmd: ["bun", "run", "lint"] },
  { name: "lint:forbidden", cmd: ["bun", "run", "lint:forbidden"] },
  { name: "format:check", cmd: ["bun", "run", "format:check"] },
  { name: "test:unit", cmd: ["bun", "run", "test:unit"] },
  { name: "deps:up", cmd: ["docker", "compose", "up", "-d", "--wait"] },
  { name: "wait-for-deps", cmd: ["bun", "run", "scripts/wait-for-deps.ts"] },
  { name: "test:integration", cmd: ["bun", "run", "test:integration"] },
];

for (const step of steps) {
  console.log(`\n=== ${step.name} ===`);
  const proc = Bun.spawn(step.cmd, {
    stdout: "inherit",
    stderr: "inherit",
    cwd: import.meta.dir + "/..",
  });
  const code = await proc.exited;
  if (code !== 0) {
    console.error(`\nFAIL ${step.name} (exit ${code})`);
    process.exit(code);
  }
  console.log(`PASS ${step.name}`);
}

console.log("\nAll checks passed.");
