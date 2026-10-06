/// <reference path="../../../../globals.d.ts" />

const boundRoots = new WeakSet<HTMLElement>()

function publicUrl(value: string | undefined): string | undefined {
  if (!value) return
  try {
    const url = new URL(value)
    if (url.protocol !== "https:" && url.protocol !== "http:") return
    url.search = ""
    url.hash = ""
    return url.href
  } catch {
    return
  }
}

function initializeShareButtons() {
  // Component scripts can load before Quartz installs its cleanup hook.
  if (typeof window.addCleanup !== "function") return
  for (const root of document.querySelectorAll<HTMLElement>(".center > .page-header .note-share")) {
    if (root.closest(".popover") || boundRoots.has(root)) continue
    const button = root.querySelector<HTMLButtonElement>(".note-share-button")
    const status = root.querySelector<HTMLElement>(".note-share-status")
    const manual = root.querySelector<HTMLElement>(".note-share-manual")
    const field = root.querySelector<HTMLTextAreaElement>(".note-share-url")
    if (!button || !status || !manual || !field) continue

    let active = true
    let pending = false
    let timer: number | undefined
    const clearFeedback = () => {
      if (timer !== undefined) window.clearTimeout(timer)
      timer = undefined
      status.textContent = ""
      manual.hidden = true
    }
    const finish = () => {
      if (!active) return
      pending = false
      button.removeAttribute("aria-disabled")
    }
    const showManual = (text: string) => {
      if (!active) return
      field.value = text
      manual.hidden = false
      status.textContent = "Copy this link"
      field.focus()
      field.select()
    }
    const copy = async (text: string) => {
      if (!active) return
      try {
        if (!navigator.clipboard?.writeText) {
          showManual(text)
          return
        }
        await navigator.clipboard.writeText(text)
        if (!active) return
        status.textContent = "Link copied"
        timer = window.setTimeout(() => {
          if (active) status.textContent = ""
          timer = undefined
        }, 3000)
      } catch {
        showManual(text)
      }
    }
    const click = () => {
      if (!active || pending) return
      const url =
        publicUrl(
          document.head.querySelector<HTMLMetaElement>('meta[property="og:url"]')?.content,
        ) ?? publicUrl(location.href)
      if (!url) return
      const title =
        document.head.querySelector<HTMLMetaElement>('meta[property="og:title"]')?.content.trim() ||
        root.closest(".page-header")?.querySelector(".article-title")?.textContent?.trim() ||
        document.title
      pending = true
      button.setAttribute("aria-disabled", "true")
      clearFeedback()
      void copy(`${title}\n${url}`).finally(finish)
    }

    boundRoots.add(root)
    button.addEventListener("click", click)
    root.hidden = false
    window.addCleanup(() => {
      active = false
      pending = false
      button.removeEventListener("click", click)
      button.removeAttribute("aria-disabled")
      clearFeedback()
      field.value = ""
      root.hidden = true
      boundRoots.delete(root)
    })
  }
}

document.addEventListener("nav", initializeShareButtons)
document.addEventListener("render", initializeShareButtons)
initializeShareButtons()

export {}
