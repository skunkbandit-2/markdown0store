# Temporary Working Note — Markdown Store

Updated at the end of the current implementation pass. Treat this as a handoff, not a settled release plan.

## Current state

- Standalone package lives at `/home/mina/projects/markdown-store`.
- Package name: `@sknunkbandit-2/markdown-store`; currently version `0.1.0`, private, TypeScript source exported directly for Bun consumers.
- Core files: `src/frontmatter.ts` (codec + YAML/gray-matter implementation), `src/store.ts` (file access, schema seam, safe paths, atomic replacement, discovery), `src/links.ts` (local/external link helpers), and `src/index.ts` (public exports).
- Uses `gray-matter` for frontmatter rather than custom delimiter/YAML parsing. The YAML codec is injected explicitly, leaving other formats replaceable through `FrontmatterCodec`.
- Application validation is injected through `MetadataSchema.parse(unknown)`; no schema library is required by the core.
- Read `AGENTS.md` before continuing package work; `README.md` is the API guide.

## Verification

Run from this directory:

```sh
bun run typecheck
bun test
```

These checks passed after the symlink-escape guard and tests were added. Re-run them before continuing; do not infer current status from this note if files changed afterwards.

## Known follow-up work

1. Continue reviewing the public API and rerun package checks after changes. A generic, read-only optional Bun web viewer is available in `src/viewer.ts`, using `markdown-it`; see `README.md` for usage.
2. Extend the optional viewer with optional password protection and archiving support. Define the intended archive behavior and keep both features opt-in before implementing them.
3. Keep domain-specific workflow/UI and `.agents`/callable tools outside this package; its generic store viewer is an optional exported module.

## Safety/behavior notes

- Store writes use a same-directory temporary file followed by rename; metadata validation happens before writes.
- Existing symlinks resolving outside the root are rejected. This is a local filesystem library, not a defense against a hostile process racing path changes between checks and file operations.
- Link resolution performs no network access. URL path normalization follows URL semantics; paths returned are still constrained to the store root.
- No automatic execution of scripts or discovered `.bin` tools is part of the core.
