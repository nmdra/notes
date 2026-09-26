# Plan: Publish selected Obsidian folders via Quartz → GitHub Pages

Status: MVP implemented — local build verified, ready to push
Created: 2026-09-25

## Decisions

|                |                                                                                                    |
| -------------- | -------------------------------------------------------------------------------------------------- |
| Publish set    | `02.Areas`, `03.Resources`, `05.Books`, `00.Fleeting Notes/AI-LLM` → 425 notes, ~59 MB images      |
| Canvases/bases | skipped (the 1 `.canvas` embed in AI-LLM will show as a broken link)                               |
| PDFs / docs    | never published — 4 layers below; links left in place and marked broken                            |
| Images         | allowed (image extensions in the copy allowlist; no path exclusions needed)                        |
| Theme          | **Catppuccin** (Latte for light, Mocha for dark) applied to `quartz.config.ts` and `custom.scss`   |
| Repo / URL     | `nmdra/notes` (created via `gh`) → `notes.nimendra.online`; DNS CNAME added by user                |
| Vault          | `~/Documents/Second Brain 2.0` stays private and untouched; CI reads it via a read-only deploy key |
| Blog           | `nmdra.github.io` / `blog.nimendra.online` — never touched                                         |

### Key facts researched

- Quartz 5 requires Node >= 22 (local: v26.8.1).
- GitHub Pages requires a public repo → notes must never be committed. `content/` is gitignored.
- `quartz/plugins/emitters/assets.ts:23` applies `configuration.ignorePatterns` to non-Markdown
  assets: `const excludePatterns = ["**/*.md", ...cfg.configuration.ignorePatterns]`.
  This is the official lever to keep PDFs out of the build output.
- Attachments live in `99.Storage-Shed/Attachments` (214 MB; 76 of the vault's 87 PDFs).
- Blocked-PDF references inside the publish set: AI-LLM 15, 03.Resources 7, 02.Areas 2 = 24.
- Custom CSS goes in `quartz/styles/custom.scss`. It should import the Catppuccin CSS palette (`@import url('https://cdn.jsdelivr.net/npm/@catppuccin/palette/css/catppuccin.css');`) or use the npm package to style elements following the Catppuccin style guide (e.g., using `overlay` variables for dimmed elements).
- Obsidian template sets `markdownLinkResolution: shortest` (matches the vault).

## Repo layout (in `~/Documents/Projects/obsidian-publish`)

```
publish.list                # allowlist — subpaths supported, edit to change what ships
scripts/sync-content.sh     # vault → content/ (notes + referenced assets, ext-allowlisted)
templates/index.md          # site homepage → content/index.md
content/                    # GITIGNORED, produced only by sync
quartz/styles/custom.scss   # dimming for broken links
.github/workflows/deploy.yml
```

`publish.list` as shipped:

```
02.Areas
03.Resources
05.Books
00.Fleeting Notes/AI-LLM
```

## Steps

1. **Scaffold** — clone `jackyzha0/quartz` template into the folder, `gh repo create nmdra/notes`,
   point `origin`, `npm i`, `npx quartz create --template obsidian --strategy new
-b notes.nimendra.online`, `npx quartz plugin install --from-config`, smoke build.
2. **Sync script** — for each allowlisted path: copy into `content/<same path>` filtered by
   extension allowlist (`md png jpg jpeg gif webp svg mp4 webm`; `.pdf`/`.epub`/`.docx`/`.canvas`/
   `.base` excluded implicitly); then parse copied notes for `![[...]]` / `![](...)` embeds,
   resolve them against the vault, copy only allowlisted referenced assets preserving
   vault-relative paths so `shortest` link resolution keeps working; copy `templates/index.md` →
   `content/index.md`; print report: notes, assets, blocked-doc refs, unresolved refs.
3. **Config & Theme** — `baseUrl: notes.nimendra.online`; `ignorePatterns: ["**/*.pdf", "**/*.epub",
"**/*.docx"]`; CrawlLinks `disableBrokenWikilinks: true`; add `CNAME` plugin; keep
   `RemoveDrafts`. Configure Catppuccin colors (Latte/Mocha) in `quartz.config.ts` theme section.
4. **Copyright layers**
   - L1 sync extension allowlist — PDF never enters `content/`
   - L2 `ignorePatterns` — Assets emitter skips it even if present
   - L3 mark broken — `disableBrokenWikilinks` + CSS in `custom.scss` dimming
     `a.internal.broken` using Catppuccin variables (e.g., `var(--ctp-mocha-overlay0)`) and appending "not published" via `::after` (with an accent color like `var(--ctp-mocha-red)`).
   - L4 CI gate — workflow fails the deploy if `find public -iname '*.pdf'` returns anything
5. **Secret** — `ssh-keygen -t ed25519` → public half registered as a read-only deploy key on
   `nmdra/Second-Brain`, private half as Actions secret `VAULT_DEPLOY_KEY` on `nmdra/notes`.
6. **Workflow** — triggers: `push` to default branch (`v5`), `workflow_dispatch`, daily
   `schedule`; steps: checkout Quartz → sparse-checkout vault into `.vault/` driven by
   `publish.list` → `sync-content.sh` → L4 gate after build → Node 24, `npm ci`,
   `npx quartz plugin install` (cached on `quartz.lock.json`) → `npx quartz build` →
   `upload-pages-artifact` (`public`) → `deploy-pages`. Pages source set to GitHub Actions.
7. **DNS (user)** — after first deploy:
   `CNAME  notes  →  nmdra.github.io`, then enable Enforce HTTPS.

## Verification

- Local: `./scripts/sync-content.sh && npx quartz build --serve` → selected notes render,
  images load, `public/` contains zero `.pdf` and no traces of `00.Fleeting Notes` (outside
  AI-LLM), `01.Projects`, `04.Archives`.
- Sync report blocked/unresolved lists match expectations (24 PDF refs + 1 canvas).
- Remote: deploy succeeds, L4 gate passes, canonical = `notes.nimendra.online`, broken links
  dimmed, a spot-checked PDF URL returns 404.
