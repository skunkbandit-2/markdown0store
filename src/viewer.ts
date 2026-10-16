import * as fs from "node:fs";
import * as path from "node:path";
import MarkdownIt from "markdown-it";
import { MarkdownStore } from "./store.js";
import { resolveMarkdownLink } from "./links.js";

export interface MarkdownStoreViewerOptions {
  store: MarkdownStore;
  hostname?: string;
  port?: number;
  username?: string;
  password?: string;
}

export interface MarkdownStoreViewer {
  readonly hostname: string;
  readonly port: number;
  stop(closeActiveConnections?: boolean): void;
}

interface DocumentSummary {
  path: string;
  title: string;
  excerpt: string;
  modified: string;
}

const page = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><title>Markdown Store</title>
<style>
:root{font:15px/1.6 ui-sans-serif,system-ui,sans-serif;color:#242b29;background:#f5f5f0}*{box-sizing:border-box}body{margin:0}.app{min-height:100dvh;display:grid;grid-template-columns:290px minmax(0,1fr)}aside{background:#e9ebe5;border-right:1px solid #d4d8d0;display:flex;flex-direction:column;min-height:100dvh}.head{padding:25px 22px 16px;border-bottom:1px solid #d4d8d0}.head h1{font:26px/1.15 Georgia,serif;font-weight:400;margin:0}.head p{font-size:12px;color:#69716c;margin:8px 0 0}.search{padding:14px 16px 8px}.search input{width:100%;padding:10px 11px;border:1px solid #cbd0c7;border-radius:3px;background:#fbfbf8;color:inherit;font:inherit}.count{padding:2px 18px 10px;color:#717973;font-size:12px}.files{overflow:auto;padding:0 10px 20px}.files button{display:block;width:100%;border:0;background:transparent;text-align:left;padding:9px 10px;border-radius:3px;color:inherit;cursor:pointer;overflow-wrap:anywhere}.files button:hover,.files button[aria-current=true]{background:#d9ded5}.files small{display:block;color:#717973;font-size:11px;margin-top:3px}.main{min-width:0}.toolbar{height:56px;border-bottom:1px solid #dfe1da;padding:0 5vw;display:flex;align-items:center;justify-content:space-between;color:#727972;font-size:12px}.document{max-width:900px;margin:0 auto;padding:56px 7vw 100px}.title{font:clamp(32px,5vw,54px)/1.1 Georgia,serif;font-weight:400;letter-spacing:-.025em;margin:0 0 38px;overflow-wrap:anywhere}.content{font-size:16px;line-height:1.8}.content h1,.content h2,.content h3{font-family:Georgia,serif;font-weight:400;line-height:1.25;margin:1.7em 0 .55em}.content h1{font-size:2em}.content h2{font-size:1.55em}.content h3{font-size:1.25em}.content a{color:#315f50;text-underline-offset:3px}.content blockquote{margin-left:0;padding-left:18px;border-left:2px solid #82977b;color:#59635d}.content pre{overflow:auto;padding:16px;background:#e9ebe5;border:1px solid #d4d8d0;border-radius:3px}.content code{font-family:ui-monospace,monospace;font-size:.9em}.content img{max-width:100%;height:auto}.content table{border-collapse:collapse;display:block;overflow:auto}.content th,.content td{border-bottom:1px solid #d4d8d0;padding:8px 12px;text-align:left}.empty{margin-top:15vh;color:#707872}.empty h2{font:34px Georgia,serif;font-weight:400;color:#242b29}.error{color:#a33225}button:focus-visible,input:focus-visible,a:focus-visible{outline:2px solid #315f50;outline-offset:2px}@media(max-width:650px){.app{grid-template-columns:1fr;grid-template-rows:minmax(190px,34vh) 1fr}.head{padding:15px 16px 10px}.head h1{font-size:22px}.search{padding:9px 12px}.files{padding-bottom:8px}.toolbar{height:44px;padding:0 16px}.document{padding:32px 19px 65px}}
</style></head><body><div class="app"><aside><header class="head"><h1>Markdown Store</h1><p>Browse files in this store</p></header><label class="search"><input id="search" type="search" placeholder="Search documents" aria-label="Search documents"></label><div id="count" class="count"></div><nav id="files" class="files" aria-label="Markdown documents"></nav></aside><main class="main"><div class="toolbar"><span id="location">Select a document</span><span id="state" role="status"></span></div><article id="document" class="document"><div class="empty"><h2>Your documents, in one place.</h2><p>Choose a Markdown file from the list or search its content.</p></div></article></main></div>
<script>
const files=document.querySelector('#files'),search=document.querySelector('#search'),count=document.querySelector('#count'),doc=document.querySelector('#document'),locationLabel=document.querySelector('#location'),state=document.querySelector('#state');let current='';
function esc(s){return String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
async function index(){state.textContent='Loading…';try{const r=await fetch('/api/documents?q='+encodeURIComponent(search.value));if(!r.ok)throw Error();const rows=await r.json();count.textContent=rows.length+' document'+(rows.length===1?'':'s');files.replaceChildren();for(const row of rows){const b=document.createElement('button');b.type='button';b.setAttribute('aria-current',row.path===current?'true':'false');b.innerHTML=esc(row.title)+'<small>'+esc(row.path)+'</small>';b.onclick=()=>openDocument(row.path);files.append(b)}state.textContent=''}catch{state.textContent='Could not load documents'}}
async function openDocument(name){state.textContent='Loading…';try{const r=await fetch('/api/document?path='+encodeURIComponent(name));if(!r.ok)throw Error();const data=await r.json();current=data.path;locationLabel.textContent=data.path;doc.innerHTML='<h1 class="title">'+esc(data.title)+'</h1><div class="content">'+data.html+'</div>';state.textContent=data.modified?'Modified '+new Date(data.modified).toLocaleString():'';await index()}catch{state.textContent='Document unavailable'}}
let timer;search.addEventListener('input',()=>{clearTimeout(timer);timer=setTimeout(index,120)});doc.addEventListener('click',e=>{const a=e.target.closest('a[data-document]');if(!a)return;e.preventDefault();openDocument(a.dataset.document)});index();
</script></body></html>`;

function isLoopback(hostname: string): boolean {
  return (
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "::1" ||
    hostname === "[::1]"
  );
}

function response(data: unknown, status = 200): Response {
  return Response.json(data, {
    status,
    headers: { "cache-control": "no-store" },
  });
}

function getDocument(
  store: MarkdownStore,
  relativePath: string
): { body: string; title: string } {
  const filename = store.resolve(relativePath);
  const source = fs.readFileSync(filename, "utf8");
  const parsed = store.codec.parse(source);
  const body = parsed?.body ?? source;
  const title =
    body.match(/^#\s+(.+)$/m)?.[1]?.trim() ||
    path.posix.basename(relativePath, ".md");
  return { body, title };
}

/** Start a read-only browser for a MarkdownStore. Bind to loopback unless protected by Basic Auth. */
export function serveMarkdownStore(
  options: MarkdownStoreViewerOptions
): MarkdownStoreViewer {
  const hostname = options.hostname ?? "127.0.0.1";
  const port = options.port ?? 0;
  if (!Number.isInteger(port) || port < 0 || port > 65535) {
    throw new RangeError("Viewer port must be an integer between 0 and 65535");
  }
  if (!isLoopback(hostname) && (!options.username || !options.password)) {
    throw new Error(
      "Set username and password before binding the Markdown Store viewer beyond localhost"
    );
  }

  const markdown = new MarkdownIt({
    html: false,
    linkify: true,
    typographer: true,
  });
  markdown.disable("image");
  const defaultLinkOpen =
    markdown.renderer.rules.link_open ??
    ((tokens, index, renderOptions, _env, renderer) =>
      renderer.renderToken(tokens, index, renderOptions));
  markdown.renderer.rules.link_open = (
    tokens,
    index,
    renderOptions,
    env,
    renderer
  ) => {
    const token = tokens[index];
    const rawHref = token.attrGet("href");
    const href = rawHref === null ? undefined : String(rawHref);
    const currentPath = env?.currentPath as string | undefined;
    if (href && currentPath) {
      try {
        const link = resolveMarkdownLink(options.store, currentPath, href);
        if (link.kind === "local" && link.path.toLowerCase().endsWith(".md")) {
          token.attrSet(
            "href",
            `/api/document?path=${encodeURIComponent(link.path)}${link.search}${link.hash}`
          );
          token.attrSet("data-document", link.path);
        } else if (link.kind === "external" && /^https?:/i.test(href)) {
          token.attrSet("target", "_blank");
          token.attrSet("rel", "noopener noreferrer");
        }
      } catch {
        token.attrSet("href", "#");
      }
    }
    return defaultLinkOpen(tokens, index, renderOptions, env, renderer);
  };

  const server = Bun.serve({
    hostname,
    port,
    fetch(request) {
      if (options.username && options.password) {
        const authorization = `Basic ${Buffer.from(`${options.username}:${options.password}`).toString("base64")}`;
        if (request.headers.get("authorization") !== authorization) {
          return new Response("Authentication required", {
            status: 401,
            headers: {
              "www-authenticate": 'Basic realm="Markdown Store"',
              "cache-control": "no-store",
            },
          });
        }
      }
      const url = new URL(request.url);
      if (url.pathname === "/")
        return new Response(page, {
          headers: {
            "content-type": "text/html; charset=utf-8",
            "cache-control": "no-store",
          },
        });
      if (url.pathname === "/api/documents") {
        const query = (url.searchParams.get("q") ?? "")
          .trim()
          .toLocaleLowerCase();
        const documents: DocumentSummary[] = [];
        for (const relativePath of options.store.listMarkdown()) {
          try {
            const { body, title } = getDocument(options.store, relativePath);
            const haystack =
              `${relativePath}\n${title}\n${body}`.toLocaleLowerCase();
            if (query && !haystack.includes(query)) continue;
            const excerpt = body
              .replace(/^#+\s.*$/gm, "")
              .replace(/!??\[([^\]]+)\]\([^)]+\)/g, "$1")
              .replace(/\s+/g, " ")
              .trim()
              .slice(0, 180);
            documents.push({
              path: relativePath,
              title,
              excerpt,
              modified: fs
                .statSync(options.store.resolve(relativePath))
                .mtime.toISOString(),
            });
          } catch {
            /* Ignore unreadable or malformed files in the index. */
          }
        }
        documents.sort((a, b) => a.path.localeCompare(b.path));
        return response(documents.slice(0, 1000));
      }
      if (url.pathname === "/api/document") {
        const relativePath = url.searchParams.get("path");
        if (!relativePath || !relativePath.toLowerCase().endsWith(".md"))
          return response({ error: "Document not found" }, 404);
        try {
          const filename = options.store.resolve(relativePath);
          if (!fs.statSync(filename).isFile())
            return response({ error: "Document not found" }, 404);
          const { body, title } = getDocument(options.store, relativePath);
          return response({
            path: relativePath,
            title,
            html: markdown.render(body, { currentPath: relativePath }),
            modified: fs.statSync(filename).mtime.toISOString(),
          });
        } catch {
          return response({ error: "Document not found" }, 404);
        }
      }
      return new Response("Not found", { status: 404 });
    },
  });
  return {
    hostname,
    port: server.port ?? port,
    stop: (closeActiveConnections) => server.stop(closeActiveConnections),
  };
}
