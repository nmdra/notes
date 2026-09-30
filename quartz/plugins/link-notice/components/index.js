export const LinkNotice = () => {
  const Component = () => null
  Component.afterDOMLoaded = String.raw`
(function () {
  var ASSET_RE = /\.(pdf|docx?|xlsx?|pptx?|zip|epub|csv|ipynb)$/i
  var NOTICE_TEXT =
    "This page hasn't been published yet — it will become available once its content is published."
  // Folder pages are emitted without source slugs, so CrawlLinks can mark
  // valid routes as broken. Keep these route exceptions explicit.
  var PUBLISHED_FOLDER_ROUTES = new Set(["/00.fleeting-notes/ai-llm/papers/"])
  // Keep homepage topic routes in sync with the cards.
  var TOPIC_ROUTES = new Set([
    "/00.fleeting-notes/ai-llm/",
    "/02.areas/platform-engineering/",
    "/02.areas/devops/cac--and--iac/",
    "/02.areas/kubernetes/k8s-primer/",
    "/02.areas/software-engineering/go-notes/",
    "/00.fleeting-notes/site-reliability-engineering/",
  ])

  function showNotice(text) {
    var el = document.getElementById("link-notice")
    if (!el) {
      el = document.createElement("div")
      el.id = "link-notice"
      el.setAttribute("role", "status")
      document.body.appendChild(el)
    }
    el.textContent = text
    el.classList.add("show")
    window.clearTimeout(el._timer)
    el._timer = window.setTimeout(function () {
      el.classList.remove("show")
    }, 4500)
  }

  // capture phase: runs before Quartz's window-level SPA router, which
  // navigates without checking defaultPrevented
  document.addEventListener(
    "click",
    function (e) {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey)
        return
      var t = e.target
      var a = t && typeof t.closest === "function" ? t.closest("a") : null
      if (!a) return
      var href = a.getAttribute("href") || ""
      if (!href || href.charAt(0) === "#") return
      if (/^[a-z][a-z0-9+.-]*:/i.test(href)) return
      var path = href.split(/[?#]/)[0]
      // Let verified published routes bypass false broken-link markers; keep
      // notices for other unpublished destinations.
      if (a.classList.contains("tag-link")) return
      var destination = new URL(href, location.href).pathname
      if (PUBLISHED_FOLDER_ROUTES.has(destination)) return
      if (document.body.dataset.slug === "index" &&
          a.classList.contains("home-topic") &&
          a.closest(".home-topics") &&
          TOPIC_ROUTES.has(destination)) return
      if (a.classList.contains("broken") || ASSET_RE.test(path)) {
        e.preventDefault()
        e.stopPropagation()
        showNotice(NOTICE_TEXT)
      }
    },
    true,
  )
})()
`
  return Component
}
