# Plan: Balance TOC and graph; move backlinks below notes

## Goal

Keep the Table of Contents and Graph View legible and reachable in the desktop right sidebar. Put Backlinks after the note body so a long TOC cannot push the graph below the viewport. Use the DFlash note as the regression case: https://notes.nimendra.online/00.fleeting-notes/ai-llm/papers/dflash---block-diffusion-for-flash-speculative-decoding

## Current State

- `quartz.config.yaml:87-93,179-213` configures TOC and Graph in the right sidebar. Backlinks is now configured for `afterBody` at priority 20, after homepage recent notes at priority 10. `quartz.config.yaml:352-370` excludes Backlinks from folder, tag, and 404 layouts.
- Exclusion entries must match the full plugin source name, `@quartz-community/backlinks`: `quartz/plugins/loader/config-loader.ts:59-95` compares the extracted source name. `DefaultFrame` renders `afterBody` in `.center .page-footer` after the article and separator (`quartz/components/frames/DefaultFrame.tsx:39-51`).
- The desktop right sidebar is a sticky flex column with `height: 100vh` and 6rem top padding (`quartz/styles/base.scss:221-268`, `quartz/styles/variables.scss:16-19`). Non-desktop layout makes it an ordinary row and hides the TOC (`quartz/styles/base.scss:255-268`). The tablet media query includes exactly 1200px, so the new desktop sizing is scoped to 1201px and wider.
- The packaged TOC is a flex column with its own overflow list (`node_modules/@quartz-community/table-of-contents/dist/components/index.js:317`). The graph box is 250px high (`node_modules/@quartz-community/graph/dist/components/index.js:314`). Backlinks uses an overflow list and hides when empty (`node_modules/@quartz-community/backlinks/dist/components/index.js:344,459-482`).
- Before the change, DFlash at 1440×900 had a 641px TOC and the graph box began at y=832, below the viewport. At 1201×600 the graph box began at y=663. The short-TOC KV cache note was also measured for comparison.
- `.agents/plans/Plan.md` is a separate existing plan. Unrelated worktree changes, including the image-zoom plugin, are out of scope and remain untouched.

## Decisions

- Move Backlinks to `afterBody` at priority 20. Exclude the full source name on folder, tag, and 404 pages. Keep TOC before Graph in the right sidebar. Do not add a `has-backlinks` condition: that predicate reads `fileData.backlinks`, while the packaged Backlinks component derives sources from `allFiles`.
- Let the expanded desktop TOC use the sidebar's remaining height and scroll internally. Keep a small minimum TOC area, and keep the graph at its configured height. Do not auto-collapse the TOC or hide entries.
- Make the desktop sidebar vertically scrollable if the viewport or enlarged text cannot fit the TOC and graph. Keep the collapsed TOC header visible. Restrict these sizing rules to widths above 1200px; preserve tablet/mobile layout.
- In the footer, rely on `DefaultFrame`'s existing `<hr>` as the separator. Add spacing and consistent heading/link styles to Backlinks, and let its list flow without a fixed height.
- Use existing plugin markup and CSS. Do not fork plugins or add viewport-dependent JavaScript.

## Scope

In scope: move Backlinks below the article, exclude it on folder/tag/404 layouts, size desktop TOC and Graph, and verify responsive and interactive behavior. Out of scope: changing note content, graph data, plugin internals, or mobile/tablet component visibility.

## Tasks

- [x] Measure baseline DFlash and KV cache layouts with Playwright at 1440×900, 1440×600, 1201×600, and 1200×768. The DFlash Graph box was below the viewport at both desktop heights. Exactly 1200px uses the existing tablet layout. **Seam:** rendered right sidebar; **Files:** none; **Verify:** browser measurements on the live site; no note text or screenshots saved.
- [x] Move Backlinks to `afterBody` at priority 20, and exclude `@quartz-community/backlinks` on folder/tag/404 layouts. Preserve homepage recent notes and existing component order. **Seam:** `loadQuartzLayout` and `DefaultFrame`; **Files:** `quartz.config.yaml`; **Verify:** built output has Backlinks below a note when backlinks exist, no Backlinks on folder/tag/404 pages, and exactly one homepage recent-notes section.
- [x] Add desktop-only sizing beside the current sidebar styles. At widths above 1200px, let the TOC flex into remaining space with an 8rem expanded minimum; use a 2rem minimum for the collapsed header; scroll the TOC list independently; prevent Graph from shrinking; and allow the sidebar to scroll when necessary. Style footer Backlinks without a fixed list height. **Seam:** packaged components in `.right.sidebar` and `.page-footer`; **Files:** `quartz/styles/custom.scss`; **Verify:** DFlash at 1440×900 has a 455px TOC and graph box y=610..860; at 1201×600 it has a 155px TOC and graph box y=310..560. At short heights, sidebar scrolling exposes the full graph button.
- [x] Check responsive and interactive behavior: TOC Space-key collapse/expand, Graph full-view/Escape, long backlinks, SPA navigation from DFlash (32 TOC entries) to KV cache (13), dark theme, 32px root-font-size scaling, exactly 1200px, tablet, and mobile. **Seam:** rendered sidebar/footer across navigation; **Files:** `quartz.config.yaml`, `quartz/styles/custom.scss`; **Verify:** all 14 KV cache backlinks remain visible below the article; no clipped graph/button; tablet/mobile TOC visibility is unchanged.

## Verification

- `npx quartz build` succeeds. `npm test` passes all 168 tests. `npm run check` passes TypeScript and reports the repository's known Prettier failures in `quartz.config.yaml`, `quartz/components/Head.tsx`, `quartz/styles/_catppuccin.scss`, and `quartz/styles/callouts_catppuccin.scss`. Targeted Prettier passes for `quartz/styles/custom.scss`; YAML/SCSS diagnostics and `git diff --check` are clean.
- Generated-site browser checks: at 1440×900 the DFlash Graph fits in the viewport; at 1201×600 the 904px TOC list scrolls within its 155px area while Graph remains visible. At 1201×400, sidebar scrolling reaches the entire graph. A 32px root-font-size test verified independent TOC scrolling and sidebar access to the graph button. The collapsed TOC is a 36.8px header row with no list area.
- The Graph full-view overlay opens and closes with Escape. SPA navigation from DFlash to KV cache updates from 32 to 13 TOC entries and keeps Backlinks below the article with all 14 entries visible. Folder, tag, and 404 pages have no Backlinks; homepage recent notes render once. At 800px and 720px, the existing layout remains intact, and Backlinks remain below the article.

## Open Questions

None.
