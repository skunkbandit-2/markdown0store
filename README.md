# Markdown Store

A small TypeScript filesystem store for Markdown records with explicit frontmatter
codecs, optional metadata schemas, safe store-relative paths, atomic writes, file
discovery, and local-link resolution.

The package is intentionally split into small modules: `frontmatter.ts` owns the
codec contract, `store.ts` owns file operations, and `links.ts` owns link
resolution. `yamlFrontmatterCodec` is the first codec and uses `gray-matter`;
other frontmatter formats can be added by implementing `FrontmatterCodec`.

## Usage

```ts
import {
  MarkdownStore,
  yamlFrontmatterCodec,
  type MetadataSchema,
} from "@sknunkbandit-2/markdown-store";

const store = new MarkdownStore({
  root: "./knowledge",
  codec: yamlFrontmatterCodec, // explicit format; the store never guesses
});

const schema: MetadataSchema<{ title: string; labels: string[] }> = {
  parse(value) {
    // Use a project schema library here, or validate manually.
    if (typeof value !== "object" || value === null) throw new TypeError("Expected object");
    const record = value as Record<string, unknown>;
    if (typeof record.title !== "string" || !Array.isArray(record.labels)) {
      throw new TypeError("Invalid knowledge record");
    }
    return { title: record.title, labels: record.labels as string[] };
  },
};

store.write("stores/example.md", {
  frontmatter: { title: "Example", labels: ["reviewed"] },
  body: "# Example store\n",
}, schema);

const record = store.read("stores/example.md", schema);
const files = store.listMarkdown("stores");
```

`store.resolve("stores/example.md")` returns a checked absolute path. `read` returns
`undefined` when the file or frontmatter is absent; malformed frontmatter and
schema failures throw. `write` validates before touching disk and atomically
replaces the destination. Existing symlinks that lead outside the configured root
are rejected. `listMarkdown` returns sorted, root-relative POSIX paths.

`resolveMarkdownLink(store, fromDocument, href)` classifies external links and
resolves local paths, query strings, and fragments. `relativeMarkdownLink` builds
a relative local link. These helpers never fetch targets.

## Read-only web viewer

The optional Bun viewer lets you browse and search Markdown files without adding
application-specific fields to the store:

```ts
import { MarkdownStore, serveMarkdownStore, yamlFrontmatterCodec } from "@sknunkbandit-2/markdown-store";

const store = new MarkdownStore({ root: "./knowledge", codec: yamlFrontmatterCodec });
const viewer = serveMarkdownStore({ store, hostname: "127.0.0.1", port: 4317 });
console.log(`Open http://${viewer.hostname}:${viewer.port}`);
// viewer.stop();
```

It renders with `markdown-it` (raw HTML is disabled), searches document paths,
titles, and content, and follows local Markdown links within the store. It is
read-only. The default bind is loopback; binding beyond localhost requires both
`username` and `password` for HTTP Basic Auth. Use a trusted network or TLS
reverse proxy when exposing it remotely. See `../tor-crawler/src/web-ui.ts` for
a consumer example of a domain-specific archive UI built on similar primitives.

Schemas are injected at each read/write seam and can be Zod-compatible (`parse`)
without making this package depend on a schema library. Writes validate before
creating a same-directory temporary file and renaming it over the destination.

## Deliberate scope

This package does not own application schemas, crawl/generation workflows, AI
instructions, web UI, script execution, or indexes. Add-ons should compose the
store rather than expand this core into a domain framework prematurely. Source
images and other binary artifacts remain files; Markdown frontmatter can link to
them by path and provenance.

For current implementation status, known limitations, and the next consumer
integration steps, see [`WORKING-NOTE.md`](WORKING-NOTE.md).
