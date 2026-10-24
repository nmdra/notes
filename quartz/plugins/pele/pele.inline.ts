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
  fullscreen: "M8 3H3v5 M16 3h5v5 M21 16v5h-5 M8 21H3v-5",
  restore: "M3 8h5V3 M21 8h-5V3 M16 21v-5h5 M8 21v-5H3",
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

function createStage() {
  const stage = document.createElement("div")
  stage.className = "pele-stage"
  const viewport = document.createElement("div")
  viewport.className = "pele-viewport"
  viewport.setAttribute("aria-label", "Diagram")
  const help = document.createElement("p")
  help.className = "pele-help"
  help.id = `quartz-pele-help-${++nextId}`
  help.hidden = true
  help.textContent = "Pinch or Ctrl/⌘ + scroll to zoom. Drag to pan."
  const zoomSlot = document.createElement("div")
  zoomSlot.className = "pele-zoom-slot"
  zoomSlot.hidden = true
  stage.append(zoomSlot, viewport, help)
  return { stage, viewport }
}

function placeZoomControls(target: HTMLElement) {
  const slot = target.parentElement?.querySelector<HTMLElement>(":scope > .pele-zoom-slot")
  const zoom =
    target.querySelector<HTMLElement>(":scope > .pele-zoom") ??
    slot?.querySelector<HTMLElement>(":scope > .pele-zoom")
  const zoomable = !!target.querySelector(":scope > svg.pele") && !!zoom && !zoom.hidden
  // Pele 1.9 reparents its panel on refresh and zoom. Keep the native buttons,
  // but place them outside the drawing area that Pele measures for pan/zoom.
  if (slot) {
    if (zoom && zoom.parentElement !== slot) slot.append(zoom)
    if (slot.hidden !== !zoomable) slot.hidden = !zoomable
  }
  return zoomable
}

