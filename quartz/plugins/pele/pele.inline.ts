import { mount, type Mounted } from "pele"

// Keep the source node intact. Popovers can clone an already enhanced figure, so
// generated DOM is never used as the source or as proof that a mount is live.
const selector = "figure.pele-diagram"
const diagrams = new Map<HTMLElement, () => void>()
let observer: MutationObserver | undefined
let cleanupRegistered = false
let nextId = 0
let scanQueued = false
let generation = 0

const iconPaths = {
  copy: "M8 8h12v12H8z M16 8V4H4v12h4",
  expand: "M8 3H3v5 M16 3h5v5 M21 16v5h-5 M8 21H3v-5",
  close: "M6 6l12 12 M18 6L6 18",
  check: "M5 12l4 4L19 6",
}

function setIcon(control: HTMLButtonElement, name: keyof typeof iconPaths) {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg")
  svg.setAttribute("viewBox", "0 0 24 24")
  svg.setAttribute("aria-hidden", "true")
  svg.setAttribute("focusable", "false")
  svg.setAttribute("fill", "none")
  svg.setAttribute("stroke", "currentColor")
  svg.setAttribute("stroke-width", "1.75")
  svg.setAttribute("stroke-linecap", "round")
  svg.setAttribute("stroke-linejoin", "round")
  svg.dataset.icon = name
  const path = document.createElementNS(svg.namespaceURI, "path")
  path.setAttribute("d", iconPaths[name])
  svg.append(path)
  control.replaceChildren(svg)
}

function button(label: string, icon: keyof typeof iconPaths): HTMLButtonElement {
  const control = document.createElement("button")
  control.type = "button"
  control.className = "pele-icon-button"
  control.title = label
  control.setAttribute("aria-label", label)
  setIcon(control, icon)
  return control
}

