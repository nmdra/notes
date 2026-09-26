import { loadQuartzConfig, loadQuartzLayout } from "./quartz/plugins/loader/config-loader"
import { componentRegistry } from "./quartz/components/registry"

componentRegistry.setOptionOverrides("@quartz-community/explorer", {
  filterFn: (node: any) => node.slugSegment !== "tags",
  mapFn: (node: any) => {
    if (node.displayName) {
      node.displayName = node.displayName.replace(/^\d+\.\s*/, "")
    }
    return node
  },
  order: ["filter", "sort", "map"],
})

const config = await loadQuartzConfig()
export default config
export const layout = await loadQuartzLayout()
