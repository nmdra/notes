import { buildSync } from "esbuild"
import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { visit } from "unist-util-visit"

// Raw HAST children bypass the code handler, so Shiki never sees Mermaid fences.
// Text nodes, rather than interpolated HTML, preserve source safely.
/** @type {import('../types').QuartzTransformerPlugin} */
const Pele = () => ({
  name: "Pele",
  markdownPlugins() {
    return [
      () => /** @param {import('mdast').Root} tree */ (tree) => {
        visit(tree, "code", (node, index, parent) => {
          if (node.lang !== "mermaid" || index === undefined || !parent) return
          parent.children[index] = {
            type: "paragraph",
            children: [],
            position: node.position,
            data: {
              hName: "figure",
              hProperties: { className: ["pele-diagram"] },
              hChildren: [
                {
                  type: "element",
                  tagName: "pre",
                  properties: { className: ["pele-source"] },
                  // A child span prevents HTML's <pre> initial-newline stripping.
                  children: [
                    {
                      type: "element",
                      tagName: "span",
                      properties: {},
                      children: [{ type: "text", value: node.value }],
                    },
                  ],
                },
              ],
            },
          }
        })
      },
    ]
  },
  externalResources() {
    const script = buildSync({
      entryPoints: [fileURLToPath(new URL("./pele.inline.ts", import.meta.url))],
      bundle: true,
      format: "iife",
      minify: true,
      platform: "browser",
      target: "es2020",
      write: false,
    }).outputFiles[0].text
    // Quartz externalizes these resources into content-hashed local files.
    return {
      js: [{ script, contentType: "inline", loadTime: "afterDOMReady" }],
      css: [
        { content: readFileSync(new URL("./pele.scss", import.meta.url), "utf8"), inline: true },
      ],
    }
  },
})

export default Pele
