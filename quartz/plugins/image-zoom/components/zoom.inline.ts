import mediumZoom from "medium-zoom"
import { selectZoomableImages } from "./selection.js"

const mediumZoomStyles = Array.from(document.head.querySelectorAll("style")).find((style) =>
  style.textContent?.includes(".medium-zoom-overlay"),
)
if (mediumZoomStyles) {
  mediumZoomStyles.setAttribute("data-persist", "")
  mediumZoomStyles.textContent += "\n.medium-zoom-overlay { backdrop-filter: blur(4px); }"
}

type ImageState = {
  attributes: Record<string, string | null>
  hadZoomClass: boolean
  onKeyDown: (event: KeyboardEvent) => void
}

const zoom = mediumZoom({
  background: "color-mix(in srgb, var(--light) 78%, transparent)",
})
const imageStates = new Map<HTMLImageElement, ImageState>()
const attachedImages = new Set<HTMLImageElement>()
let focusReturnTarget: HTMLImageElement | null = null
let closeButton: HTMLButtonElement | null = null
let closeAfterOpening = false
let cleaningUp = false

function setAttribute(image: HTMLImageElement, name: string, value: string | null) {
  if (value === null) image.removeAttribute(name)
  else image.setAttribute(name, value)
}

function focusElement(element: HTMLElement) {
  try {
    element.focus({ preventScroll: true })
  } catch {
    element.focus()
  }
}

function requestClose() {
  if (!zoom.getZoomedImage()) return
  closeAfterOpening = true
  void zoom.close()
}

function createCloseButton() {
  const button = document.createElement("button")
  button.type = "button"
  button.className = "medium-zoom-close"
  button.setAttribute("aria-label", "Close enlarged image")
  button.innerHTML = `<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18M6 6l12 12"/></svg>`
  button.addEventListener("click", (event) => {
    event.preventDefault()
    event.stopPropagation()
    requestClose()
  })
  document.body.appendChild(button)
  closeButton = button
}

function removeCloseButton() {
  closeButton?.remove()
  closeButton = null
}

function restoreImage(image: HTMLImageElement) {
  const state = imageStates.get(image)
  if (!state) return

  image.removeEventListener("keydown", state.onKeyDown)
  for (const [name, value] of Object.entries(state.attributes)) {
    setAttribute(image, name, value)
  }
  if (state.hadZoomClass) image.classList.add("medium-zoom-image")
  imageStates.delete(image)
}

function completeClose() {
  if (!zoom.getZoomedImage()) return

  // Finish an in-flight open transition before asking Medium Zoom to close.
  document.querySelector(".medium-zoom-image--opened")?.dispatchEvent(new Event("transitionend"))

  zoom.close()
  // SPA cleanup cannot wait for the CSS transition. Dispatch its completion so
  // Medium Zoom removes its clone/overlay and resets its active-image state.
  document.querySelector(".medium-zoom-image--opened")?.dispatchEvent(new Event("transitionend"))
}

function attachImage(image: HTMLImageElement) {
  if (imageStates.has(image)) return

  const attributes: ImageState["attributes"] = {
    tabindex: image.getAttribute("tabindex"),
    role: image.getAttribute("role"),
    "aria-label": image.getAttribute("aria-label"),
    "aria-keyshortcuts": image.getAttribute("aria-keyshortcuts"),
  }
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key !== "Enter" && event.key !== " ") return
    event.preventDefault()
    if (zoom.getZoomedImage()) return
    void zoom.open({ target: image })
  }

  imageStates.set(image, {
    attributes,
    hadZoomClass: image.classList.contains("medium-zoom-image"),
    onKeyDown,
  })
  image.setAttribute("tabindex", "0")
  image.setAttribute("role", "button")
  image.setAttribute("aria-label", image.alt ? `Enlarge image: ${image.alt}` : "Enlarge image")
  image.setAttribute("aria-keyshortcuts", "Enter Space")
  image.addEventListener("keydown", onKeyDown)
  zoom.attach(image)
  attachedImages.add(image)
}

function detachImage(image: HTMLImageElement) {
  zoom.detach(image)
  restoreImage(image)
  attachedImages.delete(image)
}

zoom.on("opened", (event) => {
  const original = event.target as HTMLImageElement
  focusReturnTarget = original
  if (closeAfterOpening || cleaningUp) {
    closeAfterOpening = false
    void zoom.close()
    return
  }

  const image = document.querySelector<HTMLImageElement>(".medium-zoom-image--opened")
  if (!image) return

  image.setAttribute("tabindex", "0")
  image.setAttribute("role", "img")
  image.setAttribute("aria-label", original.alt || "Enlarged image")
  createCloseButton()
  focusElement(image)
})

zoom.on("closed", (event) => {
  closeAfterOpening = false
  removeCloseButton()
  const original = event.target as HTMLImageElement
  if (focusReturnTarget !== original) return

  focusReturnTarget = null
  if (!cleaningUp && original.isConnected) focusElement(original)
})

document.addEventListener(
  "keydown",
  (event) => {
    if (
      event.altKey ||
      event.shiftKey ||
      (!event.ctrlKey && !event.metaKey) ||
      (event.key !== "k" && event.key !== "g")
    ) {
      return
    }
    if (zoom.getZoomedImage()) completeClose()
  },
  true,
)

document.addEventListener("keydown", (event) => {
  if (event.key !== "Tab" || !zoom.getZoomedImage()) return
  const image = document.querySelector<HTMLImageElement>(".medium-zoom-image--opened")
  if (!image) return
  event.preventDefault()
  if (document.activeElement === image && closeButton) focusElement(closeButton)
  else focusElement(image)
})

function refreshImages() {
  const nextImages = new Set(selectZoomableImages(document))
  const staleImages = [...attachedImages].filter((image) => !nextImages.has(image))

  if (staleImages.some((image) => image === zoom.getZoomedImage())) completeClose()
  for (const image of staleImages) detachImage(image)
  for (const image of nextImages) attachImage(image)

  const windowWithCleanup = window as Window & {
    addCleanup?: (callback: () => void) => void
  }
  windowWithCleanup.addCleanup?.(cleanupPage)
}

function cleanupPage() {
  cleaningUp = true
  focusReturnTarget = null
  try {
    completeClose()
    for (const image of [...attachedImages]) detachImage(image)
  } finally {
    cleaningUp = false
  }
}

document.addEventListener("keyup", (event) => {
  if (event.key === "Escape" || event.key === "Esc") requestClose()
})
document.addEventListener("nav", refreshImages)
document.addEventListener("render", refreshImages)
