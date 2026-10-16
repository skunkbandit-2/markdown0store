# Markdown Store Agent Notes

## Purpose and boundaries

- This package is the reusable filesystem/Markdown layer intended for receipt-platform and tor-crawler.
- Keep it domain-neutral: app-specific record schemas, crawl/receipt workflows, UI, agent guidance, and script execution belong in consumers or optional add-ons.
- Preserve small seams: `FrontmatterCodec` in `src/frontmatter.ts`, file operations in `src/store.ts`, and link helpers in `src/links.ts`. Add new capabilities as separate modules behind explicit interfaces rather than growing one catch-all class.
- Frontmatter format selection is explicit. YAML is implemented with `gray-matter`; do not hand-roll YAML parsing or infer a format from file contents.

## Data and safety

- Business records remain editable files. This library does not introduce a database or own application data.
- Store paths are relative to the configured root. Keep traversal and existing symlink escape checks in `MarkdownStore.resolve` covered by tests.
- Writes validate metadata first and replace files through a same-directory temporary file and rename. Do not replace this with direct writes to the target.
- Schemas are injected through the `parse(unknown)` contract; keep schema libraries optional.
- Links are resolved as file references only. Do not fetch links or execute discovered tools/scripts.

## Completion checks

- Run `bun run typecheck` and `bun test` in this package after changes.
- When changing the public API, update `README.md` usage and add tests for behavior and failure paths.
- Consumer migrations are separate work: change only the requested consumer repository, and run that consumer's tests there.
