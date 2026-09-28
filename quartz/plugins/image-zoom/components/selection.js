const NOTE_IMAGE_SELECTOR = ".center article > .markdown-preview-view.markdown-rendered img"

export function selectZoomableImages(doc = document) {
  const slug = doc.body?.dataset.slug ?? ""
  if (slug === "index" || slug.startsWith("tags/")) return []
  return Array.from(doc.querySelectorAll(NOTE_IMAGE_SELECTOR)).filter(
    (image) => !image.closest("a, .section-ul, .page-listing, .home-topics, .recent-notes"),
  )
}
