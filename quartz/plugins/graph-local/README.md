# graph-local

A vendored copy of [`@quartz-community/graph`](https://github.com/quartz-community/graph)
(MIT, © Quartz Community) with one change, so the site can restyle graph nodes
without restyling the rest of the theme.

## Why it exists

The upstream plugin resolves node colors from CSS custom properties on
`:root` — `--secondary` (focused note), `--tertiary` (neighbours and tags),
`--gray` (everything else). Those same variables drive link, border and chip
colors, so overriding them for the graph would recolor the whole site.

Light mode also had the focused note and its neighbours set to the _same_
value (`--secondary` and `--tertiary` both resolve to `#727bfd`-family
periwinkle), so the two most important node roles were indistinguishable.

## The change

`dist/index.js` now reads `--graph-node-current`, `--graph-node-neighbor` and
`--graph-node-other` first and falls back to the original theme variables:

```js
var __gv = function (n, f) {
  return Z.getPropertyValue(n).trim() || Z.getPropertyValue(f).trim()
}
var Ie = h(__gv("--graph-node-current", "--secondary"), "#c792ea")
var Qu = h(__gv("--graph-node-neighbor", "--tertiary"), "#82aaff")
var ue = h(__gv("--graph-node-other", "--gray"), "#6c6c6c")
```

The three `--graph-node-*` values are declared in `quartz/styles/custom.scss`
for light mode only, using Catppuccin Frappé (blue / mauve / overlay0). Dark
mode declares none of them and keeps the theme's Macchiato colors.

Everything else in `dist/` is byte-identical to the published package.

## Updating

```sh
npm pack @quartz-community/graph@latest
# untar, replace dist/, re-apply the __gv patch above, update package.json
```

Configured in `quartz.config.yaml` as `source: "./quartz/plugins/graph-local"`.
