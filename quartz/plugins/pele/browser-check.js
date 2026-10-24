// Run against a local built site using:
// playwright-cli -s=pele run-code --filename=quartz/plugins/pele/browser-check.js
async function checkPele(page) {
  const base = "http://127.0.0.1:8080"
  const check = (condition, message) => {
    if (!condition) throw new Error(message)
  }
  const pageErrors = []
  const remoteRendererRequests = []
  const onError = (error) => pageErrors.push(error.name)
  const onRequest = (request) => {
    if (
      /https:\/\/(?:cdnjs\.cloudflare\.com|cdn\.jsdelivr\.net)\/.*(?:mermaid|pele)/.test(
        request.url(),
      )
    ) {
      remoteRendererRequests.push(true)
    }
  }
  page.on("pageerror", onError)
  page.on("request", onRequest)
  try {
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto(base, { waitUntil: "domcontentloaded" })
    await page.context().grantPermissions(["clipboard-read", "clipboard-write"])
    await page.emulateMedia({ reducedMotion: "reduce" })
    const source = '\nflowchart LR\n  A["Read<br/>source & test"] --> B[Render]\n'
    await page.evaluate((source) => {
      const host = document.createElement("section")
      host.id = "pele-browser-fixture"
      for (const text of [
        source,
        "sequenceDiagram\n Alice->>Bob: Hello",
        "not a diagram <img src=x onerror=alert(1)>",
      ]) {
        const figure = document.createElement("figure")
        figure.className = "pele-diagram"
        const pre = document.createElement("pre")
        pre.className = "pele-source"
        const span = document.createElement("span")
        span.textContent = text
        pre.append(span)
        figure.append(pre)
        host.append(figure)
      }
      document.querySelector("article").replaceChildren(host)
    }, source)
    const figures = page.locator("#pele-browser-fixture > figure")
    await figures.first().locator(".pele-viewport > svg.pele").waitFor()
    await figures.nth(1).locator(".pele-viewport > svg.pele").waitFor()
    await figures.nth(2).locator(".pele-error").waitFor()
    check((await figures.nth(2).locator("img").count()) === 0, "Error inserted executable HTML")
    check(
      await figures.nth(2).locator("pre.pele-source").isVisible(),
      "Failed source is not selectable",
    )
    const copyControl = figures.first().getByRole("button", { name: "Copy diagram source" })
    const iconControls = await figures
      .first()
      .locator(".pele-toolbar button")
      .evaluateAll((buttons) =>
        buttons.map((button) => ({
          text: button.textContent.trim(),
          title: button.getAttribute("title"),
          label: button.getAttribute("aria-label"),
          iconHidden: button.querySelector("svg")?.getAttribute("aria-hidden"),
          width: button.getBoundingClientRect().width,
          height: button.getBoundingClientRect().height,
        })),
      )
    check(
      iconControls.length === 2 &&
        iconControls.every(
          (control) =>
            control.text === "" &&
            control.title === control.label &&
            control.iconHidden === "true" &&
            control.width === 28 &&
            control.height === 28,
        ),
      "Toolbar controls are not compact accessible icons",
    )
    check(
      await figures
        .first()
        .locator(".pele-toolbar")
        .evaluate(
          (toolbar) =>
            getComputedStyle(toolbar).justifyContent === "flex-end" &&
            getComputedStyle(toolbar).borderBottomWidth === "0px",
        ),
      "Toolbar is not compact and right-aligned",
    )
    await copyControl.click()
    await figures
      .first()
      .getByRole("status")
      .filter({ hasText: "Source copied." })
      .waitFor({ state: "attached" })
    check(
      (await copyControl.locator('svg[data-icon="check"]').count()) === 1,
      "Copy did not show a checkmark",
    )
    check(
      (await page.evaluate(() => navigator.clipboard.readText())) === source,
      "Copy changed raw source",
    )
    const viewport = figures.first().locator(".pele-viewport")
    const svg = viewport.locator(":scope > svg.pele")
    const nativeSize = await viewport
      .getByRole("button", { name: "Zoom in", exact: true })
      .boundingBox()
    check(
      nativeSize.width === 24 && nativeSize.height === 24,
      "Native Pele zoom sizing was overridden",
    )
    const beforeZoom = await svg.getAttribute("style")
    await viewport.getByRole("button", { name: "Zoom in", exact: true }).click()
    check((await svg.getAttribute("style")) !== beforeZoom, "Zoom in had no effect")
    await svg.focus()
    const beforePan = await svg.getAttribute("viewBox")
    await page.keyboard.press("ArrowRight")
    check((await svg.getAttribute("viewBox")) !== beforePan, "Keyboard pan had no effect")
    check(
      await viewport.evaluate((el) => {
        const bounds = el.getBoundingClientRect()
        return [...el.querySelectorAll("button")].every((button) => {
          const box = button.getBoundingClientRect()
          return box.height === 0 || (box.top >= bounds.top && box.bottom <= bounds.bottom)
        })
      }),
      "Zoom controls are clipped by a short diagram viewport",
    )
    await viewport.getByRole("button", { name: "Reset zoom" }).click()
    const viewports = []
    for (const width of [320, 375, 768, 1440]) {
      await page.setViewportSize({ width, height: 900 })
      await page.waitForTimeout(200)
      for (const theme of ["light", "dark"]) {
        const result = await page.evaluate(async (theme) => {
          document.documentElement.setAttribute("saved-theme", theme)
          const svg = document.querySelector("#pele-browser-fixture svg.pele")
          const previous = svg
          await new Promise((resolve) =>
            requestAnimationFrame(() => requestAnimationFrame(resolve)),
          )
          const figure = document.querySelector("#pele-browser-fixture > figure")
          return {
            width: Math.round(figure.getBoundingClientRect().width),
            viewport: innerWidth,
            svgWidth: svg.getBoundingClientRect().width,
            sameSvg: previous === document.querySelector("#pele-browser-fixture svg.pele"),
            color: getComputedStyle(svg).getPropertyValue("--pele-fg").trim(),
          }
        }, theme)
        check(result.width <= width && result.svgWidth > 0, `Invalid diagram geometry at ${width}`)
        check(result.sameSvg, "Theme color change replaced the SVG")
        viewports.push({ width, theme, color: result.color })
      }
    }
    check(viewports[0].color !== viewports[1].color, "Theme did not change diagram colors")
    const expand = figures.first().getByRole("button", { name: "Expand diagram" })
    await expand.click()
    const dialog = page.getByRole("dialog", { name: "Expanded diagram" })
    await dialog.locator(".pele-viewport > svg.pele").waitFor()
    check(
      (await dialog.getByRole("button", { name: "Close expanded diagram" }).textContent()) === "",
      "Dialog close control is not icon-only",
    )
    check(
      await dialog
        .getByRole("button", { name: "Close expanded diagram" })
        .evaluate((el) => el === document.activeElement),
      "Dialog did not focus close control",
    )
    await dialog.getByRole("button", { name: "Zoom in", exact: true }).click()
    await dialog.locator(".pele-viewport > svg.pele").focus()
    await page.keyboard.press("Escape")
    await dialog.waitFor({ state: "detached" })
    check(
      await expand.evaluate((el) => el === document.activeElement),
      "Dialog did not restore focus",
    )
    await page.evaluate(() => {
      const host = document.querySelector("#pele-browser-fixture")
      host.append(host.firstElementChild.cloneNode(true))
      document.dispatchEvent(new CustomEvent("render"))
      document.dispatchEvent(new CustomEvent("nav"))
    })
    await figures.nth(3).locator(".pele-viewport > svg.pele").waitFor()
    check(
      (await figures.nth(3).locator(".pele-toolbar").count()) === 1,
      "Clone has duplicate controls",
    )
    await figures.nth(3).getByRole("button", { name: "Copy diagram source" }).click()
    check(
      (await page.evaluate(() => navigator.clipboard.readText())) === source,
      "Cloned source changed",
    )
    await expand.click()
    await page.evaluate(async () => window.spaNavigate(new URL("/", location.href)))
    check((await page.locator("dialog.pele-dialog").count()) === 0, "SPA navigation left a modal")
    check(
      (await page.locator("#pele-browser-fixture").count()) === 0,
      "SPA navigation left fixture DOM",
    )
    // A fresh dynamic figure must mount after SPA cleanup.
    await page.evaluate(() => {
      const figure = document.createElement("figure")
      figure.className = "pele-diagram"
      const pre = document.createElement("pre")
      pre.className = "pele-source"
      pre.textContent = "graph TD\n A --> B"
      figure.append(pre)
      document.querySelector("article").append(figure)
    })
    await page.locator("figure.pele-diagram .pele-viewport > svg.pele").first().waitFor()
    check(remoteRendererRequests.length === 0, "A renderer was fetched from a CDN")
    check(pageErrors.length === 0, "Uncaught browser errors")
    return {
      passed: true,
      viewportThemeChecks: viewports.length,
      checks: [
        "compact-accessible-icons",
        "native-zoom-sizing",
        "copy-checkmark",
        "source-copy",
        "safe-errors",
        "zoom-reset",
        "responsive-layout",
        "theme-without-rerender",
        "modal-escape-focus",
        "clone-remount",
        "SPA-cleanup",
        "no-renderer-CDN",
        "no-page-errors",
      ],
    }
  } finally {
    page.off("pageerror", onError)
    page.off("request", onRequest)
  }
}