function enhance(figure: HTMLElement) {
  const sourceElement = figure.querySelector<HTMLPreElement>(":scope > pre.pele-source")
  if (!sourceElement) return
  const original = sourceElement
  const source = original.textContent ?? ""
  const wasHidden = original.hidden
  // Remove copied controls, SVG, and status from a previously mounted clone.
  for (const child of Array.from(figure.children)) {
    if (child !== original) child.remove()
  }
  original.hidden = true

  const events = new AbortController()
  let disposed = false
  let copyTimer: ReturnType<typeof setTimeout> | undefined
  const controls = document.createElement("div")
  controls.className = "pele-toolbar"
  const copy = button("Copy diagram source", "copy")
  const expand = button("Expand diagram", "expand")
  expand.setAttribute("aria-haspopup", "dialog")
  const status = document.createElement("span")
  status.className = "pele-status"
  status.setAttribute("role", "status")
  controls.append(copy, expand, status)
  const viewport = document.createElement("div")
  viewport.className = "pele-viewport"
  viewport.setAttribute("aria-label", "Diagram with zoom controls")
  figure.append(controls, viewport)

  const mounts = new Set<Mounted>()
  function render(target: HTMLElement): Mounted | undefined {
    const error = (reason: unknown) => {
      // Keep failed source selectable even when clipboard access is denied.
      original.hidden = false
      const message = document.createElement("p")
      message.className = "pele-error"
      message.setAttribute("role", "status")
      message.textContent = `Unable to render diagram: ${reason instanceof Error ? reason.message : "Invalid diagram source."}`
      target.replaceChildren(message)
    }
    try {
      const mounted = mount(target, source, {
        idPrefix: `quartz-pele-${++nextId}`,
        autoDirection: true,
        // Do not fetch source image URLs. Keep default link and size limits.
        images: false,
        // Use Pele's labelled buttons, keyboard zoom, pointer pan, and pinch zoom.
        zoom: {
          always: true,
          controls: true,
          labels: { zoomIn: "Zoom in", zoomOut: "Zoom out", reset: "Reset zoom" },
        },
        onError: error,
      })
      mounts.add(mounted)
      return mounted
    } catch (reason) {
      error(reason)
    }
  }
  render(viewport)

  copy.addEventListener(
    "click",
    async () => {
      clearTimeout(copyTimer)
      setIcon(copy, "copy")
      copy.title = "Copy diagram source"
      status.classList.remove("is-error")
      try {
        await navigator.clipboard.writeText(source)
        if (disposed) return
        setIcon(copy, "check")
        copy.title = "Source copied"
        status.textContent = "Source copied."
      } catch {
        if (disposed) return
        copy.title = "Copy failed"
        status.classList.add("is-error")
        status.textContent = "Copy failed. Check clipboard permissions."
      }
      copyTimer = setTimeout(() => {
        status.textContent = ""
        status.classList.remove("is-error")
        setIcon(copy, "copy")
        copy.title = "Copy diagram source"
      }, 3000)
    },
    { signal: events.signal },
  )

  let dialog: HTMLDialogElement | undefined
  let expanded: Mounted | undefined
  let dialogEvents: AbortController | undefined
  let returnFocus: HTMLElement | undefined
  function closeExpanded(restoreFocus = true) {
    dialogEvents?.abort()
    dialogEvents = undefined
    if (expanded) {
      expanded.destroy()
      mounts.delete(expanded)
      expanded = undefined
    }
    dialog?.remove()
    dialog = undefined
    if (restoreFocus && returnFocus?.isConnected) returnFocus.focus()
    returnFocus = undefined
  }
  expand.addEventListener(
    "click",
    () => {
      if (dialog) return
      returnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : expand
      dialogEvents = new AbortController()
      dialog = document.createElement("dialog")
      dialog.className = "pele-dialog"
      const title = document.createElement("h2")
      title.id = `quartz-pele-title-${++nextId}`
      title.textContent = "Expanded diagram"
      dialog.setAttribute("aria-labelledby", title.id)
      const header = document.createElement("div")
      header.className = "pele-dialog-header"
      const close = button("Close expanded diagram", "close")
      close.autofocus = true
      header.append(title, close)
      const largeViewport = document.createElement("div")
      largeViewport.className = "pele-viewport pele-expanded-viewport"
      largeViewport.setAttribute("aria-label", "Expanded diagram with zoom controls")
      dialog.append(header, largeViewport)
      document.body.append(dialog)
      close.addEventListener("click", () => dialog?.close(), { signal: dialogEvents.signal })
      dialog.addEventListener("close", () => closeExpanded(), {
        once: true,
        signal: dialogEvents.signal,
      })
      // Pele consumes Escape to reset a zoomed viewport. Capture it first so one
      // key press always dismisses the modal, even when the diagram has focus.
      dialog.addEventListener(
        "keydown",
        (event) => {
          if (event.key !== "Escape") return
          event.preventDefault()
          event.stopPropagation()
          dialog?.close()
        },
        { capture: true, signal: dialogEvents.signal },
      )
      // Native dialog handles focus containment. Mount only once it is visible.
      dialog.showModal()
      expanded = render(largeViewport)
    },
    { signal: events.signal },
  )

  diagrams.set(figure, () => {
    disposed = true
    events.abort()
    clearTimeout(copyTimer)
    closeExpanded(false)
    for (const mounted of mounts) mounted.destroy()
    mounts.clear()
    controls.remove()
    viewport.remove()
    original.hidden = wasHidden
  })
}

function scan() {
  for (const [figure, destroy] of diagrams) {
    if (!figure.isConnected) {
      destroy()
      diagrams.delete(figure)
    }
  }
  document.querySelectorAll<HTMLElement>(selector).forEach((figure) => {
    if (!diagrams.has(figure)) enhance(figure)
  })
}

function cleanup() {
  generation++
  scanQueued = false
  observer?.disconnect()
  observer = undefined
  for (const destroy of diagrams.values()) destroy()
  diagrams.clear()
  cleanupRegistered = false
}

function start() {
  if (!cleanupRegistered && typeof window.addCleanup === "function") {
    window.addCleanup(cleanup)
    cleanupRegistered = true
  }
  if (!observer) {
    observer = new MutationObserver(() => {
      if (scanQueued) return
      scanQueued = true
      const current = generation
      queueMicrotask(() => {
        if (current !== generation) return
        scanQueued = false
        scan()
      })
    })
    // Covers fetched popovers and dynamically inserted transclusions, including
    // clones of live figures. Removed figures release Pele's resize listeners.
    observer.observe(document.body, { childList: true, subtree: true })
  }
  scan()
}

// These two listeners intentionally live for the bundled script's lifetime;
// Quartz calls cleanup before replacing the body, then nav starts a fresh scope.
document.addEventListener("nav", start)
document.addEventListener("render", start)
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", start, { once: true })
} else {
  start()
}
