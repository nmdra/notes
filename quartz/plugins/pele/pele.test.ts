import assert from "node:assert/strict"
import test from "node:test"
import { readFileSync } from "node:fs"
import { render, PeleError } from "pele"
import { SyntaxHighlighting } from "@quartz-community/syntax-highlighting"
import { ObsidianFlavoredMarkdown } from "@quartz-community/obsidian-flavored-markdown"
import { VFile } from "vfile"
import { fromHtml } from "hast-util-from-html"
import { toJsxRuntime } from "hast-util-to-jsx-runtime"
import { Fragment, jsx, jsxs } from "preact/jsx-runtime"
import renderToString from "preact-render-to-string"
import { transform as transformCss } from "lightningcss"
import { unified } from "unified"
import remarkParse from "remark-parse"
import remarkRehype from "remark-rehype"
import { visit } from "unist-util-visit"
import type { Element, Root } from "hast"
import type { BuildCtx } from "../../util/ctx"
import Pele from "./index"

async function transform(markdown: string, highlight = false): Promise<Root> {
  const plugin = Pele()
  const processor = unified()
    .use(remarkParse)
    .use(plugin.markdownPlugins?.({} as BuildCtx) ?? [])
    .use(remarkRehype)
  if (highlight) {
    processor.use(SyntaxHighlighting().htmlPlugins?.({} as never) ?? [])
  }
  return (await processor.run(processor.parse(markdown))) as Root
}

function elements(tree: Root, tagName: string) {
  const result: Element[] = []
  visit(tree, "element", (node) => {
    if (node.tagName === tagName) result.push(node)
  })
  return result
}

function sourceChildren(pre: Element) {
  const span = pre.children[0]
  assert.equal(span.type, "element")
  assert.equal((span as Element).tagName, "span")
  return (span as Element).children.map((child) =>
    child.type === "text" ? { type: child.type, value: child.value } : child,
  )
}

test("Mermaid fences become dedicated containers with exact source as text", async () => {
  const source = 'flowchart LR\n  A["<b>A & B</b>"] --> C\n'
  const tree = await transform("```mermaid\n" + source + "```\n")
  const figure = elements(tree, "figure")[0]
  assert.deepEqual(figure.properties.className, ["pele-diagram"])
  const pre = elements(tree, "pre")[0]
  assert.deepEqual(pre.properties.className, ["pele-source"])
  // A fenced code node excludes only the final separator newline.
  assert.deepEqual(sourceChildren(pre), [{ type: "text", value: source.slice(0, -1) }])
  assert.equal(elements(tree, "code").length, 0)
  assert.equal(elements(tree, "b").length, 0)
})

test("Mermaid bypasses highlighting while other fenced code is highlighted", async () => {
  const tree = await transform(
    "```mermaid\nflowchart TD\n  A --> B\n```\n\n```js\nconst answer = 42\n```",
    true,
  )
  assert.equal(
    elements(tree, "figure").filter((n) => n.properties.className?.includes("pele-diagram")).length,
    1,
  )
  const code = elements(tree, "code")
  assert.equal(code.length, 1)
  assert.ok(elements(tree, "span").length > 0)
  const pre = elements(tree, "pre").find((n) => n.properties.className?.includes("pele-source"))!
  assert.deepEqual(sourceChildren(pre), [{ type: "text", value: "flowchart TD\n  A --> B" }])
})

const fixtures: { name: string; source: string }[] = JSON.parse(
  readFileSync(new URL("./fixtures/diagrams.json", import.meta.url), "utf8"),
)
for (const fixture of fixtures) {
  test(`Pele renders ${fixture.name} and the transformer preserves source`, async () => {
    assert.match(render(fixture.source).svg, /<svg\b/)
    const tree = await transform("```mermaid\n" + fixture.source + "\n```")
    assert.deepEqual(sourceChildren(elements(tree, "pre")[0]), [
      { type: "text", value: fixture.source },
    ])
  })
}

test("multiple Mermaid blocks have independent sources", async () => {
  const tree = await transform(
    "```mermaid\ngraph TD\n A --> B\n```\n\n```mermaid\ngraph LR\n C --> D\n```",
  )
  assert.equal(elements(tree, "figure").length, 2)
  assert.deepEqual(elements(tree, "pre").map(sourceChildren), [
    [{ type: "text", value: "graph TD\n A --> B" }],
    [{ type: "text", value: "graph LR\n C --> D" }],
  ])
})

