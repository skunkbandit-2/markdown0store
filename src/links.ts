import * as path from "node:path";
import type { MarkdownStore } from "./store.js";

export type MarkdownLink =
  | { kind: "external"; href: string }
  | { kind: "local"; path: string; search: string; hash: string };

/** Resolve a Markdown link against a document without allowing store-root escape. */
export function resolveMarkdownLink(
  store: MarkdownStore,
  fromDocument: string,
  href: string
): MarkdownLink {
  if (/^[a-z][a-z\d+.-]*:/i.test(href) || href.startsWith("//")) {
    return { kind: "external", href };
  }

  const sourcePath = store.resolve(fromDocument);
  const base = new URL(
    `https://markdown-store.invalid/${path.relative(store.root, sourcePath).split(path.sep).join("/")}`
  );
  const resolved = new URL(href, base);
  if (resolved.origin !== base.origin) return { kind: "external", href };

  let decodedPath: string;
  try {
    decodedPath = decodeURIComponent(resolved.pathname);
  } catch {
    throw new Error(`Invalid percent-encoding in Markdown link: ${href}`);
  }
  const relativePath = decodedPath.replace(/^\/+/, "");
  const absolutePath = store.resolve(
    relativePath || path.relative(store.root, sourcePath)
  );
  return {
    kind: "local",
    path: path.relative(store.root, absolutePath).split(path.sep).join("/"),
    search: resolved.search,
    hash: resolved.hash,
  };
}

/** Create a relative link between two store-relative paths. */
export function relativeMarkdownLink(
  store: MarkdownStore,
  fromDocument: string,
  toDocument: string,
  hash = ""
): string {
  const from = store.resolve(fromDocument);
  const to = store.resolve(toDocument);
  const relative = path
    .relative(path.dirname(from), to)
    .split(path.sep)
    .join("/");
  const encoded = relative.split("/").map(encodeURIComponent).join("/");
  const linkPath = encoded.startsWith(".") ? encoded : `./${encoded}`;
  const fragment = hash ? (hash.startsWith("#") ? hash : `#${hash}`) : "";
  return `${linkPath}${fragment}`;
}
