import { buildSync } from "esbuild"
import { fileURLToPath } from "node:url"

const clientScript = buildSync({
  entryPoints: [fileURLToPath(new URL("./zoom.inline.ts", import.meta.url))],
  bundle: true,
  format: "iife",
  minify: true,
  platform: "browser",
  target: "es2020",
  write: false,
}).outputFiles[0].text

export const ImageZoom = () => {
  const Component = () => null
  Component.afterDOMLoaded = clientScript
  Component.css = `
    .medium-zoom-overlay {
      z-index: 10000;
      backdrop-filter: blur(4px);
      -webkit-backdrop-filter: blur(4px);
    }

    .medium-zoom-image--opened {
      z-index: 10001;
    }

    .medium-zoom-close {
      position: fixed;
      top: max(1rem, env(safe-area-inset-top));
      right: max(1rem, env(safe-area-inset-right));
      z-index: 10002;
      display: grid;
      width: 2.75rem;
      height: 2.75rem;
      place-items: center;
      border: 1px solid color-mix(in srgb, var(--dark) 20%, transparent);
      border-radius: 50%;
      background: color-mix(in srgb, var(--light) 88%, transparent);
      box-shadow: 0 2px 16px rgb(0 0 0 / 20%);
      color: var(--dark);
      cursor: pointer;
      opacity: 0;
      pointer-events: none;
      transition: opacity 150ms ease, visibility 150ms ease;
      visibility: hidden;
    }

    body.medium-zoom--opened .medium-zoom-close {
      opacity: 1;
      pointer-events: auto;
      visibility: visible;
    }

    .medium-zoom-close svg {
      width: 1.25rem;
      height: 1.25rem;
    }

    .medium-zoom-close:focus-visible {
      outline: 3px solid var(--secondary);
      outline-offset: 3px;
    }

    img.medium-zoom-image:focus-visible {
      outline: 3px solid var(--secondary);
      outline-offset: 4px;
    }

    @media (prefers-reduced-motion: reduce) {
      .medium-zoom-image,
      .medium-zoom-overlay,
      .medium-zoom-close {
        transition-duration: 0.01ms !important;
      }
    }
  `
  return Component
}