test("invalid Mermaid remains available as source and Pele rejects it", async () => {
  const source = "this is not a diagram <img src=x onerror=alert(1)>"
  const tree = await transform("```mermaid\n" + source + "\n```")
  assert.deepEqual(sourceChildren(elements(tree, "pre")[0]), [{ type: "text", value: source }])
  assert.throws(() => render(source), PeleError)
  assert.equal(elements(tree, "img").length, 0)
})

test("leading and internal blank source lines survive serialized HTML parsing", async () => {
  const source = '\nflowchart TD\n\n  A["<tag> & text"] --> B\n'
  const tree = await transform("```mermaid\n" + source + "\n```")
  const html = renderToString(toJsxRuntime(tree, { Fragment, jsx, jsxs }))
  const reparsed = fromHtml(html, { fragment: true })
  assert.deepEqual(sourceChildren(elements(reparsed, "pre")[0]), [{ type: "text", value: source }])
})

test("local resources bundle without a CDN and CSS parses without fallback", () => {
  const resources = Pele().externalResources!({} as BuildCtx)!
  const script = resources.js![0]
  assert.equal(script.contentType, "inline")
  if (script.contentType === "inline") {
    assert.ok(script.script.length > 1000)
    assert.doesNotMatch(script.script, /https:\/\/(?:cdnjs|cdn\.jsdelivr)/)
  }
  const css = transformCss({
    filename: "pele.css",
    code: Buffer.from(resources.css![0].content),
    errorRecovery: false,
  })
  assert.ok(css.code.length > 100)
  assert.deepEqual(css.warnings, [])
})

test("OFM retains callouts, links, embeds and diagram block references", async () => {
  const ctx = { cfg: { configuration: { baseUrl: "example.test" } } } as BuildCtx
  const pele = Pele()
  const ofm = ObsidianFlavoredMarkdown({ mermaid: false })
  const syntax = SyntaxHighlighting()
  const source = 'flowchart TD\n  A["<b>A & B</b>"] --> C'
  const file = new VFile({
    value: [
      "> [!note] Diagram\n> ```mermaid\n> graph LR\n>  A --> B\n> ```",
      "```mermaid\n" + source + "\n```\n^diagram-block",
      "[[Target Note]]",
      "![[Target Note#Heading]]",
      "![[Target Note#^diagram-block]]",
      "![[Target Note]]",
      "```js\nconst answer = 42\n```",
    ].join("\n\n"),
  })
  file.data.slug = "fixture" as never
  const processor = unified()
    .use(remarkParse)
    .use(pele.markdownPlugins!(ctx))
    .use(ofm.markdownPlugins!(ctx as never))
    .use(remarkRehype, { allowDangerousHtml: true })
    .use(syntax.htmlPlugins!(ctx as never))
    .use(ofm.htmlPlugins!(ctx as never))
  const tree = (await processor.run(processor.parse(file), file)) as Root
  const figures = elements(tree, "figure").filter((n) =>
    n.properties.className?.includes("pele-diagram"),
  )
  assert.equal(figures.length, 2)
  assert.deepEqual(sourceChildren(elements({ type: "root", children: [figures[1]] }, "pre")[0]), [
    { type: "text", value: source },
  ])
  assert.equal(figures[1].properties.id, "diagram-block")
  assert.ok(elements(tree, "blockquote").some((n) => n.properties.dataCallout === "note"))
  assert.ok(elements(tree, "a").some((n) => n.properties.href === "Target%20Note"))
  const embeds = elements(tree, "blockquote").filter((n) =>
    n.properties.className?.includes("transclude"),
  )
  assert.equal(embeds.length, 3)
  assert.deepEqual(
    embeds.map((n) => n.properties.dataBlock),
    ["#heading", "#^diagram-block", ""],
  )
  assert.ok(elements(tree, "code").some((n) => n.properties.dataLanguage === "js"))
})

test("Pele does not emit executable link schemes", () => {
  for (const url of ["javascript:alert(1)", "data:text/html,unsafe", "vbscript:msgbox(1)"]) {
    const svg = render(`flowchart TD\n  A[Link]\n  click A href "${url}"`).svg
    assert.doesNotMatch(svg, /(?:href|xlink:href)=["'](?:javascript|data|vbscript):/i)
  }
})
