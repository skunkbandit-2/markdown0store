import { describe, expect, test } from "bun:test";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import {
  MarkdownStore,
  relativeMarkdownLink,
  resolveMarkdownLink,
  yamlFrontmatterCodec,
} from "../src/index.js";

function temporaryDirectory(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "markdown-store-test-"));
}

const pageSchema = {
  parse(value: unknown): { title: string; tags: string[] } {
    if (typeof value !== "object" || value === null)
      throw new TypeError("Expected object");
    const record = value as Record<string, unknown>;
    if (typeof record.title !== "string") throw new TypeError("Expected title");
    if (
      !Array.isArray(record.tags) ||
      !record.tags.every((tag) => typeof tag === "string")
    ) {
      throw new TypeError("Expected string tags");
    }
    return { title: record.title, tags: record.tags };
  },
};

describe("YAML frontmatter codec", () => {
  test("round-trips nested YAML metadata and Markdown body", () => {
    const original = {
      frontmatter: {
        title: "An example",
        tags: ["indexer", "reviewed"],
        source: { url: "https://example.test/a", confidence: 0.9 },
      },
      body: "# Example\n\nA body with a --- separator inside text.\n",
    };
    const encoded = yamlFrontmatterCodec.stringify(original);
    expect(yamlFrontmatterCodec.parse(encoded)).toEqual(original);
  });

  test("returns undefined for Markdown without frontmatter", () => {
    expect(yamlFrontmatterCodec.parse("# Plain Markdown\n")).toBeUndefined();
  });

  test("rejects malformed YAML and non-mapping frontmatter", () => {
    expect(() => yamlFrontmatterCodec.parse("---\ntitle: [\n---\n")).toThrow();
    expect(() => yamlFrontmatterCodec.parse("---\n- item\n---\n")).toThrow(
      "mapping/object"
    );
  });
});

describe("MarkdownStore", () => {
  test("uses a configured schema on read and write and discovers files", () => {
    const root = temporaryDirectory();
    try {
      const store = new MarkdownStore({ root, codec: yamlFrontmatterCodec });
      store.write(
        "stores/demo.md",
        {
          frontmatter: { title: "Demo", tags: ["market"] },
          body: "# Demo store\n",
        },
        pageSchema
      );
      expect(store.read("stores/demo.md", pageSchema)).toEqual({
        frontmatter: { title: "Demo", tags: ["market"] },
        body: "# Demo store\n",
      });
      expect(store.listMarkdown()).toEqual(["stores/demo.md"]);
      store.write(
        "stores/demo.md",
        {
          frontmatter: { title: "Updated", tags: ["checked"] },
          body: "# Updated\n",
        },
        pageSchema
      );
      expect(store.read("stores/demo.md", pageSchema)?.frontmatter.title).toBe(
        "Updated"
      );
      expect(() =>
        store.write(
          "stores/demo.md",
          {
            frontmatter: { tags: [] },
            body: "",
          } as unknown as {
            frontmatter: { title: string; tags: string[] };
            body: string;
          },
          pageSchema
        )
      ).toThrow("Expected title");
      expect(store.read("stores/demo.md", pageSchema)?.frontmatter.title).toBe(
        "Updated"
      );
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  test("rejects absolute, traversing, and symlink-escaping paths", () => {
    const root = temporaryDirectory();
    const outside = temporaryDirectory();
    try {
      const store = new MarkdownStore({ root, codec: yamlFrontmatterCodec });
      expect(() => store.resolve("../outside.md")).toThrow("escapes");
      expect(() => store.resolve(path.join(root, "outside.md"))).toThrow(
        "relative"
      );
      fs.symlinkSync(outside, path.join(root, "escape"), "dir");
      expect(() => store.resolve("escape/secret.md")).toThrow("symlink");
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
      fs.rmSync(outside, { recursive: true, force: true });
    }
  });
});

describe("Markdown links", () => {
  test("resolves local and external links without escaping the root", () => {
    const root = temporaryDirectory();
    try {
      const store = new MarkdownStore({ root, codec: yamlFrontmatterCodec });
      expect(
        resolveMarkdownLink(
          store,
          "stores/demo.md",
          "../catalogs/demo.md#items"
        )
      ).toEqual({
        kind: "local",
        path: "catalogs/demo.md",
        search: "",
        hash: "#items",
      });
      expect(
        resolveMarkdownLink(store, "stores/demo.md", "https://example.test/")
      ).toEqual({
        kind: "external",
        href: "https://example.test/",
      });
      expect(
        resolveMarkdownLink(store, "stores/demo.md", "../../outside.md")
      ).toEqual({
        kind: "local",
        path: "outside.md",
        search: "",
        hash: "",
      });
      expect(
        relativeMarkdownLink(
          store,
          "stores/demo.md",
          "catalogs/demo.md",
          "items"
        )
      ).toBe("../catalogs/demo.md#items");
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});