function layoutDiagram(target: HTMLElement) {
  if (!target.isConnected || target.clientWidth === 0) return
  const svg = target.querySelector<SVGSVGElement>(":scope > svg.pele")
  if (!svg) return
  // Quartz's global text rule otherwise overrides SVG presentation fills.
  // Preserve explicit renderer/authored fills before restoring inheritance.
  for (const text of svg.querySelectorAll<SVGTextElement>("text[fill]")) {
    if (!text.style.fill) text.style.fill = text.getAttribute("fill")!
  }
  const zoomable = placeZoomControls(target)
  target.dataset.zoomable = String(zoomable)
  const help = target.parentElement?.querySelector<HTMLParagraphElement>(":scope > .pele-help")
  if (help) {
    help.hidden = !zoomable
    if (zoomable) svg.setAttribute("aria-describedby", help.id)
    else svg.removeAttribute("aria-describedby")
  }
  const style = getComputedStyle(target)
  const height =
    svg.getBoundingClientRect().height +
    (parseFloat(style.paddingTop) || 0) +
    (parseFloat(style.paddingBottom) || 0)
  // A stable mount height keeps native zoom from changing its own container size.
  target.style.setProperty("--pele-content-height", `${Math.ceil(height)}px`)
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
  const { stage, viewport } = createStage()
  figure.append(controls, stage)

  const mounts = new Set<Mounted>()
  const layoutObservers = new Set<MutationObserver | ResizeObserver>()
  function render(target: HTMLElement): Mounted | undefined {
    const error = (reason: unknown) => {
      // Keep failed source selectable even when clipboard access is denied.
      original.hidden = false
      const message = document.createElement("p")
      message.className = "pele-error"
      message.setAttribute("role", "status")
      message.textContent = `Unable to render diagram: ${reason instanceof Error ? reason.message : "Invalid diagram source."}`
      target.replaceChildren(message)
      target.style.removeProperty("--pele-content-height")
      const help = target.parentElement?.querySelector<HTMLElement>(":scope > .pele-help")
      if (help) help.hidden = true
      placeZoomControls(target)
    }
    try {
      const mounted = mount(target, source, {
        idPrefix: `quartz-pele-${++nextId}`,
        autoDirection: true,
        // Do not fetch source image URLs. Keep default link and size limits.
        images: false,
        // Native controls and gestures activate only when the SVG shrinks to fit.
        zoom: "auto",
        onRender: () => {
          // On the first render, Pele creates zoom after calling onRender.
          queueMicrotask(() => {
            if (!disposed) layoutDiagram(target)
          })
        },
        onError: error,
      })
      mounts.add(mounted)
      const targetStage = target.parentElement!
      targetStage.addEventListener(
        "click",
        (event) => {
          const control =
            event.target instanceof Element
              ? event.target.closest<HTMLButtonElement>(".pele-zoom button")
              : null
          if (!control) return
          queueMicrotask(() => {
            if (disposed || !control.isConnected) return
            placeZoomControls(target)
            // Reparenting a focused native button can blur it. Keep keyboard focus.
            const focus =
              control.disabled || getComputedStyle(control).display === "none"
                ? target.querySelector<SVGSVGElement>(":scope > svg.pele")
                : control
            focus?.focus({ preventScroll: true })
          })
        },
        { signal: events.signal },
      )
      const layoutObserver = new MutationObserver(() => {
        const zoomable = placeZoomControls(target)
        // Width-only auto-zoom changes can happen without a new render.
        if (target.dataset.zoomable !== String(zoomable)) layoutDiagram(target)
      })
      layoutObserver.observe(targetStage, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ["hidden"],
      })
      layoutObservers.add(layoutObserver)
      let width = target.clientWidth
      const resizeObserver = new ResizeObserver(() => {
        const nextWidth = target.clientWidth
        if (nextWidth === 0 || nextWidth === width) return
        width = nextWidth
        requestAnimationFrame(() => {
          if (disposed || !target.isConnected || target.clientWidth === 0) return
          // CSS can shrink a non-reflowing SVG without invoking onRender.
          mounted.refresh()
          layoutDiagram(target)
        })
      })
      resizeObserver.observe(target)
      layoutObservers.add(resizeObserver)
      return mounted
    } catch (reason) {
      error(reason)
    }
  }
  const inline = render(viewport)

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
  function disposeExpanded() {
    dialogEvents?.abort()
    dialogEvents = undefined
    if (expanded) {
      expanded.destroy()
      mounts.delete(expanded)
      expanded = undefined
    }
    if (document.fullscreenElement && dialog?.contains(document.fullscreenElement))
      void document.exitFullscreen().catch(() => {})
    dialog?.remove()
    dialog = undefined
    returnFocus = undefined
  }
  expand.addEventListener(
    "click",
    () => {
      returnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : expand
      if (dialog) {
        dialog.showModal()
        expanded?.refresh()
        dialog.querySelector<HTMLButtonElement>(".pele-dialog-close")?.focus()
        return
      }
      dialogEvents = new AbortController()
      dialog = document.createElement("dialog")
      dialog.className = "pele-dialog"
      dialog.style.setProperty(
        "--pele-dialog-width",
        `${Math.min(1440, Math.max(420, (inline?.result?.width ?? 1376) + 64))}px`,
      )
      // The Fullscreen API accepts this div, but rejects dialog elements.
      const content = document.createElement("div")
      content.className = "pele-dialog-content"
      dialog.append(content)
      const title = document.createElement("h2")
      title.id = `quartz-pele-title-${++nextId}`
      title.textContent = "Expanded diagram"
      dialog.setAttribute("aria-labelledby", title.id)
      const header = document.createElement("div")
      header.className = "pele-dialog-header"
      const close = button("Close expanded diagram", "close")
      close.autofocus = true
      close.classList.add("pele-dialog-close")
      const actions = document.createElement("div")
      actions.className = "pele-dialog-actions"
      if (document.fullscreenEnabled && content.requestFullscreen) {
        const fullscreen = button("Enter fullscreen", "fullscreen")
        fullscreen.addEventListener(
          "click",
          async () => {
            try {
              if (document.fullscreenElement === content) await document.exitFullscreen()
              else await content.requestFullscreen()
            } catch {
              fullscreen.title = "Fullscreen unavailable"
            }
          },
          { signal: dialogEvents.signal },
        )
        document.addEventListener(
          "fullscreenchange",
          () => {
            const active = document.fullscreenElement === content
            const label = active ? "Exit fullscreen" : "Enter fullscreen"
            fullscreen.setAttribute("aria-label", label)
            fullscreen.title = label
            setIcon(fullscreen, active ? "restore" : "fullscreen")
            requestAnimationFrame(() => {
              if (!disposed) expanded?.refresh()
            })
          },
          { signal: dialogEvents.signal },
        )
        actions.append(fullscreen)
      }
      actions.append(close)
      header.append(title, actions)
      const { stage: largeStage, viewport: largeViewport } = createStage()
      largeViewport.classList.add("pele-expanded-viewport")
      largeViewport.setAttribute("aria-label", "Expanded diagram")
      content.append(header, largeStage)
      document.body.append(dialog)
      close.addEventListener("click", () => dialog?.close(), { signal: dialogEvents.signal })
      dialog.addEventListener(
        "close",
        () => {
          if (document.fullscreenElement === content) void document.exitFullscreen().catch(() => {})
          if (returnFocus?.isConnected) returnFocus.focus()
          returnFocus = undefined
          // Keep this mount alive while hidden to retain its zoom and pan on reopen.
        },
        { signal: dialogEvents.signal },
      )
      // Dismiss before Pele consumes Escape to reset zoom. Browser fullscreen
      // can consume its first Escape before JavaScript receives the key.
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
    for (const observer of layoutObservers) observer.disconnect()
    layoutObservers.clear()
    disposeExpanded()
    for (const mounted of mounts) mounted.destroy()
    mounts.clear()
    controls.remove()
    stage.remove()
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
