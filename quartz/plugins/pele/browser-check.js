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
    const source =
      '\nflowchart LR\n  A["Read<br/>source & test"] --> B[Render]\n  classDef authored fill:#fff,color:#820000;\n  class B authored\n'
    const wideSource = [
      "sequenceDiagram",
      ...Array.from({ length: 24 }, (_, i) => `participant P${i} as Service ${i + 1} coordinator`),
      "P0->>P23: Request with detailed routing metadata",
    ].join("\n")
    await page.evaluate(
      ({ source, wideSource }) => {
        const host = document.createElement("section")
        host.id = "pele-browser-fixture"
        for (const text of [
          source,
          "sequenceDiagram\n Alice->>Bob: Hello",
          "not a diagram <img src=x onerror=alert(1)>",
          wideSource,
          'pie title Example proportions\n "First category with a longer label" : 40\n "Second category" : 60',
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
      },
      { source, wideSource },
    )
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
          iconWidth: button.querySelector("svg")?.getBoundingClientRect().width,
          iconHeight: button.querySelector("svg")?.getBoundingClientRect().height,
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
            control.iconWidth === 16 &&
            control.iconHeight === 16 &&
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
    const smallViewport = figures.first().locator(".pele-stage")
    await figures.nth(3).locator(".pele-stage > .pele-viewport > svg.pele").waitFor()
    check(
      !(await smallViewport.getByRole("button", { name: "Zoom in", exact: true }).isVisible()),
      "Fitting small diagram has visible zoom controls",
    )
    check(
      !(await figures.first().locator(".pele-help").isVisible()),
      "Fitting small diagram has visible zoom help",
    )
    const viewport = figures.nth(3).locator(".pele-stage")
    const checkControlRow = async (target, context) => {
      await target.getByRole("button", { name: "Zoom in", exact: true }).waitFor()
      check(
        await target.evaluate((el) => {
          const mount = el.querySelector(":scope > .pele-viewport")
          const svg = mount.querySelector(":scope > svg.pele")
          const zoom = el.querySelector(":scope > .pele-zoom-slot > .pele-zoom")
          if (!svg || !zoom || zoom.hidden) return false
          const bounds = el.getBoundingClientRect()
          const controls = zoom.getBoundingClientRect()
          const diagram = svg.getBoundingClientRect()
          return (
            mount.firstElementChild === svg &&
            controls.bottom <= diagram.top + 0.5 &&
            controls.bottom <= mount.getBoundingClientRect().top + 0.5 &&
            controls.top >= bounds.top &&
            controls.bottom <= bounds.bottom &&
            controls.left >= bounds.left &&
            controls.right <= bounds.right &&
            [...zoom.querySelectorAll("button")].every((button) => {
              const box = button.getBoundingClientRect()
              return box.height === 0 || (box.width === 24 && box.height === 24)
            })
          )
        }),
        `Native control row overlaps the SVG, is clipped, or changed size: ${context}`,
      )
    }
    await checkControlRow(viewport, "initial wide diagram")
    const svg = viewport.locator(".pele-viewport > svg.pele")
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
    check(
      await viewport
        .getByRole("button", { name: "Zoom in", exact: true })
        .evaluate((el) => el === document.activeElement),
      "Native zoom button lost focus",
    )
    const beforeKeyboardZoom = await svg.getAttribute("viewBox")
    await page.keyboard.press("Enter")
    check(
      (await svg.getAttribute("viewBox")) !== beforeKeyboardZoom,
      "Native zoom button lost keyboard activation",
    )
    check(
      await viewport.locator(".pele-viewport").evaluate((el) => {
        const svg = el.querySelector(":scope > svg.pele").getBoundingClientRect()
        const pane = el.getBoundingClientRect()
        return svg.top >= pane.top - 1 && svg.bottom <= pane.bottom + 1
      }),
      "Short wide diagram is clipped after zoom",
    )
    await svg.focus()
    const beforePan = await svg.getAttribute("viewBox")
    await page.keyboard.press("ArrowRight")
    check((await svg.getAttribute("viewBox")) !== beforePan, "Keyboard pan had no effect")
    await checkControlRow(viewport, "after zoom and keyboard pan")
    await viewport.getByRole("button", { name: "Reset zoom" }).click()
    await checkControlRow(viewport, "after reset")
    const viewports = []
    for (const width of [320, 375, 768, 1440]) {
      await page.setViewportSize({ width, height: 900 })
      const explorerToggle = page.locator("button.mobile-explorer").first()
      if (
        (await explorerToggle.isVisible()) &&
        (await explorerToggle.evaluate(
          (el) => !el.closest(".explorer").classList.contains("collapsed"),
        ))
      ) {
        await explorerToggle.click()
      }
      await page.waitForTimeout(200)
      await checkControlRow(viewport, `resize to ${width}`)
      await viewport.getByRole("button", { name: "Zoom in", exact: true }).click()
      await checkControlRow(viewport, `zoom at ${width}`)
      await viewport.getByRole("button", { name: "Reset zoom" }).click()
      await checkControlRow(viewport, `reset at ${width}`)
      check(
        await figures
          .nth(4)
          .locator(".pele-viewport")
          .evaluate((el) => {
            const svg = el.querySelector(":scope > svg.pele")
            const style = getComputedStyle(el)
            const expected =
              svg.getBoundingClientRect().height +
              parseFloat(style.paddingTop) +
              parseFloat(style.paddingBottom)
            return (
              Math.abs(parseFloat(style.getPropertyValue("--pele-content-height")) - expected) <= 1
            )
          }),
        `Non-reflowing chart height is stale at ${width}`,
      )
      for (const theme of ["light", "dark"]) {
        const result = await page.evaluate(async (theme) => {
          const svg = document.querySelector("#pele-browser-fixture svg.pele")
          const previous = svg
          document.documentElement.setAttribute("saved-theme", theme)
          await new Promise((resolve) =>
            requestAnimationFrame(() => requestAnimationFrame(resolve)),
          )
          const figure = document.querySelector("#pele-browser-fixture > figure")
          // Resolve CSS variables and color-mix through the browser, then use
          // canvas to normalize modern CSS colors to sRGB for contrast checks.
          const canvas = document.createElement("canvas")
          canvas.width = canvas.height = 1
          const ctx = canvas.getContext("2d", { willReadFrequently: true })
          const rgba = (color) => {
            ctx.clearRect(0, 0, 1, 1)
            ctx.fillStyle = color
            ctx.fillRect(0, 0, 1, 1)
            return [...ctx.getImageData(0, 0, 1, 1).data]
          }
          const probe = document.createElement("span")
          figure.append(probe)
          const resolve = (name) => {
            probe.style.color = `var(${name})`
            return rgba(getComputedStyle(probe).color)
          }
          const series = Array.from({ length: 8 }, (_, i) => resolve(`--pele-series-${i + 1}`))
          const foreground = resolve("--pele-fg")
          const background = resolve("--pele-bg")
          probe.remove()
          const shape = svg.querySelector(".pele-node rect, .pele-node path, .pele-node polygon")
          const fill = shape ? rgba(getComputedStyle(shape).fill) : [0, 0, 0, 0]
          const text = svg.querySelector(".pele-node text")
          const textColor = text ? rgba(getComputedStyle(text).fill) : foreground
          const luminance = (color) =>
            color
              .slice(0, 3)
              .map((value) => {
                const channel = value / 255
                return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4
              })
              .reduce((total, value, i) => total + value * [0.2126, 0.7152, 0.0722][i], 0)
          const l1 = luminance(textColor)
          const l2 = luminance(fill)
          const pie = document.querySelectorAll("#pele-browser-fixture > figure")[4]
          const sliceText = rgba(
            getComputedStyle(pie.querySelector(".pele-slice-labels text")).fill,
          )
          const sliceLuminance = luminance(sliceText)
          const seriesContrasts = series.map((color) => {
            const value = luminance(color)
            return (
              (Math.max(value, sliceLuminance) + 0.05) / (Math.min(value, sliceLuminance) + 0.05)
            )
          })
          const authored = [...svg.querySelectorAll(".pele-node text")].find(
            (text) => text.textContent === "Render",
          )
          return {
            authoredColor: rgba(getComputedStyle(authored).fill),
            sliceUsesBackground: sliceText.join(",") === background.join(","),
            seriesContrasts,
            fill,
            series,
            contrast: (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05),
            width: Math.round(figure.getBoundingClientRect().width),
            viewport: innerWidth,
            svgWidth: svg.getBoundingClientRect().width,
            sameSvg: previous === document.querySelector("#pele-browser-fixture svg.pele"),
            color: getComputedStyle(svg).getPropertyValue("--pele-fg").trim(),
          }
        }, theme)
        check(result.width <= width && result.svgWidth > 0, `Invalid diagram geometry at ${width}`)
        check(result.sameSvg, "Theme color change replaced the SVG")
        check(
          result.authoredColor.join(",") === "130,0,0,255",
          `Authored text color was overridden in ${theme}`,
        )
        check(
          result.sliceUsesBackground && result.seriesContrasts.every((value) => value >= 4.5),
          `Chart percentage contrast is below 4.5 in ${theme}`,
        )
        check(result.fill[3] === 255, `Default node fill is transparent in ${theme}`)
        check(result.contrast >= 4.5, `Default node text contrast is below 4.5 in ${theme}`)
        check(
          result.series.every((color) => color[3] === 255) &&
            new Set(result.series.map((color) => color.join(","))).size === 8,
          `Theme does not provide eight distinct opaque series colors in ${theme}`,
        )
        viewports.push({ width, theme, color: result.color, series: result.series })
      }
    }
    check(viewports[0].color !== viewports[1].color, "Theme did not change diagram colors")
    check(
      viewports[0].series.every((color, i) => color.join(",") !== viewports[1].series[i].join(",")),
      "Theme did not change all eight series colors",
    )
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
    check(
      await dialog.getByRole("button", { name: "Close expanded diagram" }).evaluate((button) => {
        const bounds = button.getBoundingClientRect()
        const icon = button.querySelector("svg").getBoundingClientRect()
        return (
          bounds.width === 28 && bounds.height === 28 && icon.width === 16 && icon.height === 16
        )
      }),
      "Dialog close button or icon changed size",
    )
    for (const theme of ["light", "dark"]) {
      const backdrop = await dialog.evaluate(async (el, theme) => {
        document.documentElement.setAttribute("saved-theme", theme)
        await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))
        const probe = document.createElement("span")
        probe.style.background = "color-mix(in srgb, var(--light) 78%, transparent)"
        el.append(probe)
        const expected = getComputedStyle(probe).backgroundColor
        const style = getComputedStyle(el, "::backdrop")
        const result = {
          background: style.backgroundColor,
          expected,
          blur: style.backdropFilter,
        }
        probe.remove()
        return result
      }, theme)
      check(
        backdrop.background === backdrop.expected && backdrop.blur === "blur(4px)",
        `Dialog backdrop is not theme-aware 78% background with 4px blur in ${theme}`,
      )
    }
    // Exercise pointer eligibility without depending on browser-generated click suppression.
    const syntheticGesture = async (target, options = {}) => {
      await page.evaluate(
        ({ target, options }) => {
          const dialog = document.querySelector("dialog[open].pele-dialog")
          const selector = target === "header" ? ".pele-dialog-header" : target
          const element = target === "dialog" ? dialog : dialog.querySelector(selector)
          if (!element) throw new Error(`Missing gesture target: ${target}`)
          const bounds = dialog.getBoundingClientRect()
          const point = options.inside
            ? { clientX: bounds.left + bounds.width / 2, clientY: bounds.top + bounds.height / 2 }
            : { clientX: 4, clientY: 4 }
          const init = {
            bubbles: true,
            pointerId: 1,
            isPrimary: true,
            button: 0,
            ...point,
            ...options,
          }
          element.dispatchEvent(new PointerEvent("pointerdown", init))
          if (options.cancel) element.dispatchEvent(new PointerEvent("pointercancel", init))
          element.dispatchEvent(new PointerEvent("pointerup", init))
          element.dispatchEvent(new MouseEvent("click", init))
        },
        { target, options },
      )
    }
    for (const options of [
      { isPrimary: false },
      { button: 2 },
      { inside: true },
      { cancel: true },
    ]) {
      await syntheticGesture("dialog", options)
      check(await dialog.isVisible(), "Ineligible or canceled pointer dismissed the dialog")
    }
    await syntheticGesture("header")
    check(await dialog.isVisible(), "Header click dismissed the dialog")
    await syntheticGesture(".pele-viewport > svg.pele")
    check(await dialog.isVisible(), "SVG click dismissed the dialog")
    const smallDialogBounds = await dialog.boundingBox()
    check(smallDialogBounds.height < 450, "Small expanded diagram leaves excessive empty height")
    check(
      !(await dialog.getByRole("button", { name: "Zoom in", exact: true }).isVisible()),
      "Fitting small expanded diagram has visible zoom controls",
    )
    const fullscreen = dialog.getByRole("button", { name: "Enter fullscreen", exact: true })
    let fullscreenChecked = false
    if (await page.evaluate(() => document.fullscreenEnabled)) {
      await fullscreen.click()
      await page.waitForFunction(() => document.fullscreenElement?.matches(".pele-dialog-content"))
      await dialog.getByRole("button", { name: "Exit fullscreen", exact: true }).click()
      await page.waitForFunction(() => !document.fullscreenElement)
      await fullscreen.waitFor()
      fullscreenChecked = true
    }
    await dialog.locator(".pele-viewport > svg.pele").focus()
    await page.keyboard.press("Escape")
    await dialog.waitFor({ state: "hidden" })
    check(
      await expand.evaluate((el) => el === document.activeElement),
      "Dialog did not restore focus",
    )
    // A wide modal must retain its actual mounted SVG and pan/zoom state.
    const wideExpand = figures.nth(3).getByRole("button", { name: "Expand diagram" })
    await wideExpand.click()
    const wideDialog = page.getByRole("dialog", { name: "Expanded diagram" })
    const wideViewport = wideDialog.locator(".pele-stage")
    await checkControlRow(wideViewport, "wide modal initial")
    await wideViewport.getByRole("button", { name: "Zoom in", exact: true }).click()
    const wideSvg = wideViewport.locator(".pele-viewport > svg.pele")
    await wideSvg.focus()
    await page.keyboard.press("ArrowRight")
    await checkControlRow(wideViewport, "wide modal zoom and pan")
    await syntheticGesture(".pele-help")
    check(await wideDialog.isVisible(), "Help click dismissed the dialog")
    const outside = { x: 4, y: 4 }
    const wideBounds = await wideDialog.boundingBox()
    check(
      wideBounds.x > outside.x && wideBounds.y > outside.y,
      "Outside test point is inside dialog",
    )
    await page.mouse.move(outside.x, outside.y)
    await page.mouse.down()
    await page.mouse.move(outside.x + 20, outside.y, { steps: 4 })
    await page.mouse.up()
    check(await wideDialog.isVisible(), "Outside drag over 8px dismissed the dialog")
    await page.mouse.move(outside.x, outside.y)
    await page.mouse.down()
    await page.mouse.move(outside.x + 20, outside.y, { steps: 4 })
    await page.mouse.move(outside.x, outside.y, { steps: 4 })
    await page.mouse.up()
    check(
      await wideDialog.isVisible(),
      "Returning an outside drag to its start dismissed the dialog",
    )
    await page.mouse.move(outside.x, outside.y)
    await page.mouse.down()
    await page.mouse.move(
      wideBounds.x + wideBounds.width / 2,
      wideBounds.y + wideBounds.height / 2,
      { steps: 4 },
    )
    await page.mouse.up()
    check(await wideDialog.isVisible(), "Outside-to-inside drag dismissed the dialog")
    const panBounds = await wideSvg.boundingBox()
    await page.mouse.move(panBounds.x + panBounds.width / 2, panBounds.y + panBounds.height / 2)
    await page.mouse.down()
    await page.mouse.move(outside.x, outside.y, { steps: 8 })
    await page.mouse.up()
    check(await wideDialog.isVisible(), "Zoomed SVG pan ending outside dismissed the dialog")
    const retainedSvg = await wideSvg.elementHandle()
    const retainedStyle = await wideSvg.getAttribute("style")
    const retainedViewBox = await wideSvg.getAttribute("viewBox")
    for (const dismissal of ["outside", "Escape"]) {
      if (dismissal === "outside") await page.mouse.click(4, 4)
      else await page.keyboard.press("Escape")
      await wideDialog.waitFor({ state: "hidden" })
      check(
        await wideExpand.evaluate((el) => el === document.activeElement),
        `${dismissal} dismissal did not restore opener focus`,
      )
      check(await retainedSvg.evaluate((svg) => svg.isConnected), "Closing modal destroyed its SVG")
      await wideExpand.click()
      await wideDialog.waitFor()
      check(
        await wideSvg.evaluate((svg, previous) => svg === previous, retainedSvg),
        `Reopening after ${dismissal} replaced the mounted SVG`,
      )
      check(
        (await wideSvg.getAttribute("style")) === retainedStyle,
        `Reopening after ${dismissal} lost zoom state`,
      )
      check(
        (await wideSvg.getAttribute("viewBox")) === retainedViewBox,
        `Reopening after ${dismissal} lost pan state`,
      )
      await checkControlRow(wideViewport, `wide modal reopened after ${dismissal}`)
    }
    await wideViewport.getByRole("button", { name: "Reset zoom" }).click()
    await checkControlRow(wideViewport, "wide modal reset")
    await wideDialog.getByRole("button", { name: "Close expanded diagram" }).click()
    await retainedSvg.dispose()
    await page.evaluate(() => {
      const host = document.querySelector("#pele-browser-fixture")
      host.append(host.firstElementChild.cloneNode(true))
      document.dispatchEvent(new CustomEvent("render"))
      document.dispatchEvent(new CustomEvent("nav"))
    })
    await figures.nth(5).locator(".pele-viewport > svg.pele").waitFor()
    check(
      (await figures.nth(5).locator(".pele-toolbar").count()) === 1,
      "Clone has duplicate controls",
    )
    await figures.nth(5).getByRole("button", { name: "Copy diagram source" }).click()
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
      fullscreenChecked,
      checks: [
        "compact-accessible-icons",
        "auto-zoom-when-shrunk",
        "native-zoom-sizing",
        "native-keyboard-focus",
        "short-wide-zoom-no-clipping",
        "nonoverlapping-control-row",
        "copy-checkmark",
        "source-copy",
        "safe-errors",
        "zoom-reset",
        "responsive-layout",
        "theme-without-rerender",
        "opaque-node-fill-and-text-contrast",
        "eight-series-theme-colors",
        "chart-slice-contrast",
        "authored-colors",
        "non-reflowing-chart-height",
        "content-sized-small-modal",
        "modal-state-retention",
        "modal-theme-backdrop",
        "modal-close-icon-sizing",
        "modal-pointer-dismissal-eligibility",
        "modal-inside-clicks",
        "modal-outside-click-focus",
        "modal-drag-pan-safety",
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
