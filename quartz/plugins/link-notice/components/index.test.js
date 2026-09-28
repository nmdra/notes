import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { test } from "node:test"
import { runInNewContext } from "node:vm"
import { LinkNotice } from "./index.js"

const home = readFileSync(new URL("../../../../templates/index.md", import.meta.url), "utf8")
const topicRoutes = [...home.matchAll(/<a class="home-topic" href="([^"]+)"/g)].map((m) => m[1])

function setup() {
  let click
  let notice
  const document = {
    body: {
      dataset: { slug: "index" },
      appendChild(element) {
        notice = element
      },
    },
    addEventListener(type, listener) {
      if (type === "click") click = listener
    },
    getElementById() {
      return notice
    },
    createElement() {
      return {
        classList: { add() {}, remove() {} },
        setAttribute() {},
      }
    },
  }
  runInNewContext(LinkNotice().afterDOMLoaded, {
    document,
    location: { href: "https://notes.nimendra.online/" },
    URL,
    window: { clearTimeout() {}, setTimeout: () => 1 },
  })

  return (href) => {
    let blocked = false
    const anchor = {
      getAttribute: () => href,
      classList: { contains: (name) => name === "home-topic" || name === "broken" },
      closest: (selector) => (selector === ".home-topics" ? {} : null),
    }
    click({
      button: 0,
      target: { closest: () => anchor },
      preventDefault() {
        blocked = true
      },
      stopPropagation() {},
    })
    return blocked
  }
}

test("all homepage topic routes bypass the false broken-link notice", () => {
  assert.ok(topicRoutes.length > 0)
  const click = setup()
  for (const href of topicRoutes) {
    assert.equal(click(href), false, `${href} was blocked`)
  }
})

test("unlisted and blocked paths still show the notice", () => {
  const click = setup()
  assert.equal(click("/unpublished/"), true)
  assert.equal(click("/document.pdf"), true)
})
