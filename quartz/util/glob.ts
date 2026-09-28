import path from "path"
import { FilePath } from "./path"
import { globby } from "globby"

export function toPosixPath(fp: string): string {
  return fp.split(path.sep).join("/")
}

export async function glob(
  pattern: string,
  cwd: string,
  ignorePatterns: string[],
): Promise<FilePath[]> {
  const fps = (
    await globby(pattern, {
      cwd,
      ignore: ignorePatterns,
      // content/ is deliberately git-ignored (CI regenerates it from the vault
      // on every deploy). Honouring .gitignore here globs an empty directory
      // and silently deploys a site with no notes, so ignore only the
      // explicit ignorePatterns and treat the directory as-is.
      gitignore: false,
    })
  ).map(toPosixPath)
  return fps as FilePath[]
}
