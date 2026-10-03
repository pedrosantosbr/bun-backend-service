/**
 * commit-msg hook (lefthook): the title must use a conventional prefix.
 *
 *   feat: …   fix: …   chore: …   docs: …   refactor: …   test: …
 *   perf: …   build: …   ci: …   style: …   revert: …
 *
 * An optional scope and breaking-change marker are allowed:
 * `feat(api): …`, `fix!: …`. Git-generated titles (Merge …, Revert "…",
 * fixup!/squash!/amend!) pass untouched.
 */
const TYPES = [
  "feat",
  "fix",
  "chore",
  "docs",
  "refactor",
  "test",
  "perf",
  "build",
  "ci",
  "style",
  "revert",
];
const CONVENTIONAL = new RegExp(
  `^(${TYPES.join("|")})(\\([a-z0-9._/-]+\\))?!?: \\S`,
);
const GENERATED = /^(Merge |Revert "|(fixup|squash|amend)! )/;

const file = process.argv[2];
if (!file) {
  console.error("usage: check-commit-msg.ts <commit-msg-file>");
  process.exit(2);
}
const title =
  (await Bun.file(file).text())
    .split("\n")
    .find((line) => line.trim() !== "" && !line.startsWith("#"))
    ?.trim() ?? "";

if (!GENERATED.test(title) && !CONVENTIONAL.test(title)) {
  console.error(
    [
      `✖ commit title must use a conventional prefix, got: "${title}"`,
      `  allowed: ${TYPES.map((t) => `${t}:`).join(" ")}`,
      "  optional scope / breaking marker: feat(api): …  fix!: …",
    ].join("\n"),
  );
  process.exit(1);
}
