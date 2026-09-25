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

1. Edit `publish.list` if a new folder (or exclusion) is needed.
2. Run `./scripts/sync-content.py`. It copies only what `publish.list` allows out of the
   vault and prints a report: blocked documents, links that leave the publish set, and
   unresolved references.
3. Commit and push to `v5`.

The GitHub Actions workflow rebuilds and deploys. It never sees the vault — `content/` is
committed, so the pipeline only needs `npm ci` and a build.

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
| `content/`                     | generated, committed copy of the published set        |
| `templates/index.md`           | homepage source                                       |
| `quartz.config.yaml`           | site config: baseUrl, plugins, `ignorePatterns`       |
| `quartz/styles/custom.scss`    | site-specific CSS overrides                           |
| `.github/workflows/deploy.yml` | build + deploy with the copyright gates               |

## Custom domain

`CNAME` holds `notes.nimendra.online`. DNS: a `CNAME` record for `notes` pointing at
`nmdra.github.io`, then enable _Enforce HTTPS_ in the repository's Pages settings.

---

Built with Quartz. Site content © [Nimendra](https://github.com/nmdra).
