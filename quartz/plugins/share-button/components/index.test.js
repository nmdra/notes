import assert from "node:assert/strict"
import { test } from "node:test"
import { runInNewContext } from "node:vm"
import render from "preact-render-to-string"
import { ShareButton } from "./index.js"

const script = ShareButton().afterDOMLoaded
const expected = "Public title\nhttps://public.example/base/a%20b"
const flush = async () => {
  for (let i = 0; i < 12; i++) await Promise.resolve()
}
const deferred = () => {
  let resolve, reject
  const promise = new Promise((yes, no) => {
    resolve = yes
    reject = no
  })
  return { promise, resolve, reject }
}

class Element {
  hidden = true
  textContent = ""
  value = ""
  attrs = new Map()
  listeners = new Map()
  setAttribute(key, value) {
    this.attrs.set(key, value)
  }
  removeAttribute(key) {
    this.attrs.delete(key)
  }
  addEventListener(type, fn) {
    const listeners = this.listeners.get(type) ?? new Set()
    listeners.add(fn)
    this.listeners.set(type, listeners)
  }
  removeEventListener(type, fn) {
    this.listeners.get(type)?.delete(fn)
  }
  dispatch(type) {
    for (const fn of this.listeners.get(type) ?? []) fn()
  }
  focus() {
    this.focused = true
  }
  select() {
    this.selected = true
  }
}
function makeRoot(preview = false) {
  const root = new Element()
  root.button = new Element()
  root.status = new Element()
  root.manual = new Element()
  root.field = new Element()
  root.querySelector = (selector) =>
    ({
      ".note-share-button": root.button,
      ".note-share-status": root.status,
      ".note-share-manual": root.manual,
      ".note-share-url": root.field,
    })[selector]
  root.closest = (selector) =>
    selector === ".popover"
      ? preview
        ? {}
        : null
      : {
          querySelector: () => ({ textContent: " Article fallback " }),
        }
  return root
}
function setup(navigator = {}, options = {}) {
  const root = makeRoot()
  const preview = makeRoot(true)
  const document = new Element()
  let roots = [root, preview]
  const metadata = {
    url: options.url ?? "https://public.example/base/a%20b?track=yes#heading",
    title: " Public title ",
  }
  document.head = {
    querySelector: (selector) => {
      const content = selector.includes("og:url") ? metadata.url : metadata.title
      return content == null ? null : { content }
    },
  }
  document.title = "Document title"
  document.querySelectorAll = (selector) => {
    assert.equal(selector, ".center > .page-header .note-share")
    return roots
  }
  let cleanups = []
  let nextTimer = 0
  const timers = new Map()
  const addCleanup = (fn) => cleanups.push(fn)
  const window = {
    addCleanup: options.cleanupReady === false ? undefined : addCleanup,
    setTimeout: (fn, delay) => {
      assert.equal(delay, 3000)
      timers.set(++nextTimer, fn)
      return nextTimer
    },
    clearTimeout: (id) => timers.delete(id),
  }
  runInNewContext(script, {
    document,
    navigator,
    URL,
    location: { href: options.location ?? "http://localhost:8080/local/note?q=1#part" },
    window,
  })
  return {
    root,
    preview,
    document,
    metadata,
    timers,
    click: () => root.button.dispatch("click"),
    cleanup: () => {
      const callbacks = cleanups
      cleanups = []
      callbacks.forEach((fn) => fn())
    },
    replace: (next) => {
      roots = [next, preview]
      document.dispatch("nav")
    },
    cleanupCount: () => cleanups.length,
    startQuartz: () => {
      window.addCleanup = addCleanup
      document.dispatch("nav")
    },
  }
}

