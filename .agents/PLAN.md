# Historical Plan: Publish selected Obsidian content with Quartz

**Status: historical record.** This plan records the initial publishing design. It is not an operational runbook. Use the [README](../README.md) for current setup and publishing instructions, [quartz.config.yaml](../quartz.config.yaml) for active configuration, and the [UI and UX plan](plans/Plan.md) for the current interface work.

## Original design

- Publish only explicitly selected content from a private Obsidian source. Keep the source separate from the public site repository.
- Generate `content/` with a sync step rather than maintain a second copy of notes by hand.
- Copy only supported content and referenced media. Keep restricted document formats out of both the generated content and the published output.
- Apply independent checks during sync and deployment so an accidental restricted file cannot reach the site.
- Make unpublished links visibly distinct from available pages.
- Build with Quartz and deploy to GitHub Pages at [notes.nimendra.online](https://notes.nimendra.online).
- Keep the Catppuccin theme and a template-driven homepage.

## Current sources of truth

| Concern                      | Source                                                          |
| ---------------------------- | --------------------------------------------------------------- |
| Publication selection        | [publish.list](../publish.list)                                 |
| Content sync                 | [scripts/sync-content.py](../scripts/sync-content.py)           |
| Homepage source              | [templates/index.md](../templates/index.md)                     |
| Site configuration           | [quartz.config.yaml](../quartz.config.yaml)                     |
| Site styles                  | [quartz/styles/custom.scss](../quartz/styles/custom.scss)       |
| Deployment and output checks | [.github/workflows/deploy.yml](../.github/workflows/deploy.yml) |

The original scaffold commands, machine-specific paths, source inventory, and credential setup are retired. Refer to the current sources above before changing publication behavior.
