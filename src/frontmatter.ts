import matter from "gray-matter";

export type FrontmatterRecord = Record<string, unknown>;

export interface MarkdownDocument<
  T extends FrontmatterRecord = FrontmatterRecord,
> {
  frontmatter: T;
  body: string;
}

/** Parser/serializer seam. A store must receive one codec explicitly. */
export interface FrontmatterCodec {
  readonly format: string;
  parse(source: string): MarkdownDocument | undefined;
  stringify(document: MarkdownDocument): string;
}

/** Small schema contract; Zod and similar schemas can satisfy it via `parse`. */
export interface MetadataSchema<T extends FrontmatterRecord> {
  parse(value: unknown): T;
}

function isRecord(value: unknown): value is FrontmatterRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** YAML frontmatter codec backed by gray-matter. */
export const yamlFrontmatterCodec: FrontmatterCodec = {
  format: "yaml",
  parse(source) {
    if (!matter.test(source, { language: "yaml" })) return undefined;
    const parsed = matter(source, { language: "yaml" });
    if (!isRecord(parsed.data)) {
      throw new TypeError("YAML frontmatter must be a mapping/object");
    }
    // gray-matter preserves the separator newline in content; remove one
    // conventional blank line so the codec round-trips our own writes cleanly.
    const body = parsed.content.replace(/^\r?\n/, "");
    return { frontmatter: parsed.data, body };
  },
  stringify(document) {
    if (!isRecord(document.frontmatter)) {
      throw new TypeError("Frontmatter must be a mapping/object");
    }
    const serialized = matter.stringify(document.body, document.frontmatter, {
      language: "yaml",
    });
    // gray-matter normalizes a final newline; preserve the caller's body exactly.
    return document.body.endsWith("\n") || !serialized.endsWith("\n")
      ? serialized
      : serialized.slice(0, -1);
  },
};
