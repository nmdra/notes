# Plan: Replace OFM Mermaid rendering with Pele

## Goal

Render existing Mermaid fences with Pele while retaining other Obsidian Flavored Markdown (OFM) features. Improve mobile diagram readability, integrate diagram colors with the site theme, and serve the renderer locally rather than from a third-party CDN.

Status: implementation and local validation complete. The user authorized commit and push after validation. No manual deployment was run. The separate UI/UX plan in `Plan.md` remains unchanged. See implementation results below.

## Baseline State and Evidence

- OFM is enabled at order 30 with `mermaid: true`; syntax highlighting runs at order 20 (`quartz.config.yaml:60-83`). Setting only `mermaid: false` disables OFM's Mermaid tagging, expansion markup, browser script, and CSS without disabling its other features (installed `node_modules/@quartz-community/obsidian-flavored-markdown/dist/index.js:26215-26277`). Recheck installed package line numbers when implementation starts.
- OFM currently imports Mermaid 11.4.0 from cdnjs, handles theme changes, and provides an expanded modal with pan/zoom/reset (`node_modules/@quartz-community/obsidian-flavored-markdown/dist/index.js:24044`). The replacement must preserve an expanded view rather than silently remove it.
- Syntax highlighting adds code-block copy controls and processes Mermaid fences too (`node_modules/@quartz-community/syntax-highlighting/dist/index.js:28614-28624,28660-28673,28878-28880,28903-28907`). Preserve raw source before highlighting, and prevent duplicate highlighted-code or copy controls.
- Local transformers support `markdownPlugins`, `htmlPlugins`, and `externalResources` (`quartz/plugins/types.ts:24-34`). Configured plugin order controls Unified processing (`quartz/plugins/loader/config-loader.ts:420-429,503-508`; `quartz/processors/parse.ts:21-44`). Existing local config sources are shown in `quartz.config.yaml:315-324`.
- Quartz runs registered cleanup functions before SPA body replacement and dispatches navigation events afterward (`quartz/components/scripts/spa.inline.ts:43-44,86-92,110-136`). Initial load and embedded/transcluded diagram rendering also need verification.
- A local scan found 62 Mermaid fences in 28 generated Markdown files: 48 flowcharts, 6 graphs, 7 sequence diagrams, and 1 frontmatter-first block. Nine blocks contain `<br/>`; one contains an init directive. The scan found no math delimiters, click statements, `themeVariables`, or Font Awesome references. These are source-scan observations, not parser validation; recount before implementation.
- `content/` and `public/` are generated and must not be committed. Use synthetic committed test fixtures and keep note text, filenames, and screenshots out of public test artifacts (`README.md`, sections “What gets published” and “Checks”).
- Pele 1.9.0 was the published release at assessment time. It is MIT licensed, has no runtime dependencies, and targets built-in Mermaid 12.1.0 types: [repository](https://github.com/obsidianmd/pele), [package metadata](https://registry.npmjs.org/pele/latest), [compatibility](https://pele.run/compatibility).
- Pele's `mount()` adapts layouts to container width, supplies inline zoom, handles pending fonts, and exposes `destroy()`. Its colors use CSS variables without color-change rerendering: [API](https://pele.run/api), [theming](https://pele.run/theming).

## Decisions

- Keep Mermaid fences as the authoring format and retain OFM for all non-Mermaid behavior. A full OFM replacement is unnecessary.
- Use browser-side `mount()` with an exact, locally bundled Pele version. Start with the full diagram entry point for compatibility. Defer selective imports and lazy loading until measured bundle results justify them.
- Preserve copy-source, an accessible expanded view, and pan/zoom/reset. Use Pele's native zoom rather than porting OFM's renderer-specific controls.
- Use a dedicated Mermaid container, not a selector that depends on OFM's disabled tagging. Preserve exact source before the syntax-highlighting HTML phase.
- Map Pele CSS variables to the current Quartz theme and font variables. Do not emulate Mermaid themes or promise pixel-identical layouts.
- Keep responsive auto-direction enabled initially. Validate readability on narrow screens and disable it for a demonstrated case only if necessary.
- Use one renderer. An automatic Mermaid fallback adds bundle cost and complexity; ask the user before adding one if compatibility tests fail.
- Treat upstream speed and bundle figures as claims to investigate, not acceptance results for this site.

## Scope

In scope: local Pele integration, OFM Mermaid disablement, source preservation, theme mapping, responsive rendering, inline and expanded controls, lifecycle cleanup, synthetic regression tests, and local content compatibility checks.

Out of scope: edits to generated notes, build-time SVG generation, SVG/PNG download, live diagram editing, new note-link semantics, custom icon or math resolvers, and external Mermaid plugins. Pele enables later build-time rendering, export controls, and richer diagram types, but those need separate work. Existing math or icon usage discovered during validation must be reported before expanding scope.

## Tasks

- [x] **1. Establish baseline and compatibility fixtures.** Recount actual Mermaid blocks and record supported syntax categories without retaining private source. Capture current copy, expand, zoom, theme, and navigation behavior locally. Add synthetic fixtures covering flowchart, sequence, frontmatter, init directives, `<br/>`, multiple diagrams, malformed input, and code containing HTML-sensitive characters. **Files:** proposed `quartz/plugins/pele/fixtures/` and `quartz/plugins/pele/pele.test.ts`; generated `content/` is read-only input. **Seam:** fenced Markdown through Quartz's Unified pipeline. **Verify:** run fixtures against the current pipeline with `npx tsx --test quartz/plugins/pele/pele.test.ts`; every fixture has an explicit expected source or behavior.

- [x] **2. Add the transformer and local renderer resource.** Pin Pele 1.9.0, or explicitly report why a different exact version is needed. Follow the existing local plugin loader contract. Capture Mermaid fences in the Markdown phase and emit dedicated containers before syntax-highlighting HTML processing. Preserve source safely as text; leave unrelated code fences unchanged. Bundle Pele through Quartz's existing resource path, not a CDN or a manually edited generated bundle. **Files:** `package.json`, the repository's active dependency lockfile, `quartz/plugins/pele/index.js`, `index.d.ts`, plugin `package.json`, and `quartz/plugins/pele/pele.inline.ts`, `quartz.config.yaml`, `quartz/plugins/pele/pele.test.ts`. **Seam:** `QuartzTransformerPluginInstance` and `externalResources`. **Verify:** fixture tests and `npx tsc --noEmit`; build output has one renderer path, intact source, no OFM Mermaid script, and no duplicate highlighted Mermaid blocks. Set OFM `mermaid: false` only together with the working replacement.

- [x] **3. Integrate mounting and lifecycle cleanup.** Mount once on initial display and subsequent Quartz render/navigation events. Confirm event coverage for transclusions and popovers. Keep a registry to avoid duplicate mounts and listeners. On cleanup, call each mounted instance's `destroy()` and remove modal/listener state. Display parse errors safely as text while keeping source accessible; do not send source in telemetry or persist private diagnostics. **Files:** `quartz/plugins/pele/pele.inline.ts`, `quartz/plugins/pele/pele.test.ts`. **Seam:** Quartz render events and `window.addCleanup`. **Verify:** repeated SPA navigation, back/forward, multiple diagrams, invalid input, embeds, and pages without diagrams produce no duplicate controls, stale observers, or uncaught errors.

- [x] **4. Preserve controls and integrate theme.** Add copy-source feedback and an expanded modal with labelled open/close controls, Escape dismissal, focus restoration, and Pele zoom/reset. Map colors and fonts to the current theme. Use a stable-width container; keep mobile overflow inside diagrams rather than across the page. Supply trusted options, retain Pele's default URL restrictions and size limits, and avoid custom raw icon/math markup. **Files:** `quartz/plugins/pele/pele.inline.ts`, proposed `quartz/plugins/pele/pele.scss`, `quartz/plugins/pele/index.js`, `quartz/plugins/pele/pele.test.ts`, `quartz/plugins/pele/browser-check.js`. **Seam:** mounted diagram DOM and site theme variables. **Verify:** both themes, theme switching without color rerendering, copy fidelity, keyboard controls, modal focus, touch zoom, width changes, pending fonts, and reduced-motion settings. Test at 320px, 375px, tablet, and desktop widths. Consult [Pele security](https://pele.run/security) for safe error and link handling.

- [x] **5. Validate all local diagrams and document the switch.** Render every current Mermaid fence with Pele using a local transient checker. Review browser layout for all diagram-bearing pages, with particular attention to `<br/>`, frontmatter, directives, subgraphs, long labels, and sequence diagrams. Record aggregate results only. Check the emitted site makes no Mermaid/Pele CDN request. Compare renderer download size and representative page rendering before/after without claiming upstream benchmark numbers as local results. **Files:** `quartz/plugins/pele/pele.test.ts`, `README.md` for configuration and known limitations; this plan for completion evidence. **Seam:** real generated content and built browser site. **Verify:** tests, type checks, production build, and browser acceptance below. Stop and report unsupported syntax or unreadable layouts before broadening scope.

## Verification and Acceptance

Run focused tests first, then repository checks:

```bash
npx tsx --test quartz/plugins/pele/pele.test.ts
npx tsc --noEmit
npm test -- 'quartz/**/*.test.{ts,js}'
npx quartz build
python3 scripts/check-blocked-files.py content
python3 scripts/check-blocked-files.py public
```

Use existing approved local content. If a fresh sync is needed, follow `README.md` and provide the vault path explicitly. Do not assume a configured vault or deploy the site as part of validation. Run targeted formatting and active diagnostics for changed code; distinguish pre-existing failures from new ones.

Acceptance criteria:

- All current Mermaid blocks parse and remain readable, or the user explicitly accepts documented exceptions before enabling the switch.
- Wikilinks, callouts, other OFM features, and unrelated syntax-highlighted code remain unchanged.
- Copy preserves the original diagram source. Expanded view, inline zoom, keyboard interaction, and focus restoration work.
- Theme changes update diagram colors; container resizing and font loading produce correct geometry.
- Repeated SPA navigation and embedded rendering create no duplicate mounts, listeners, controls, or uncaught errors.
- At 320px the page has no diagram-caused horizontal overflow; wide diagram details remain reachable with zoom/pan.
- Renderer assets are served by this site. No old Mermaid CDN import remains active.
- Malformed diagrams show safe, readable errors. Tests cover HTML-sensitive source and blocked executable URL schemes.
- Only source code, synthetic fixtures, dependency metadata, and documentation are committed. Generated content and private QA artifacts remain local.

## Implementation Results

- Added the local transformer at order 15, before syntax highlighting, and disabled only OFM's Mermaid option. Pele is pinned to 1.9.0 in both dependency files.
- Used native JavaScript for the plugin entry point, with a declaration file for TypeScript consumers. The loader dynamically imports local plugins without a TypeScript loader, and the pinned Node 22.16 runtime cannot rely on default type stripping. The browser script remains TypeScript and is bundled with esbuild. A native import with type stripping disabled passes.
- Kept the stylesheet as plain, flattened CSS in `pele.scss`, because transformer resources do not run through Sass. A regression test parses it through Lightning CSS without error recovery or warnings.
- Stored source in `pre > span` text nodes. This preserves leading blank lines through HTML serialization and reparsing. Real OFM integration tests cover callouts, wikilinks, block IDs, embed markup, and unrelated highlighted code.
- Browser lifecycle covers initial load, render/navigation events, inserted or cloned figures, and disconnected figures. Cleanup destroys mounted instances and removes per-render resources.
- Preserved copy-source and native Pele zoom/pan/reset. The expanded native dialog restores focus and captures Escape before Pele can consume it as a zoom reset. Failed source remains selectable even if clipboard access is denied. A 10rem minimum viewport height keeps enlarged zoom controls visible on short diagrams.
- Disabled authored diagram image requests (`images: false`); retained Pele's default URL and size restrictions. No custom math, icon, link, or sanitizer resolver was added.

### Local verification

- Focused regression suite: **13 passed**. Repository TypeScript/JavaScript suite: **201 passed**. Python publication tests: **33 passed**. Type checking and the production build pass.
- Recounted **62 Mermaid blocks in 28 source notes**. All 62 pass synchronous rendering and browser mounting, including four viewport widths (320, 375, 768, 1440) and both themes, with zero render or geometry errors.
- The built plaintext pages contain **52 diagram instances across 26 pages**, including one transcluded duplicate. Eleven source diagrams belong to two encrypted notes. Their raw source was tested in a transient local browser fixture; passwords and the real unlock workflow were not used. The plaintext-page sweep passed **208 viewport/theme checks**, with zero render errors, geometry errors, uncaught page errors, or renderer CDN requests.
- The committed synthetic browser runner (`browser-check.js`) passes source copy, selectable safe errors, zoom/reset, keyboard pan, unclipped controls, theme changes without SVG replacement, expanded-view Escape/focus, cloned-figure mounting, and SPA cleanup checks. A transient Chromium CDP check also passes touch pinch/pan, keyboard zoom/pan, repeated SPA navigation, and history back/forward navigation after waiting for Quartz's `nav` event.
- Desktop contact sheets for all 62 diagrams were reviewed locally, plus a 375px dark-theme screenshot of the synthetic fixture. Large diagrams can still require internal scrolling, zoom/pan, or the expanded view. Private screenshots and source fixtures were kept outside the repository in temporary storage.
- The full bundled renderer plus integration is approximately **709 kB uncompressed / 263 kB gzip**. The former local OFM integration was about **5.8 kB / 2.0 kB gzip**, plus remotely imported Mermaid chunks. These are not equivalent payloads, so no reduced-download claim is made. The local page sweep's median diagram-ready time was approximately **566 ms**, including page loading, not an isolated renderer benchmark. A controlled before/after speed benchmark remains unperformed.
- Both generated-directory publication checks pass. `git diff --check` and targeted formatting checks pass. Full `npm run check` reaches Prettier and reports existing formatting issues in seven files: `.agents/HOMEPAGE_PLAN.md`, `.agents/plans/github-records-review.md`, `.agents/VISUAL_IMPROVEMENTS_PLAN.md`, `quartz.config.yaml`, `quartz/components/Head.tsx`, `quartz/styles/_catppuccin.scss`, and `quartz/styles/callouts_catppuccin.scss`. The existing YAML style was retained to keep the configuration diff small.
- Final active diagnostics reported no errors across six changed code/style files: four confirmed clean, two inconclusive on the LSP probe. The independent TypeScript compiler check passes.
- Installation reported two high-severity audit findings in existing `sharp` and `source-map-js` dependencies. Pele has no runtime dependencies. No unrelated dependency updates were made.

### Limits

Browser acceptance used Chromium and emulated touch input, not physical devices or a cross-browser matrix. Dynamic insertion and live clones were tested as the browser seam for popovers/decrypted content; actual encrypted-note unlocking was not tested. Native `<dialog>` support is required. Performance measurements above are informational, not proof of the upstream speed or bundle-size claims.

## Rollback

Keep replacement registration and `mermaid: false` adjacent in the configuration change. If acceptance fails, disable the local Pele transformer and restore OFM `mermaid: true` together. Do not leave both renderers enabled. Retain existing note syntax so rollback needs no content changes.

## Open Questions

None blocks the planned proof of concept. Visual compatibility and exact render-event coverage are validation gates, not assumed facts. Ask before adding a second renderer, changing authoring syntax, or adding math/icon/navigation features.
