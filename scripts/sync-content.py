#!/usr/bin/env python3
"""Sync allowlisted vault folders into content/ for Quartz.

Two modes, one code path:
  * local : the vault is a full working tree -> files are read from disk
            (so uncommitted edits still show up in `quartz build --serve`)
  * sparse : the vault is a `--filter=blob:none --no-checkout` clone ->
            files are enumerated with `git ls-tree` and extracted with
            `git cat-file blob HEAD:<path>`, which lazily fetches only the
            blobs that are actually referenced

Copyright safety: only extensions in ASSET_ALLOW are ever copied out of the
vault. Documents (pdf/epub/docx/...), canvases and bases are never written to
content/; every reference to one is reported instead.

Usage:
    ./scripts/sync-content.py [--vault PATH] [--quiet]
"""

from __future__ import annotations

import argparse
import os
import re
import shutil
import subprocess
import sys
import urllib.parse
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PUBLISH_LIST = ROOT / "publish.list"
CONTENT = ROOT / "content"
HOME_PAGE = ROOT / "templates" / "index.md"

NOTE_EXT = ".md"
# allowlist: nothing outside this set ever leaves the vault
ASSET_ALLOW = {
    ".png",
    ".jpg",
    ".jpeg",
    ".gif",
    ".webp",
    ".svg",
    ".bmp",
    ".ico",
    ".mp4",
    ".webm",
    ".ogg",
    ".mp3",
    ".wav",
}
# copyrighted / document formats: never published
BLOCKED_EXT = {
    ".pdf",
    ".epub",
    ".mobi",
    ".azw3",
    ".doc",
    ".docx",
    ".odt",
    ".rtf",
    ".ppt",
    ".pptx",
    ".odp",
    ".xls",
    ".xlsx",
    ".ods",
    ".csv",
    ".zip",
    ".7z",
    ".rar",
    ".tar",
    ".gz",
}
# decided: canvases and bases are not published
SKIP_EXT = {".canvas", ".base"}
FILE_EXT = ASSET_ALLOW | BLOCKED_EXT | SKIP_EXT | {NOTE_EXT}

WIKILINK_RE = re.compile(r"!?\[\[([^\]\n]+?)\]\]")
MD_LINK_RE = re.compile(
    r"!?\[[^\]\n]*\]\(\s*<?([^)\s>]+)>?(?:\s+[\"'][^\"']*[\"'])?\s*\)"
)
HTML_REF_RE = re.compile(r"""(?:src|href)\s*=\s*["']([^"']+)["']""", re.IGNORECASE)
# text Quartz never turns into a link — scanning it only produces noise
CODE_FENCE_RE = re.compile(r"```.*?```", re.DOTALL)
INLINE_CODE_RE = re.compile(r"`[^`\n]*`")
OBSIDIAN_COMMENT_RE = re.compile(r"%%.*?%%", re.DOTALL)

EXTERNAL_PREFIX = ("http://", "https://", "mailto:", "obsidian://", "//", "#", "data:")


class Vault:
    def __init__(self, root: Path):
        self.root = root.resolve()
        self.git_dir = self.root / ".git"
        # no worktree (sparse / --no-checkout clone) => talk to git directly
        entries = (
            [e for e in self.root.iterdir() if e.name != ".git"]
            if self.root.is_dir()
            else []
        )
        self.use_git = not entries

    def die(self, msg: str) -> "None":
        print(f"error: {msg}", file=sys.stderr)
        raise SystemExit(1)

    def all_files(self) -> list[str]:
        if self.use_git:
            out = self._git(["ls-tree", "-r", "--name-only", "HEAD"])
            return [p for p in out.splitlines() if p]
        files: list[str] = []
        for dirpath, dirnames, filenames in os.walk(self.root):
            dirnames[:] = [d for d in dirnames if not d.startswith(".")]
            for f in filenames:
                rel = os.path.relpath(os.path.join(dirpath, f), self.root)
                if not any(part.startswith(".") for part in rel.split(os.sep)):
                    files.append(rel.replace(os.sep, "/"))
        return files

    def read(self, rel: str) -> bytes | None:
        if not self._safe(rel):
            return None
        disk = self.root / rel
        if not self.use_git and disk.is_file():
            return disk.read_bytes()
        try:
            proc = subprocess.run(
                ["git", "-C", str(self.root), "cat-file", "blob", f"HEAD:{rel}"],
                capture_output=True,
                check=True,
            )
            return proc.stdout
        except subprocess.CalledProcessError:
            return None

    def _git(self, args: list[str]) -> str:
        proc = subprocess.run(
            ["git", "-C", str(self.root), *args],
            capture_output=True,
            text=True,
            check=True,
        )
        return proc.stdout

    @staticmethod
    def _safe(rel: str) -> bool:
        if not rel or rel.startswith("/") or rel.startswith("\\"):
            return False
        return not any(part in ("..", "") for part in rel.replace("\\", "/").split("/"))