test("early script loading waits for Quartz cleanup initialization", async () => {
  let calls = 0
  const s = setup(
    {
      clipboard: {
        writeText: () => {
          calls++
          return Promise.resolve()
        },
      },
    },
    { cleanupReady: false },
  )
  assert.equal(s.root.hidden, true)
  assert.equal(s.cleanupCount(), 0)
  s.document.dispatch("render")
  s.click()
  assert.equal(calls, 0)
  s.startQuartz()
  assert.equal(s.root.hidden, false)
  assert.equal(s.cleanupCount(), 1)
  s.click()
  await flush()
  assert.equal(calls, 1)
  assert.equal(s.root.status.textContent, "Link copied")
})

test("SSR is hidden with an accessible icon-only button and labeled manual text", () => {
  const component = ShareButton()
  const html = render(component())
  assert.match(html, /class="note-share" hidden/)
  assert.match(html, /type="button" aria-label="Copy note link" title="Copy note link"/)
  assert.match(html, /aria-hidden="true"/)
  assert.doesNotMatch(html, />Share</)
  assert.match(html, /role="status" aria-live="polite" aria-atomic="true"/)
  assert.match(html, /<label[^>]*hidden>Note title and URL<textarea[^>]*readonly/)
  assert.doesNotMatch(html, /disabled=/)
  assert.match(component.css, /min-height: 32px/)
  assert.match(component.css, /@media \(pointer: coarse\)/)
  assert.match(component.css, /min-height: 44px/)
  assert.match(component.css, /\.popover \.note-share/)
  assert.match(component.css, /display: none !important/)
  assert.match(component.css, /:focus-visible/)
})

test("always copies title plus public URL without reading native share APIs", async () => {
  let copied
  const navigator = {
    clipboard: {
      writeText: (text) => {
        copied = text
        return Promise.resolve()
      },
    },
  }
  for (const name of ["share", "canShare"])
    Object.defineProperty(navigator, name, {
      get() {
        assert.fail("Native API accessed")
      },
    })
  const s = setup(navigator)
  assert.equal(s.root.hidden, false)
  s.click()
  assert.equal(copied, expected)
  await flush()
  assert.equal(s.root.status.textContent, "Link copied")
  assert.equal(s.root.button.attrs.has("aria-disabled"), false)
})

test("clipboard starts synchronously, guards rapid clicks, waits for success, and permits retry", async () => {
  const operation = deferred()
  let calls = 0
  const s = setup({
    clipboard: {
      writeText: () => {
        calls++
        return operation.promise
      },
    },
  })
  s.click()
  s.click()
  assert.equal(calls, 1)
  assert.equal(s.root.button.attrs.get("aria-disabled"), "true")
  assert.equal(s.root.status.textContent, "")
  assert.equal(s.timers.size, 0)
  operation.resolve()
  await flush()
  assert.equal(s.root.status.textContent, "Link copied")
  assert.equal(s.root.button.attrs.has("aria-disabled"), false)
  for (const fn of s.timers.values()) fn()
  s.timers.clear()
  assert.equal(s.root.status.textContent, "")
  s.click()
  await flush()
  assert.equal(calls, 2)
  assert.equal(s.root.status.textContent, "Link copied")
})

for (const mode of ["absent", "throw", "reject"]) {
  test(`clipboard ${mode} reveals the same text for manual copy`, async () => {
    const navigator =
      mode === "absent"
        ? {}
        : {
            clipboard: {
              writeText: () => {
                if (mode === "throw") throw Error("Blocked")
                return Promise.reject(Error("Blocked"))
              },
            },
          }
    const s = setup(navigator)
    s.click()
    await flush()
    assert.equal(s.root.status.textContent, "Copy this link")
    assert.equal(s.root.manual.hidden, false)
    assert.equal(s.root.field.value, expected)
    assert.equal(s.root.field.focused, true)
    assert.equal(s.root.field.selected, true)
    assert.equal(s.root.button.attrs.has("aria-disabled"), false)
    navigator.clipboard = { writeText: () => Promise.resolve() }
    s.click()
    await flush()
    assert.equal(s.root.manual.hidden, true)
    assert.equal(s.root.status.textContent, "Link copied")
  })
}

