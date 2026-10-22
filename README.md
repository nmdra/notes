# notes.nimendra.online

Public notes from my Obsidian vault, built with [Quartz 5](https://quartz.jzhao.xyz/)
and deployed to GitHub Pages.

**Site:** https://notes.nimendra.online

## What gets published

[`publish.list`](publish.list) selects vault-relative folders. For example:

```text
Notes/Published
!Notes/Published/Private
```

A line starting with `!` excludes a folder and wins over any include. Write each
rule on its own line; inline comments are not supported.

The sync copies Markdown, supported media, and validated Obsidian canvases from
included folders. Referenced supported media can also be copied from outside
those folders, such as a shared attachment directory. Explicit exclusions still
apply. Review screenshots, canvas text, attachments, and embedded metadata before
publishing them. File extensions alone do not establish privacy or redistribution
rights.

PDF, EPUB, Office, archive, and base files are blocked. CI checks `content/` and
`public/` for blocked files and symlinks. These gates do not certify that allowed
text or images are safe to publish. Broken-link notices do not redact private
note titles or link targets.

`content/` and `public/` are generated and must not be committed. **Git history is
a separate publication surface:** adding an ignore rule or deleting a tracked
file does not remove its earlier versions. Historical content and existing
GitHub Actions logs still need owner review before making this repository public.
See the [public-release plan](.agents/plans/public-release.md).

## Configure deployment

Set these in the repository's Actions settings before the next deployment:

| Setting                     | Purpose                                            |
| --------------------------- | -------------------------------------------------- |
| Variable `VAULT_REPOSITORY` | Source vault repository in `owner/repository` form |
| Secret `REPO_KEY`           | Read-only access limited to that source repository |

The repository variable removes a hardcoded private repository identity from
source. It is **not a secret**: checkout actions can show it in public logs.
Review the token's scope and expiry in GitHub settings without printing its value.

Only trusted publication code may run with access to the private vault. Protect
`v5` and require review for workflow, script, dependency, and plugin changes. Do
not add private-vault access to workflows that execute untrusted pull-request
code. Public visibility alone does not grant visitors permission to run this
privileged publication workflow.

## Publish a note

Write the note in Obsidian, then push approved publication changes to `v5`. CI:

1. checks out the configured private vault using `REPO_KEY`,
2. syncs selected content into a fresh `content/` directory,
3. checks blocked files and symlinks, then runs types and tests,
4. builds, checks, and deploys the generated site to GitHub Pages.

The workflow regenerates `content/` rather than trusting a copy from the push.
The sync also copies `templates/llms.txt` to `content/llms.txt`, which Quartz copies
to the site root. CI checks that the emitted file matches the template.

Sync reports show counts by default. Detailed local reports are opt-in and can
contain private filenames and link targets. Do not attach those reports to public
issues or retain them in public Actions logs. Other build tools and failures can
also print source details; review logs before publication.

## Local preview

```bash
npm ci
./scripts/sync-content.py --vault /path/to/private-vault
npm run install-plugins
npx quartz build --serve # http://localhost:8080
```

Use `--verbose` for a detailed local sync report, or `--quiet` to suppress the
successful report. The file checker also accepts `--verbose` for local use.
Set `VAULT_PATH` as an alternative to `--vault`. One of these is required; the
previous machine-specific vault default has been removed. Keep local environment
files and private checkouts out of Git.

## Layout

| Path                             | Purpose                                             |
| -------------------------------- | --------------------------------------------------- |
| `publish.list`                   | Folder includes and exclusions                      |
| `scripts/sync-content.py`        | Content sync, source-boundary checks, and reporting |
| `scripts/check-blocked-files.py` | Blocked-format and symlink gate                     |
| `content/`                       | Generated publication input, ignored by Git         |
| `templates/index.md`             | Homepage source                                     |
| `templates/llms.txt`             | Site overview                                       |
| `quartz.config.yaml`             | Site configuration and plugin selection             |
| `quartz/styles/custom.scss`      | Site-specific CSS                                   |
| `.github/workflows/deploy.yml`   | Trusted publication workflow                        |

## Checks

```bash
python3 -m unittest discover -s scripts -p 'test_*.py'
npx tsc --noEmit
npm test -- 'quartz/**/*.test.{ts,js}'
```

After an approved local sync and build, run:

```bash
python3 scripts/check-blocked-files.py content
python3 scripts/check-blocked-files.py public
```

Canvas text validation supports a conservative Markdown subset. It checks inline
and reference-style destinations and rejects ambiguous syntax. It is not a full
Markdown parser and can reject valid text. Canvas URL nodes permit HTTP(S) links;
other schemes fail validation. HTML link/source attributes are checked, including
unquoted values; `srcset` and `srcdoc` are not supported. Review any rejected
canvas locally with `--verbose`, without publishing the diagnostic output.

Review the actual emitted pages, search indexes, graph data, feeds, canvases, and
media before public release. Never use a passing suffix check as approval of
private information or copyrighted material.

## Custom domain

The CNAME plugin generates the domain configured in `quartz.config.yaml`. DNS
uses a `CNAME` record for `notes` pointing at `nmdra.github.io`. Enable
_Enforce HTTPS_ in the repository's Pages settings.

---

Built with Quartz. Retain the upstream [MIT license](LICENSE.txt).
Site content © [Nimendra](https://github.com/nmdra); the code license does not
automatically grant redistribution rights for third-party excerpts or images.
