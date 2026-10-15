import * as fs from "node:fs";
import * as path from "node:path";
import { randomUUID } from "node:crypto";
import {
  type FrontmatterCodec,
  type FrontmatterRecord,
  type MarkdownDocument,
  type MetadataSchema,
} from "./frontmatter.js";

export interface MarkdownStoreOptions {
  root: string;
  /** Required: format selection is explicit and never guessed per file. */
  codec: FrontmatterCodec;
}

/** Resolve missing path tails while canonicalizing existing directories/symlinks. */
function canonicalPath(filename: string): string {
  let cursor = path.resolve(filename);
  const missing: string[] = [];
  while (true) {
    try {
      fs.lstatSync(cursor);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      const parent = path.dirname(cursor);
      if (parent === cursor) throw error;
      missing.push(path.basename(cursor));
      cursor = parent;
      continue;
    }
    return path.resolve(fs.realpathSync(cursor), ...missing.reverse());
  }
}

/** File-backed Markdown records with explicit parsing and schema seams. */
export class MarkdownStore {
  readonly root: string;
  readonly codec: FrontmatterCodec;

  constructor(options: MarkdownStoreOptions) {
    this.root = path.resolve(options.root);
    this.codec = options.codec;
  }

  /** Resolve a store-relative path and reject traversal outside its root. */
  resolve(relativePath: string): string {
    if (path.isAbsolute(relativePath)) {
      throw new Error("Markdown store paths must be relative to the store root");
    }
    const resolved = path.resolve(this.root, relativePath);
    const relative = path.relative(this.root, resolved);
    if (relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
      throw new Error(`Path escapes Markdown store root: ${relativePath}`);
    }
    const realRoot = canonicalPath(this.root);
    const realTarget = canonicalPath(resolved);
    const realRelative = path.relative(realRoot, realTarget);
    if (
      realRelative === ".." ||
      realRelative.startsWith(`..${path.sep}`) ||
      path.isAbsolute(realRelative)
    ) {
      throw new Error(`Path escapes Markdown store root through a symlink: ${relativePath}`);
    }
    return resolved;
  }

  /** Read and optionally validate a record. Missing files/frontmatter return undefined. */
  read<T extends FrontmatterRecord = FrontmatterRecord>(
    relativePath: string,
    schema?: MetadataSchema<T>,
  ): MarkdownDocument<T> | undefined {
    const filename = this.resolve(relativePath);
    if (!fs.existsSync(filename)) return undefined;
    const parsed = this.codec.parse(fs.readFileSync(filename, "utf8"));
    if (!parsed) return undefined;
    const frontmatter = schema
      ? schema.parse(parsed.frontmatter)
      : parsed.frontmatter as T;
    return { frontmatter, body: parsed.body };
  }

  /** Validate, then atomically replace a Markdown record on the same filesystem. */
  write<T extends FrontmatterRecord>(
    relativePath: string,
    document: MarkdownDocument<T>,
    schema?: MetadataSchema<T>,
  ): void {
    const frontmatter = schema
      ? schema.parse(document.frontmatter)
      : document.frontmatter;
    const filename = this.resolve(relativePath);
    const directory = path.dirname(filename);
    fs.mkdirSync(directory, { recursive: true });
    const temporary = path.join(directory, `.${path.basename(filename)}.${randomUUID()}.tmp`);
    try {
      fs.writeFileSync(
        temporary,
        this.codec.stringify({ frontmatter, body: document.body }),
        { encoding: "utf8", flag: "wx" },
      );
      fs.renameSync(temporary, filename);
    } finally {
      try {
        fs.unlinkSync(temporary);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      }
    }
  }

  /** List Markdown files under a relative folder, sorted and returned root-relative. */
  listMarkdown(relativeDirectory = "."): string[] {
    const start = this.resolve(relativeDirectory);
    if (!fs.existsSync(start)) return [];
    const output: string[] = [];
    const visit = (directory: string): void => {
      for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
        const filename = path.join(directory, entry.name);
        if (entry.isDirectory()) visit(filename);
        else if (entry.isFile() && entry.name.toLowerCase().endsWith(".md")) {
          output.push(path.relative(this.root, filename).split(path.sep).join("/"));
        }
      }
    };
    if (fs.statSync(start).isDirectory()) visit(start);
    else if (fs.statSync(start).isFile() && start.toLowerCase().endsWith(".md")) {
      output.push(path.relative(this.root, start).split(path.sep).join("/"));
    }
    return output.sort();
  }
}
