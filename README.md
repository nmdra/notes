# notes.nimendra.online

Public notes from my Obsidian vault, built with [Quartz 5](https://quartz.jzhao.xyz/) and
deployed to GitHub Pages.

**Site:** https://notes.nimendra.online

## What gets published

Only the folders listed in [`publish.list`](publish.list) are published:

```
00.Fleeting Notes/AI-LLM
!00.Fleeting Notes/AI-LLM/Harness Engineering   # excluded
```

A line starting with `!` excludes a folder, and wins over any include. Everything else in
the vault stays private.

Documents are never published: `scripts/sync-content.py` only copies an allowlist of
extensions (markdown + images), and both the sync report and the CI build fail if a PDF,
EPUB, Office file, canvas or base reaches `content/` or `public/`.

## Publish a note

Write the note in Obsidian, then push this repository to `v5`. CI:

1. checks out the private vault `nmdra/Second-Brain` with the `REPO_KEY` secret,
2. runs `./scripts/sync-content.py --vault vault` to write `content/`,
3. fails the build if a document-shaped file ever reaches `content/` or `public/`,
4. builds and deploys to GitHub Pages.

The workflow never reads `content/` from the push — it is regenerated on every
deploy, so a stale or hand-edited copy cannot go live. Running the sync locally
(before `npx quartz build`) keeps your preview identical to what CI publishes.

The sync also copies `templates/llms.txt` to `content/llms.txt`. Quartz copies it to
`public/llms.txt` without a plugin. Edit the template to change the site overview.
The sitemap lists the published pages. CI checks that the root file matches the template.

## Local preview

```bash
npm ci
./scripts/sync-content.py        # refresh content/ from the vault
npx quartz build --serve         # http://localhost:8080
```

## Layout

| Path                           | Purpose                                               |
| ------------------------------ | ----------------------------------------------------- |
| `publish.list`                 | folder allowlist — the only knob for what goes public |
| `scripts/sync-content.py`      | vault → `content/` sync, extension allowlist, report  |
| `content/`                     | generated from the vault, never committed             |
| `templates/index.md`           | homepage source                                       |
| `templates/llms.txt`           | static agent-facing site overview                     |
| `quartz.config.yaml`           | site config: baseUrl, plugins, `ignorePatterns`       |
| `quartz/styles/custom.scss`    | site-specific CSS overrides                           |
| `.github/workflows/deploy.yml` | vault checkout → sync → gates → build → deploy        |

### Secrets

| Secret     | Used for                                                        |
| ---------- | --------------------------------------------------------------- |
| `REPO_KEY` | read access to the private `nmdra/Second-Brain` vault during CI |

## Custom domain

`CNAME` holds `notes.nimendra.online`. DNS: a `CNAME` record for `notes` pointing at
`nmdra.github.io`, then enable _Enforce HTTPS_ in the repository's Pages settings.

---

Built with Quartz. Site content © [Nimendra](https://github.com/nmdra).
