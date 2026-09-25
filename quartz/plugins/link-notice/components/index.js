export const LinkNotice = () => {
  const Component = () => null
  Component.afterDOMLoaded = String.raw`
(function () {
  var ASSET_RE = /\.(pdf|docx?|xlsx?|pptx?|zip|epub|csv|ipynb|canvas)$/i
  var NOTICE_TEXT =
    "This page hasn't been published yet — it will become available once its content is published."

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
      // tag links carry the broken class (tag slugs are not in the slug
      // set) but resolve to real tag pages — let them navigate
      if (a.classList.contains("tag-link")) return
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