class Report:
    def __init__(self) -> None:
        self.notes = 0
        self.assets = 0
        self.asset_bytes = 0
        self.blocked: dict[str, set[str]] = defaultdict(set)
        self.skipped: dict[str, set[str]] = defaultdict(set)
        self.outside: dict[str, set[str]] = defaultdict(set)
        self.unresolved: dict[str, set[str]] = defaultdict(set)

    def add(self, bucket: dict, ref: str, by: str) -> None:
        bucket[ref].add(by)


def read_publish_list() -> tuple[list[str], list[str]]:
    """Parse publish.list into (includes, excludes).

    A line is an include. A line prefixed with `!` is an exclude, which wins
    over any include that covers it.
    """
    if not PUBLISH_LIST.is_file():
        print(f"error: {PUBLISH_LIST} not found", file=sys.stderr)
        raise SystemExit(1)
    includes: list[str] = []
    excludes: list[str] = []
    for raw in PUBLISH_LIST.read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if not line or line.startswith("#"):
            continue
        negated = line.startswith("!")
        entry = line.lstrip("!").lstrip("/").rstrip("/")
        if not entry:
            continue
        bucket = excludes if negated else includes
        if entry in bucket:
            continue
        bucket.append(entry)
    if not includes:
        print("error: publish.list has no includes", file=sys.stderr)
        raise SystemExit(1)
    return includes, excludes


def under(rel: str, root: str) -> bool:
    return rel == root or rel.startswith(root + "/")


def in_publish_set(rel: str, includes: list[str], excludes: list[str]) -> bool:
    if any(under(rel, e) for e in excludes):
        return False
    return any(under(rel, e) for e in includes)


def ext_of(rel: str) -> str:
    return Path(rel).suffix.lower()


def split_ref(target: str) -> str:
    """Drop heading/block anchors and wikilink aliases from a reference."""
    target = target.strip()
    if "|" in target:
        target = target.split("|", 1)[0]
    if "#" in target:
        target = target.split("#", 1)[0]
    return target.strip().strip("<>")


def refs_of(text: str) -> list[str]:
    text = CODE_FENCE_RE.sub(" ", text)
    text = INLINE_CODE_RE.sub(" ", text)
    text = OBSIDIAN_COMMENT_RE.sub(" ", text)
    found: list[str] = []
    for regex in (WIKILINK_RE, MD_LINK_RE, HTML_REF_RE):
        for m in regex.findall(text):
            found.append(split_ref(urllib.parse.unquote(m)))
    return [r for r in found if r and not r.startswith(EXTERNAL_PREFIX)]


def resolve(ref: str, index: dict[str, list[str]], vault_rel: str | None) -> str | None:
    """Resolve a reference the way Obsidian's `shortest` strategy does."""
    if vault_rel and index.get(ref.lower()):
        # prefer a sibling of the referencing note
        pass
    if ref.lower().endswith(NOTE_EXT):
        candidates = [ref]
    else:
        candidates = [ref, ref + NOTE_EXT]
    for cand in candidates:
        if cand in index_paths(index, cand):
            return cand
    # basename fallback (shortest link resolution)
    base = Path(ref).name
    for name in (base, base + NOTE_EXT):
        hits = index.get(name.lower())
        if hits:
            if vault_rel:
                parent = str(Path(vault_rel).parent).replace("\\", "/")
                for hit in hits:
                    if str(Path(hit).parent).replace("\\", "/") == parent:
                        return hit
            return sorted(hits, key=len)[0]
    return None


def index_paths(index: dict[str, list[str]], cand: str) -> list[str]:
    return index.get(cand.lower(), [])


def build_index(all_files: list[str]) -> dict[str, list[str]]:
    index: dict[str, list[str]] = defaultdict(list)
    for rel in all_files:
        index[Path(rel).name.lower()].append(rel)
    return index


