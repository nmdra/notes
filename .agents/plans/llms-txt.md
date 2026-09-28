# Plan: Static `llms.txt` at the site root

## Goal

Publish a short, hand-written overview at `https://notes.nimendra.online/llms.txt`. Use Quartz's existing asset copy behavior. Do not add a plugin or generate a list of every note.

## Current State

- The [llms.txt proposal](https://llmstxt.org/) uses a site title, short summary, and sections of descriptive links. [FastHTML's example](https://www.fastht.ml/docs/llms.txt) uses that format with a concise introduction and topic links.
- Lighthouse describes `llms.txt` as optional and recommends placing it at the site root: https://developer.chrome.com/docs/lighthouse/agentic-browsing/llms-txt.
- `scripts/sync-content.py:343-347,440-444` recreates `content/` and copies `templates/index.md` into it. Quartz's built-in `Assets` emitter copies non-Markdown files from `content/` to the root of `public/` (`quartz/plugins/emitters/assets.ts:21-54`). Its `Static` emitter instead copies files from `quartz/static/` into `public/static/` (`quartz/plugins/emitters/static.ts:8-19`).
- The homepage provides public topic links (`templates/index.md:17-47`). `publish.list:6-16` names additional published topics. The existing sitemap covers published pages (`quartz.config.yaml:150-154`).

## Decisions

- Keep the source at `templates/llms.txt` and copy it into `content/llms.txt` during vault sync. This survives sync's deletion of generated content and lets the native `Assets` emitter put it at `/llms.txt`.
- Model the text on FastHTML's structure, but link to real published HTML pages. This site does not provide per-note Markdown mirror files. Point to the existing sitemap for complete page discovery, rather than manually listing every note.
- Fail sync when the template is missing. Check the generated root file in CI, since the build can succeed without an expected asset.

## Scope

In scope: the authored file, the sync copy, a regression test, a CI output check, and brief maintenance documentation. Out of scope: a custom plugin, generated per-note Markdown, sitemap parsing, and changes to publication rules.

## Tasks

- [x] Write `templates/llms.txt` with an H1, summary, navigation notes, homepage, tag index, sitemap, and published topic links. **Seam:** site-root text asset; **Files:** `templates/llms.txt`; **Verify:** inspect the template and follow its URLs.
- [x] Copy the template to `content/llms.txt` during sync and return an error when the template is missing. Add tests for both paths. **Seam:** `main()` sync; **Files:** `scripts/sync-content.py`, `scripts/test_sync_content.py`; **Verify:** `python3 -m unittest discover -s scripts -p 'test_*.py'`.
- [x] Require `public/llms.txt` to be nonempty and byte-for-byte equal to its source after CI builds the site. Document how to edit the source. **Seam:** build validation; **Files:** `.github/workflows/deploy.yml`, `README.md`; **Verify:** sync, build, then run `cmp templates/llms.txt public/llms.txt`.

## Verification

Run the Python tests, sync the vault, build Quartz, and compare `public/llms.txt` with the template. Check that the published URL returns the file after deployment. No per-note Markdown URLs are advertised.

## Open Questions

None. This static approach replaces the earlier plugin proposal.
