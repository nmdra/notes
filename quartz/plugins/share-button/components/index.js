import { buildSync } from "esbuild"
import { fileURLToPath } from "node:url"
import { h } from "preact"

const clientScript = buildSync({
  entryPoints: [fileURLToPath(new URL("./share.inline.ts", import.meta.url))],
  bundle: true,
  format: "iife",
  minify: true,
  platform: "browser",
  target: "es2020",
  write: false,
}).outputFiles[0].text

export const ShareButton = () => {
  const Component = () =>
    h("div", { class: "note-share", hidden: true }, [
      h(
        "button",
        {
          class: "note-share-button",
          type: "button",
          "aria-label": "Copy note link",
          title: "Copy note link",
        },
        [
          h(
            "svg",
            {
              "aria-hidden": "true",
              focusable: "false",
              viewBox: "0 0 24 24",
              fill: "none",
              stroke: "currentColor",
              "stroke-width": "2",
              "stroke-linecap": "round",
              "stroke-linejoin": "round",
            },
            [h("path", { d: "M12 16V3m-5 5 5-5 5 5M5 13v7a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-7" })],
          ),
        ],
      ),
      h("span", {
        class: "note-share-status",
        role: "status",
        "aria-live": "polite",
        "aria-atomic": "true",
      }),
      h("label", { class: "note-share-manual", hidden: true }, [
        "Note title and URL",
        h("textarea", { class: "note-share-url", rows: 2, readOnly: true }),
      ]),
    ])
  Component.afterDOMLoaded = clientScript
  Component.css = `
    .page-header .flex-component:has(.note-share) {
      position: relative;
      margin-top: 2rem;
    }
    .page-header .flex-component:has(.note-share) > div:first-child {
      min-width: 0;
    }
    .page-header .flex-component:has(.note-share) .article-title {
      margin: 0;
    }
    .note-share {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 0.5rem;
      min-width: 0;
      max-width: 100%;
      margin: 0;
      padding-top: 0.15rem;
    }
    .note-share[hidden], .note-share [hidden], .popover .note-share {
      display: none !important;
    }
    .note-share .note-share-button {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 32px;
      height: 32px;
      min-height: 32px;
      min-width: 32px;
      padding: 0;
      border: 0;
      border-radius: 6px;
      background: transparent;
      color: var(--darkgray);
      font: inherit;
      cursor: pointer;
    }
    .note-share .note-share-button:hover {
      background: var(--highlight);
      color: var(--dark);
    }
    @media (pointer: coarse) {
      .note-share .note-share-button {
        width: 44px;
        height: 44px;
        min-width: 44px;
        min-height: 44px;
      }
    }
    .note-share .note-share-button[aria-disabled="true"] {
      cursor: wait;
    }
    .note-share .note-share-button svg {
      width: 1rem;
      height: 1rem;
      flex-shrink: 0;
    }
    .note-share .note-share-status {
      position: absolute;
      top: calc(100% + 0.25rem);
      right: 0;
      z-index: 2;
      max-width: 100%;
      overflow-wrap: anywhere;
      font-size: 0.85rem;
      color: var(--dark);
      pointer-events: none;
    }
    .note-share .note-share-status:not(:empty) {
      padding: 0.25rem 0.5rem;
      border-radius: 6px;
      background: var(--light);
      box-shadow: 0 2px 8px rgb(0 0 0 / 10%);
    }
    .note-share .note-share-manual {
      position: absolute;
      top: calc(100% + 2rem);
      left: 0;
      right: 0;
      z-index: 3;
      box-sizing: border-box;
      padding: 0.75rem;
      border: 1px solid var(--gray);
      border-radius: 8px;
      background: var(--light);
      color: var(--dark);
      box-shadow: 0 4px 16px rgb(0 0 0 / 10%);
      display: flex;
      flex-direction: column;
      gap: 0.25rem;
      flex-basis: 100%;
      min-width: 0;
    }
    .note-share .note-share-url {
      box-sizing: border-box;
      width: 100%;
      min-width: 0;
      min-height: 44px;
      resize: vertical;
      border: 1px solid var(--gray);
      border-radius: 5px;
      padding: 0.5rem;
      background: var(--light);
      color: var(--dark);
      font: inherit;
    }
    .note-share .note-share-button:focus-visible,
    .note-share .note-share-url:focus-visible {
      outline: 3px solid var(--secondary);
      outline-offset: 3px;
    }
  `
  return Component
}
