import assert from "node:assert/strict"
import { test } from "node:test"
import { selectZoomableImages } from "./selection.js"

function image({ linked = false, listed = false } = {}) {
  return {
    closest(selector) {
      if (linked && selector.split(", ").includes("a")) return {}
      if (listed && selector.split(", ").includes(".section-ul")) return {}
      return null
    },
  }
}

function documentFor({ slug = "notes/example", images = [] } = {}) {
  return {
    body: { dataset: { slug } },
    querySelectorAll(selector) {
      assert.equal(selector, ".center article > .markdown-preview-view.markdown-rendered img")
      return images
    },
  }
}

test("selects standalone images from note markdown only", () => {
  const standalone = image()
  const linked = image({ linked: true })
  const card = image({ listed: true })

  assert.deepEqual(selectZoomableImages(documentFor({ images: [standalone, linked, card] })), [
    standalone,
  ])
})

test("skips the homepage and tag pages", () => {
  const candidate = image()

  assert.deepEqual(selectZoomableImages(documentFor({ slug: "index", images: [candidate] })), [])
  assert.deepEqual(
    selectZoomableImages(documentFor({ slug: "tags/books", images: [candidate] })),
    [],
  )
})

test("allows note-body images on real index notes without zooming listing cards", () => {
  const candidate = image()
  const listingCard = image({ listed: true })
  assert.deepEqual(
    selectZoomableImages(
      documentFor({ slug: "books/learning-go/index", images: [candidate, listingCard] }),
    ),
    [candidate],
  )
  assert.deepEqual(
    selectZoomableImages(documentFor({ slug: "areas/platform-engineering/index" })),
    [],
  )
})