for (const url of [
  null,
  "not a url",
  "https://[",
  "javascript:alert(1)",
  "file:///note",
  "/relative",
]) {
  test(`invalid metadata ${url} uses clean current location and article title`, async () => {
    let copied
    const s = setup({
      clipboard: {
        writeText: (text) => {
          copied = text
          return Promise.resolve()
        },
      },
    })
    s.metadata.url = url
    s.metadata.title = " "
    s.click()
    assert.equal(copied, "Article fallback\nhttp://localhost:8080/local/note")
    await flush()
  })
}

test("invalid metadata and invalid location do not invoke the clipboard", () => {
  let calls = 0
  const s = setup(
    { clipboard: { writeText: () => calls++ } },
    { url: "bad", location: "file:///note" },
  )
  s.click()
  assert.equal(calls, 0)
  assert.equal(s.root.button.attrs.has("aria-disabled"), false)
})

test("metadata is read at click time and preserves encoded paths and base prefixes", async () => {
  let copied
  const s = setup({
    clipboard: {
      writeText: (text) => {
        copied = text
        return Promise.resolve()
      },
    },
  })
  s.metadata.url = "http://public.example/base/new%2Fpath/?x=2#y"
  s.metadata.title = "Next note"
  s.click()
  assert.equal(copied, "Next note\nhttp://public.example/base/new%2Fpath/")
  await flush()
})

test("document title is the final title fallback", async () => {
  let copied
  const s = setup({
    clipboard: {
      writeText: (text) => {
        copied = text
        return Promise.resolve()
      },
    },
  })
  s.metadata.title = null
  s.root.closest = () => null
  s.click()
  assert.equal(copied, "Document title\nhttps://public.example/base/a%20b")
  await flush()
})

test("repeated nav/render is idempotent and preview controls stay inactive", async () => {
  let calls = 0
  const s = setup({
    clipboard: {
      writeText: () => {
        calls++
        return Promise.resolve()
      },
    },
  })
  for (let i = 0; i < 5; i++) {
    s.document.dispatch("nav")
    s.document.dispatch("render")
  }
  assert.equal(s.cleanupCount(), 1)
  assert.equal(s.root.button.listeners.get("click").size, 1)
  assert.equal(s.preview.hidden, true)
  s.preview.button.dispatch("click")
  assert.equal(calls, 0)
  s.click()
  assert.equal(calls, 1)
  await flush()
  s.cleanup()
  assert.equal(s.root.hidden, true)
  assert.equal(s.root.button.listeners.get("click").size, 0)
  s.document.dispatch("render")
  s.click()
  assert.equal(calls, 2)
  await flush()
})

for (const outcome of ["resolve", "reject"]) {
  test(`cleanup ignores stale clipboard ${outcome}`, async () => {
    const operation = deferred()
    let copies = 0
    const s = setup({
      clipboard: {
        writeText: () => {
          copies++
          return operation.promise
        },
      },
    })
    s.click()
    s.cleanup()
    const next = makeRoot()
    s.replace(next)
    operation[outcome](outcome === "reject" ? Error("Blocked") : undefined)
    await flush()
    assert.equal(copies, 1)
    for (const root of [s.root, next]) {
      assert.equal(root.status.textContent, "")
      assert.equal(root.manual.hidden, true)
      assert.equal(root.field.focused, undefined)
    }
    assert.equal(s.timers.size, 0)
    assert.equal(next.hidden, false)
  })
}

test("cleanup cancels timers and stale callbacks cannot change the next note", async () => {
  const s = setup({ clipboard: { writeText: () => Promise.resolve() } })
  s.click()
  await flush()
  const oldTimer = [...s.timers.values()][0]
  s.cleanup()
  assert.equal(s.timers.size, 0)
  const next = makeRoot()
  s.replace(next)
  next.status.textContent = "New feedback"
  oldTimer()
  assert.equal(next.status.textContent, "New feedback")
  assert.equal(s.root.status.textContent, "")
})
