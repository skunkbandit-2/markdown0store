import { describe, expect, test } from "bun:test";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import {
  MarkdownStore,
  serveMarkdownStore,
  yamlFrontmatterCodec,
} from "../src/index.js";

function temporaryDirectory(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "markdown-store-viewer-"));
}

describe("Markdown Store viewer", () => {
  test("serves searchable Markdown safely and follows local document links", async () => {
    const root = temporaryDirectory();
    const store = new MarkdownStore({ root, codec: yamlFrontmatterCodec });
    store.write("notes/one.md", {
      frontmatter: { title: "One" },
      body: "# First note\n\nA useful searchable phrase. [Next](two.md) <script>alert(1)</script> ![remote](https://example.test/image.png)\n",
    });
    store.write("notes/two.md", { frontmatter: {}, body: "# Second note\n" });
    const viewer = serveMarkdownStore({ store });
    try {
      const base = `http://${viewer.hostname}:${viewer.port}`;
      const index = await fetch(
        `${base}/api/documents?q=${encodeURIComponent("searchable phrase")}`
      );
      expect(index.status).toBe(200);
      expect(await index.json()).toMatchObject([
        { path: "notes/one.md", title: "First note" },
      ]);

      const rendered = await fetch(
        `${base}/api/document?path=${encodeURIComponent("notes/one.md")}`
      );
      const result = (await rendered.json()) as { html: string };
      expect(result.html).toContain('data-document="notes/two.md"');
      expect(result.html).not.toContain("<script>");
      expect(result.html).not.toContain("<img");

      const traversal = await fetch(
        `${base}/api/document?path=${encodeURIComponent("../outside.md")}`
      );
      expect(traversal.status).toBe(404);
    } finally {
      viewer.stop(true);
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  test("requires credentials when binding beyond loopback", () => {
    const store = new MarkdownStore({
      root: temporaryDirectory(),
      codec: yamlFrontmatterCodec,
    });
    expect(() => serveMarkdownStore({ store, hostname: "0.0.0.0" })).toThrow(
      "username and password"
    );
    fs.rmSync(store.root, { recursive: true, force: true });
  });
});