def copy_into_content(vault: Vault, rel: str) -> bool:
    data = vault.read(rel)
    if data is None:
        return False
    dest = CONTENT / rel
    dest.parent.mkdir(parents=True, exist_ok=True)
    dest.write_bytes(data)
    return True


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument(
        "--vault",
        default=os.environ.get("VAULT_PATH"),
        help="path to the Obsidian vault",
    )
    ap.add_argument("--quiet", action="store_true")
    args = ap.parse_args()

    vault_path = (
        Path(args.vault).expanduser()
        if args.vault
        else (Path.home() / "Documents" / "Second Brain 2.0")
    )
    if not vault_path.is_dir():
        print(f"error: vault not found: {vault_path}", file=sys.stderr)
        print("       set VAULT_PATH or pass --vault", file=sys.stderr)
        return 1

    includes, excludes = read_publish_list()
    vault = Vault(vault_path)
    report = Report()

    if CONTENT.exists():
        shutil.rmtree(CONTENT)
    CONTENT.mkdir(parents=True)
    (CONTENT / ".gitkeep").touch()  # keeps the (empty) directory tracked by git

    all_files = vault.all_files()
    if not all_files:
        print("error: vault has no files (empty clone?)", file=sys.stderr)
        return 1
    index = build_index(all_files)

    # 1. copy the allowlisted folders (notes + locally stored allowed assets)
    note_files: list[str] = []
    for entry in includes:
        matches = [f for f in all_files if under(f, entry)]
        if not matches:
            print(f"error: publish entry not found in vault: {entry}", file=sys.stderr)
            return 1
        for rel in matches:
            parts = rel.split("/")
            if any(p.startswith(".") for p in parts[:-1]):
                continue
            if any(under(rel, e) for e in excludes):
                continue
            ext = ext_of(rel)
            if ext == NOTE_EXT:
                if copy_into_content(vault, rel):
                    note_files.append(rel)
                    report.notes += 1
            elif ext in ASSET_ALLOW:
                if copy_into_content(vault, rel):
                    report.assets += 1
                    report.asset_bytes += (CONTENT / rel).stat().st_size
            elif ext in BLOCKED_EXT:
                report.add(report.blocked, rel, "(stored in publish set)")
            elif ext in SKIP_EXT:
                report.add(report.skipped, rel, "(stored in publish set)")
            # anything else: allowlist means "not copied"

    # 2. resolve every reference inside the copied notes
    for rel in note_files:
        text = (CONTENT / rel).read_text(encoding="utf-8", errors="ignore")
        for ref in refs_of(text):
            ext = ext_of(ref)
            if ext == NOTE_EXT or (ext == "" and not Path(ref).suffix):
                # note reference
                target = resolve(ref, index, rel)
                if target is None:
                    report.add(report.unresolved, ref, rel)
                elif not in_publish_set(target, includes, excludes):
                    report.add(report.outside, target, rel)
                elif target not in note_files and ext == NOTE_EXT:
                    if not copy_into_content(vault, target):
                        report.add(report.unresolved, ref, rel)
                    else:
                        note_files.append(target)
                        report.notes += 1
                continue

            target = resolve(ref, index, rel)
            if target is None:
                report.add(report.unresolved, ref, rel)
                continue
            next_ext = ext_of(target)
            if next_ext in BLOCKED_EXT:
                report.add(report.blocked, target, rel)
            elif next_ext in SKIP_EXT:
                report.add(report.skipped, target, rel)
            elif next_ext in ASSET_ALLOW:
                if any(under(target, e) for e in excludes):
                    report.add(report.outside, target, rel)
                elif not (CONTENT / target).exists():
                    if copy_into_content(vault, target):
                        report.assets += 1
                        report.asset_bytes += (CONTENT / target).stat().st_size
                    else:
                        report.add(report.unresolved, ref, rel)
            elif next_ext == NOTE_EXT:
                if not in_publish_set(target, includes, excludes):
                    report.add(report.outside, target, rel)
                elif not (CONTENT / target).exists():
                    if copy_into_content(vault, target):
                        note_files.append(target)
                        report.notes += 1
            else:
                report.add(report.skipped, target, rel)

    # 3. site home page
    if HOME_PAGE.is_file():
        shutil.copyfile(HOME_PAGE, CONTENT / "index.md")
    else:
        print(f"warning: {HOME_PAGE} missing, no homepage written", file=sys.stderr)

    if not args.quiet:
        print_report(report, includes, excludes, vault)
    return 0


def print_report(
    r: Report, includes: list[str], excludes: list[str], vault: Vault
) -> None:
    print()
    print("sync report")
    print(
        f"  mode:              {'git (sparse clone)' if vault.use_git else 'worktree'}"
    )
    print(f"  publish entries:   {len(includes)}")
    for e in includes:
        print(f"    - {e}")
    if excludes:
        print(f"  excluded entries:  {len(excludes)}")
        for e in excludes:
            print(f"    ! {e}")
    print(f"  notes copied:      {r.notes}")
    print(f"  assets copied:     {r.assets} ({r.asset_bytes / 1024 / 1024:.1f} MB)")
    print(f"  BLOCKED documents: {len(r.blocked)}  <- never published")
    for ref, by in sorted(r.blocked.items()):
        who = ", ".join(sorted(by)[:3])
        print(f"    ! {ref}  (referenced by: {who})")
    print(f"  skipped canvas/base: {len(r.skipped)}")
    for ref, by in sorted(r.skipped.items()):
        print(f"    - {ref}  (referenced by: {', '.join(sorted(by)[:3])})")
    print(f"  links outside publish set: {len(r.outside)}")
    for ref, by in sorted(r.outside.items())[:15]:
        print(f"    - {ref}  (from {', '.join(sorted(by)[:2])})")
    if len(r.outside) > 15:
        print(f"    ... and {len(r.outside) - 15} more")
    print(f"  unresolved refs:   {len(r.unresolved)}")
    for ref, by in sorted(r.unresolved.items())[:15]:
        print(f"    ? {ref}  (from {', '.join(sorted(by)[:2])})")
    if len(r.unresolved) > 15:
        print(f"    ... and {len(r.unresolved) - 15} more")
    print()


if __name__ == "__main__":
    sys.exit(main())
