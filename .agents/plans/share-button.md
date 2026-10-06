# Plan: Minimal note sharing control

## Goal

Give readers a small share icon beside the note title. The icon copies the title and public URL without a system share sheet.

## Approved Changes

The user revised the original plan during implementation:

- Use an icon-only button instead of a visible “Share” label.
- Always copy the title and URL. Do not use native sharing.
- Put the icon at the right of the title row, not below the title.
- Use a borderless control with a subtle hover background.

Preserve the unrelated `.agents/plans/Plan.md`.

## Current State

- Quartz uses config-backed component groups. `Flex` wraps group members and supports grow, shrink, and alignment (`quartz/components/Flex.tsx:5-54`).
- The title and local `share-button` plugin now share the `note-heading` group in `quartz.config.yaml`. Page-type exclusions keep the control off folder, tag, 404, canvas, and bases pages.
- The component provides server-rendered markup, scoped CSS, and a bundled client script (`quartz/plugins/share-button/components/index.js:1-17`).
- The public note URL comes from `og:url`; the title comes from `og:title`. `Head` generates this metadata from the configured public host and note data (`quartz/components/Head.tsx:28-36,100-107`).
- Quartz installs `window.addCleanup` and emits `nav` after navigation (`quartz/components/scripts/spa.inline.ts:38-44,94-133`). Component scripts can run before that hook exists. Initialization must wait for the hook.
- Link previews clone the header's `.popover-hint` (`quartz/components/scripts/popover.inline.ts:108-116`). The new control stays hidden in previews.
- Clipboard writes require a secure context and can fail with permission errors ([MDN writeText](https://developer.mozilla.org/en-US/docs/Web/API/Clipboard/writeText)).

## Decisions

- **Copy plain text:** the note title, one newline, then the public URL. Strip query parameters and fragments. Preserve encoded paths and base prefixes.
- **Use no native sharing:** never call or inspect `navigator.share` or `navigator.canShare`.
- **Use the existing grouping system:** align the title and icon without changing Quartz core or forking ArticleTitle. Let long titles wrap while the icon keeps its size.
- **Keep the control minimal:** a 32px borderless button with a decorative share icon, an accessible “Copy note link” label, and a tooltip. Use a 44px target on touch devices.
- **Give accurate feedback:** show “Link copied” only after clipboard success. Clear it after three seconds. Show feedback outside the title layout so it does not shift the title.
- **Keep a manual fallback:** if clipboard access is absent or fails, reveal a labeled, read-only textarea with the same title and URL. Focus and select its contents.
- **Preserve lifecycle safety:** initialize on `nav` and `render` only when the cleanup hook exists. Repeated initialization is a no-op. Cleanup removes handlers and timers and ignores late promise results.
- **Keep inactive controls hidden:** no inert button without JavaScript, no control on non-note pages, and no active control in link previews.
- **Add no dependencies, analytics, or publication changes.** Keep existing generated content untouched and do not deploy.

## Tasks

- [x] Add the local component plugin and note-only config. Group it with the existing title component.
  - **Files:** `quartz/plugins/share-button/package.json`, `quartz/plugins/share-button/index.js`, `quartz/plugins/share-button/dist/index.d.ts`, `quartz.config.yaml`.
  - **Seam:** local plugin loader and generated title group.
  - **Verify:** `npm run install-plugins`, `npx quartz build`, and generated note/non-note HTML checks.
- [x] Implement title-and-link copying, accurate feedback, manual copying, duplicate-click protection, and lifecycle cleanup.
  - **Files:** `quartz/plugins/share-button/components/index.js`, `quartz/plugins/share-button/components/share.inline.ts`, `quartz/plugins/share-button/components/index.test.js`.
  - **Seam:** component markup and its actual bundled script in `node:vm`.
  - **Verify:** `npx tsx --test quartz/plugins/share-button/components/index.test.js`. All 20 plugin tests pass, including early script loading, absent/blocked clipboard, stale promises, repeated render, and preview isolation.
- [x] Add compact, borderless, theme-aware styles and title-row alignment. Keep keyboard focus visible and manual text readable.
  - **Files:** `quartz/plugins/share-button/components/index.js`, `quartz.config.yaml`.
  - **Seam:** existing `Flex` group and component CSS.
  - **Verify:** component markup/style tests and browser checks of title alignment, hover, focus, and responsive sizes.
- [x] Finish integration checks and keep a localhost preview running.
  - **Files:** `.agents/plans/share-button.md` for completion evidence. Fixes stay in the feature files above.
  - **Seam:** generated site served on `127.0.0.1:8080`, actual browser clipboard, and SPA navigation.
  - **Verify:** `npx tsc --noEmit`, `npm test -- 'quartz/**/*.test.{ts,js}'`, targeted Prettier, `npm run check`, `git diff --check`, changed-file pi-lens diagnostics, a final build, and browser checks.

## Verification

Acceptance criteria:

- One icon sits at the right of the note title row without a visible button border or text label.
- Clicking the icon copies exactly the title, a newline, and the clean public URL.
- The system share sheet never opens, even on native-share-capable browsers.
- Keyboard Enter and Space work. The control has a visible focus outline.
- The desktop button is 32px. Touch devices use a 44px tap target.
- Manual copying preserves the same text and works at 320px.
- SPA navigation updates the title and URL and leaves no duplicate handlers or stale feedback.
- Homepage, listings, non-note pages, and link previews show no control.

Completed checks so far:

- TypeScript passes. All 20 plugin tests pass.
- Targeted plugin formatting passes.
- Full active pi-lens checks of all seven implementation/config files find no errors or warnings. There is one feature-detection hint and one type-import information notice.
- Full `npm run check` reports the same four existing formatting failures: `quartz.config.yaml`, `quartz/components/Head.tsx`, `quartz/styles/_catppuccin.scss`, and `quartz/styles/callouts_catppuccin.scss`.
- A static local preview listens only on `127.0.0.1:8080`. It serves the generated output with clean URLs. It does not publish the site.

Final results:

- All 188 scoped site tests pass, including 20 plugin tests. TypeScript, targeted Prettier, and `git diff --check` pass.
- The final Quartz build succeeds and emits 1495 files from the existing local content.
- All 26 browser checks pass. These cover real clipboard text, title-row alignment, borderless hover, 32px desktop and 44px touch sizes, both themes, 320px layout, keyboard controls, doubled text size, manual copying, SPA navigation/back, stale promises, preview isolation, and JavaScript-disabled behavior.
- Browser checks found an early-initialization defect during implementation. The client now waits for Quartz's cleanup hook. A regression test covers that order.
- The preview is available at `http://localhost:8080/`. A note for review is `http://localhost:8080/00.fleeting-notes/ai-llm/papers/dflash---block-diffusion-for-flash-speculative-decoding`.
- The preview server PID is `234502`. It serves static generated output. Source changes require a new Quartz build.
- Implementation checks did not deploy the site. Browser checks used no note-text screenshots.

## Open Questions

None. The user selected the final placement, appearance, and copy-only behavior.
