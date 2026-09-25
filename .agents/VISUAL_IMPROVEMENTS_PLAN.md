# Detailed Visual Polish Plan

> [!NOTE]
> This plan reflects the **current state** of the codebase as of Sep 25 2026. It audits what's already done, identifies gaps, and proposes new improvements.

---

## Status Audit

### ✅ Already Implemented
| Feature | Where |
|---|---|
| `is-index` condition | [conditions.ts](file:///home/nimendra/Documents/Projects/obsidian-publish/quartz/plugins/loader/conditions.ts) |
| Card grid for tag/folder pages | [custom.scss L156-216](file:///home/nimendra/Documents/Projects/obsidian-publish/quartz/styles/custom.scss#L156-L216) |
| Tag cloud on `/tags/` index | [custom.scss L222-227](file:///home/nimendra/Documents/Projects/obsidian-publish/quartz/styles/custom.scss#L222-L227) |
| Gradient hero title + shimmer | [custom.scss L232-272](file:///home/nimendra/Documents/Projects/obsidian-publish/quartz/styles/custom.scss#L232-L272) |
| Homepage callout hover | [custom.scss L278-285](file:///home/nimendra/Documents/Projects/obsidian-publish/quartz/styles/custom.scss#L278-L285) |
| Recent notes enabled (homepage-only) | [quartz.config.yaml L299-311](file:///home/nimendra/Documents/Projects/obsidian-publish/quartz.config.yaml#L299-L311) |
| Recent notes card styling | [custom.scss L290-322](file:///home/nimendra/Documents/Projects/obsidian-publish/quartz/styles/custom.scss#L290-L322) |
| Gradient HR | [custom.scss L327-338](file:///home/nimendra/Documents/Projects/obsidian-publish/quartz/styles/custom.scss#L327-L338) |
| Image border-radius | [custom.scss L340-343](file:///home/nimendra/Documents/Projects/obsidian-publish/quartz/styles/custom.scss#L340-L343) |
| Code block top accent | [custom.scss L345-348](file:///home/nimendra/Documents/Projects/obsidian-publish/quartz/styles/custom.scss#L345-L348) |
| Explorer active + folder hover | [custom.scss L353-388](file:///home/nimendra/Documents/Projects/obsidian-publish/quartz/styles/custom.scss#L353-L388) |
| Wider content on large screens | [custom.scss L393-397](file:///home/nimendra/Documents/Projects/obsidian-publish/quartz/styles/custom.scss#L393-L397) |
| Right sidebar polish (TOC, backlinks, graph) | [custom.scss L418-490](file:///home/nimendra/Documents/Projects/obsidian-publish/quartz/styles/custom.scss#L418-L490) |
| Graph colors (Frappé light mode) | [custom.scss L99-108](file:///home/nimendra/Documents/Projects/obsidian-publish/quartz/styles/custom.scss#L99-L108) |
| Search overlay fix | [custom.scss L122-151](file:///home/nimendra/Documents/Projects/obsidian-publish/quartz/styles/custom.scss#L122-L151) |
| Broken link toast | [custom.scss L495-520](file:///home/nimendra/Documents/Projects/obsidian-publish/quartz/styles/custom.scss#L495-L520) |
| Tag chip pills | [custom.scss L56-84](file:///home/nimendra/Documents/Projects/obsidian-publish/quartz/styles/custom.scss#L56-L84) |
| Vendored graph with custom node colors | [quartz.config.yaml L188-220](file:///home/nimendra/Documents/Projects/obsidian-publish/quartz.config.yaml#L188-L220) |

### ❌ Still Missing (from original plan)
| Feature | Status |
|---|---|
| **Homepage global graph** in `afterBody` | Not in config — only the sidebar local graph exists |
| **Homepage graph container sizing** (400px) | No CSS targeting homepage graph in afterBody |
| **`index.md` content rewrite** | Partially done — has hero + links but **missing topic directory callouts** (`> [!abstract] AI & LLMs`, etc.) and nav tips callout |

---

## New Visual Improvements

### 1. Homepage Global Graph — Config + CSS

Add a second graph instance to `quartz.config.yaml` (after the recent-notes entry):

```yaml
# Homepage global graph — full vault map, only on index page
- source: "./quartz/plugins/graph-local"
  enabled: true
  options:
    globalGraph:
      drag: true
      zoom: true
      depth: -1
      scale: 0.9
      repelForce: 0.5
      centerForce: 0.3
      linkDistance: 30
      fontSize: 0.6
      opacityScale: 1
      showTags: true
      focusOnHover: true
      enableRadial: true
  layout:
    position: afterBody
    priority: 20
    condition: is-index
```

> [!IMPORTANT]
> Uses the same vendored `./quartz/plugins/graph-local` source (not `@quartz-community/graph`) so graph node colors match the custom Frappé palette.

CSS for the homepage graph container:

```scss
// ---------------------------------------------------------------------------
// Homepage global graph — taller container in afterBody
// ---------------------------------------------------------------------------
body[data-slug="index"] .page-footer .graph {
  margin-top: 1.5rem;

  .graph-outer {
    height: 420px;
    max-height: 55vh;
    border: 1px solid var(--lightgray);
    border-radius: 10px;
    overflow: hidden;
  }

  // Match the sidebar label style
  > h3 {
    font-size: 0.78rem;
    font-weight: 600;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--darkgray);
  }
}
```

---

### 2. Popover (Hover Preview) Polish

The link popover uses default styles. Make it feel like a mini card:

```scss
// ---------------------------------------------------------------------------
// Popovers — card-style hover previews
// ---------------------------------------------------------------------------
.popover {
  border-radius: 10px;
  border: 1px solid var(--lightgray);
  box-shadow: 0 8px 30px rgba(0, 0, 0, 0.12);
  overflow: hidden;

  // Kill the default inner border
  > .popover-inner {
    border: none;
    padding: 0.8rem 1rem;
  }

  // Title in the preview
  h1 {
    font-size: 1.1rem;
    margin-top: 0;
    margin-bottom: 0.4rem;
    color: var(--secondary);
  }

  p {
    font-size: 0.88rem;
    line-height: 1.5;
  }
}
```

---

### 3. Blockquote Accent Upgrade

The default blockquote uses a 3px solid `--secondary` left border. Upgrade to a gradient:

```scss
// ---------------------------------------------------------------------------
// Blockquotes — gradient left border, subtle background
// ---------------------------------------------------------------------------
blockquote {
  border-left: 3px solid transparent;
  border-image: linear-gradient(
    to bottom,
    var(--secondary),
    var(--tertiary)
  ) 1;
  background: color-mix(in srgb, var(--lightgray) 30%, transparent);
  padding: 0.6rem 1rem;
  border-radius: 0 6px 6px 0;
}
```

---

### 4. Table Styling

Tables currently have minimal styling. Add striped rows and hover:

```scss
// ---------------------------------------------------------------------------
// Tables — alternating rows, hover, rounded container
// ---------------------------------------------------------------------------
.table-container {
  border: 1px solid var(--lightgray);
  border-radius: 8px;
  overflow: hidden;

  > table {
    margin: 0;
    width: 100%;

    th {
      background: color-mix(in srgb, var(--lightgray) 60%, transparent);
      font-size: 0.9em;
      text-transform: uppercase;
      letter-spacing: 0.04em;
    }

    tr:nth-child(even) {
      background: color-mix(in srgb, var(--lightgray) 25%, transparent);
    }

    tr:hover {
      background: color-mix(in srgb, var(--tertiary) 8%, transparent);
    }
  }
}
```

---

### 5. Footer Polish

The footer is plain. Add a top separator and muted style:

```scss
// ---------------------------------------------------------------------------
// Footer — subtle separator, compact links
// ---------------------------------------------------------------------------
footer {
  border-top: 1px solid var(--lightgray);
  padding-top: 1.5rem;
  margin-top: 2rem;

  p {
    font-size: 0.82rem;
    opacity: 0.7;
  }

  a {
    font-weight: 500;
    transition: color 0.15s ease;

    &:hover {
      color: var(--tertiary);
    }
  }
}
```

---

### 6. Smooth Page Transitions (SPA)

Since `enableSPA: true`, add a subtle content fade-in:

```scss
// ---------------------------------------------------------------------------
// SPA page transition — fade in content
// ---------------------------------------------------------------------------
article {
  animation: fadeInUp 0.25s ease-out;
}

@keyframes fadeInUp {
  from {
    opacity: 0;
    transform: translateY(6px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
```

---

### 7. Inline Code Polish

Inline `code` looks flat. Make it pop slightly:

```scss
// ---------------------------------------------------------------------------
// Inline code — subtle outline, better contrast
// ---------------------------------------------------------------------------
code {
  border: 1px solid color-mix(in srgb, var(--gray) 40%, transparent);
  padding: 0.15rem 0.35rem;
}
```

---

### 8. Mobile Navigation Bar Polish

On mobile, the left sidebar collapses to a horizontal toolbar. Style it cleaner:

```scss
// ---------------------------------------------------------------------------
// Mobile top bar — cleaner spacing, subtle bottom border
// ---------------------------------------------------------------------------
@media all and (max-width: 800px) {
  .sidebar.left {
    border-bottom: 1px solid var(--lightgray);
    padding-bottom: 0.6rem;
    margin-bottom: 0.5rem;
    gap: 0.5rem;
  }

  // Page title smaller on mobile
  .page-title {
    font-size: 1rem;
  }
}
```

---

### 9. Breadcrumb Styling

Breadcrumbs currently render with default link styles. Make them lighter:

```scss
// ---------------------------------------------------------------------------
// Breadcrumbs — quieter, muted trail
// ---------------------------------------------------------------------------
.breadcrumb-container {
  font-size: 0.82rem;
  opacity: 0.7;
  margin-bottom: 0.5rem;

  a {
    font-weight: 500;
    color: var(--darkgray);

    &:hover {
      color: var(--secondary);
    }
  }

  // Separator arrow
  .breadcrumb-element:not(:last-child)::after {
    opacity: 0.4;
  }
}
```

---

### 10. Content Meta (Date + Reading Time) Polish

The content meta line sits above article body. Make it more refined:

```scss
// ---------------------------------------------------------------------------
// Content meta — date and reading time
// ---------------------------------------------------------------------------
.content-meta {
  font-size: 0.82rem;
  opacity: 0.65;
  padding-bottom: 0.5rem;
  border-bottom: 1px solid var(--lightgray);
  margin-bottom: 1.5rem;
}
```

---

### 11. Scrollbar Styling (Dark Mode)

Catppuccin Macchiato has a dark surface (`#161618`). Default scrollbars look jarring:

```scss
// ---------------------------------------------------------------------------
// Custom scrollbar — matches Catppuccin surface
// ---------------------------------------------------------------------------
:root[saved-theme="dark"] {
  * {
    scrollbar-width: thin;
    scrollbar-color: var(--gray) transparent;
  }

  ::-webkit-scrollbar {
    width: 6px;
    height: 6px;
  }

  ::-webkit-scrollbar-track {
    background: transparent;
  }

  ::-webkit-scrollbar-thumb {
    background: var(--gray);
    border-radius: 3px;

    &:hover {
      background: var(--darkgray);
    }
  }
}
```

---

### 12. `index.md` Content — Topic Directory

The current homepage is missing the topic callouts. Add them:

```markdown
---
title: Nimendra's Notes
---

# Hey 👋, I'm Nimendra

Welcome to my notes. Browse the folders in the **explorer** on the left,
or use **search** to find something specific.

> [!tip] Navigation tips
> - **Search** — press `Alt + /` or click the search icon
> - **Hover** any [[wikilink]] for a preview popup
> - **Graph** — press `Ctrl + G` for the full vault map
> - **Explorer** — browse folders in the left sidebar

---

## 📚 What's Inside

> [!abstract] AI & LLMs
> Book notes and deep dives on language models, agents, RAG,
> fine-tuning, and inference optimization.
>
> → [[1. Introduction to LLMs|Designing LLM Applications]]
> · [[Hands-on Large Language Models]]
> · [[1. Introduction to AI Agents|AI Agents]]

> [!abstract] LLM Internals
> Caching strategies, quantization, mixture of experts, and
> model architecture details.
>
> → [[Prefix vs KV vs Prompt Caching]]
> · [[LLM quantization]]
> · [[Mixture of Experts (MoE)]]

---

**Explore more**

- **[Read my blog](https://blog.nimendra.online/)** — longer-form writing
- **[About me](https://blog.nimendra.online/about)** — who I am

**Find me elsewhere**

[GitHub](https://github.com/nmdra) ·
[LinkedIn](https://www.linkedin.com/in/nimendra/) ·
[X](https://x.com/nimendra_) ·
[Bluesky](https://bsky.app/profile/nimendra.xyz) ·
[Email](mailto:nimendraonline@gmail.com)

> [!note]- About broken links
> Some notes link to pages I haven't published yet.
> Those links still work — they just land on a 404.
```

---

## Summary — What to Do

| # | Change | File | Priority |
|---|---|---|---|
| 1 | **Homepage global graph** | `quartz.config.yaml` + `custom.scss` | 🔴 High |
| 2 | **Popover card styling** | `custom.scss` | 🟡 Medium |
| 3 | **Blockquote gradient border** | `custom.scss` | 🟡 Medium |
| 4 | **Table striped rows** | `custom.scss` | 🟡 Medium |
| 5 | **Footer separator + muted** | `custom.scss` | 🟢 Low |
| 6 | **SPA fade-in animation** | `custom.scss` | 🟢 Low |
| 7 | **Inline code outline** | `custom.scss` | 🟢 Low |
| 8 | **Mobile nav bar polish** | `custom.scss` | 🟡 Medium |
| 9 | **Breadcrumb muting** | `custom.scss` | 🟢 Low |
| 10 | **Content meta separator** | `custom.scss` | 🟢 Low |
| 11 | **Dark mode scrollbar** | `custom.scss` | 🟡 Medium |
| 12 | **`index.md` topic directory** | `content/index.md` | 🔴 High |

> [!TIP]
> Items 1 and 12 are the **biggest visual wins** — the graph gives the homepage a "wow" factor, and the topic callouts turn it from a plain greeting into a useful entry point.
