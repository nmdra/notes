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
vault. Documents (pdf/epub/docx/...) and bases are never written to content/;
every reference to one is reported instead. Obsidian canvases are published from
allowlisted folders.

Reports contain counts only by default. Use --verbose only for trusted local logs.
Set --vault or VAULT_PATH explicitly; there is no machine-specific default.

Usage:
    ./scripts/sync-content.py [--vault PATH] [--quiet] [--verbose]
"""

from __future__ import annotations

import argparse
import html
import json
import os
import re
import shutil
import stat
import subprocess
import sys
import urllib.parse
from collections import defaultdict
from html.parser import HTMLParser
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PUBLISH_LIST = ROOT / "publish.list"
CONTENT = ROOT / "content"
HOME_PAGE = ROOT / "templates" / "index.md"
LLMS_TXT = ROOT / "templates" / "llms.txt"

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
    ".canvas",
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
# Obsidian canvases are supported by Quartz; bases remain unpublished.
SKIP_EXT = {".base"}
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


class PublicationError(Exception):
    """A source cannot be safely published."""


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
        self._changed_files: set[str] | None = None

    def modified_time(self, rel: str) -> float | None:
        """Return the source note's latest commit time, or local mtime if dirty."""
        disk = self.root / rel
        source_mtime = disk.stat().st_mtime if disk.is_file() else None
        if not self.git_dir.exists():
            return source_mtime

        if not self.use_git and rel in self._working_tree_changes():
            return source_mtime

        try:
            timestamp = self._git(
                ["log", "-1", "--format=%ct", "HEAD", "--", rel]
            ).strip()
            if timestamp:
                return float(timestamp)
        except subprocess.CalledProcessError:
            pass
        return source_mtime

    def _working_tree_changes(self) -> set[str]:
        if self._changed_files is None:
            proc = subprocess.run(
                [
                    "git",
                    "-C",
                    str(self.root),
                    "status",
                    "--porcelain=v1",
                    "-z",
                    "--untracked-files=all",
                    "--no-renames",
                ],
                capture_output=True,
                check=False,
            )
            self._changed_files = set()
            if proc.returncode == 0:
                for entry in proc.stdout.split(b"\0"):
                    if entry:
                        rel = entry[3:].decode("utf-8", errors="surrogateescape")
                        self._changed_files.add(rel.replace(os.sep, "/"))
        return self._changed_files

    def die(self, msg: str) -> "None":
        print(f"error: {msg}", file=sys.stderr)
        raise SystemExit(1)

    def all_files(self) -> list[str]:
        files: list[str] = []
        if self.use_git:
            out = self._git(["ls-tree", "-r", "-z", "HEAD"])
            self._git_files = set()
            for entry in out.split("\0"):
                if not entry:
                    continue
                metadata, rel = entry.split("\t", 1)
                if not self._safe(rel):
                    continue
                mode, kind, _ = metadata.split()
                if mode not in {"100644", "100755"} or kind != "blob":
                    raise PublicationError("unsupported Git tree entry")
                files.append(rel)
                self._git_files.add(rel)
            return files
        for dirpath, dirnames, filenames in os.walk(self.root):
            dirnames[:] = [d for d in dirnames if not d.startswith(".")]
            for name in [*dirnames, *filenames]:
                rel = (Path(dirpath) / name).relative_to(self.root).as_posix()
                if not self._safe(rel):
                    continue
                path = self.root / rel
                if path.is_symlink():
                    raise PublicationError("symlink source entry rejected")
                if name in filenames:
                    if not stat.S_ISREG(path.lstat().st_mode):
                        raise PublicationError("nonregular source entry rejected")
                    files.append(rel)
        return files

    def read(self, rel: str) -> bytes | None:
        if not self._safe(rel):
            return None
        if not self.use_git:
            disk = self.root / rel
            try:
                if any(p.is_symlink() for p in [disk, *disk.parents] if p != self.root):
                    return None
                if not disk.resolve().is_relative_to(self.root):
                    return None
                if not stat.S_ISREG(disk.lstat().st_mode):
                    return None
                return disk.read_bytes()
            except OSError:
                return None
        if not hasattr(self, "_git_files"):
            self.all_files()
        if rel not in self._git_files:
            return None
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
        return not any(
            part in ("..", "") or part.startswith(".")
            for part in rel.replace("\\", "/").split("/")
        )


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


def canvas_refs_of(text: str) -> list[str]:
    """Extract a conservative Markdown subset for canvas publication checks.

    Unlike the advisory note report, canvas validation must fail closed on
    ambiguous explicit destinations. This is not a full CommonMark parser.
    Definitions are checked even when no reference uses their label.
    """
    text = CODE_FENCE_RE.sub(" ", text)
    text = INLINE_CODE_RE.sub(" ", text)
    text = OBSIDIAN_COMMENT_RE.sub(" ", text)
    destinations: list[str] = []

    def destination(pos: int) -> tuple[str, int]:
        while pos < len(text) and text[pos].isspace():
            pos += 1
        angled = pos < len(text) and text[pos] == "<"
        if angled:
            pos += 1
        chars: list[str] = []
        depth = 0
        while pos < len(text):
            char = text[pos]
            if char == "\\" and pos + 1 < len(text):
                escaped = text[pos + 1]
                if escaped in r"!\"#$%&'()*+,-./:;<=>?@[\]^_`{|}~":
                    chars.append(escaped)
                    pos += 2
                    continue
                raise PublicationError("unsupported canvas Markdown escape")
            if angled:
                if char == ">":
                    return "".join(chars), pos + 1
                if char in "<\r\n":
                    raise PublicationError("ambiguous canvas Markdown destination")
            else:
                if char.isspace() or (char == ")" and depth == 0):
                    break
                if char in "<>":
                    raise PublicationError("ambiguous canvas Markdown destination")
                if char == "(":
                    depth += 1
                elif char == ")":
                    depth -= 1
            chars.append(char)
            pos += 1
        if angled or depth:
            raise PublicationError("unclosed canvas Markdown destination")
        return "".join(chars), pos

    def tail(pos: int, inline: bool) -> None:
        # Optional titles are supported, but other trailing syntax is rejected.
        start = pos
        while pos < len(text) and text[pos] in " \t":
            pos += 1
        if pos > start and pos < len(text) and text[pos] in "\"'(":
            closing = ")" if text[pos] == "(" else text[pos]
            pos += 1
            while pos < len(text) and text[pos] != closing:
                if text[pos] == "\\":
                    pos += 1
                if pos >= len(text) or text[pos] in "\r\n":
                    raise PublicationError("unsupported canvas Markdown title")
                pos += 1
            if pos >= len(text):
                raise PublicationError("unclosed canvas Markdown title")
            pos += 1
            while pos < len(text) and text[pos] in " \t":
                pos += 1
        if inline:
            if pos >= len(text) or text[pos] != ")":
                raise PublicationError("ambiguous canvas Markdown link")
        elif pos < len(text) and text[pos] not in "\r\n":
            raise PublicationError("ambiguous canvas Markdown definition")

    for match in re.finditer(r"\]\s*\(", text):
        ref, end = destination(match.end())
        tail(end, inline=True)
        destinations.append(ref)
    # Scan every definition-shaped closing bracket deliberately. Containers,
    # multiline labels and escaped label brackets must not hide a destination.
    # This can reject prose containing ]:, which is a safe false positive.
    for match in re.finditer(r"\]:[ \t]*", text):
        ref, end = destination(match.end())
        tail(end, inline=False)
        destinations.append(ref)

    class CanvasHTMLReferences(HTMLParser):
        def handle_starttag(self, tag, attrs):
            for name, value in attrs:
                if name in {"srcset", "srcdoc"}:
                    raise PublicationError("unsupported canvas HTML source attribute")
                if name in {"href", "src", "poster", "data", "xlink:href"}:
                    if value is None:
                        raise PublicationError("malformed canvas HTML destination")
                    destinations.append(value)

    # HTMLParser handles case folding, entities, and unquoted attributes.
    parser = CanvasHTMLReferences()
    parser.feed(text)
    parser.close()

    refs = [split_ref(urllib.parse.unquote(m)) for m in WIKILINK_RE.findall(text)]
    for ref in destinations:
        # Markdown destinations do not use wikilink aliases. Decode entities
        # before stripping fragment anchors, matching rendered destinations.
        ref = urllib.parse.unquote(html.unescape(ref)).split("#", 1)[0].strip()
        refs.append(ref)
    return [r for r in refs if r and not r.lower().startswith(EXTERNAL_PREFIX)]


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
        for key in {rel.lower(), Path(rel).name.lower()}:
            index[key].append(rel)
    return index


def copy_into_content(vault: Vault, rel: str) -> bool:
    data = vault.read(rel)
    if data is None:
        return False
    dest = CONTENT / rel
    dest.parent.mkdir(parents=True, exist_ok=True)
    dest.write_bytes(data)
    if ext_of(rel) == NOTE_EXT:
        modified_time = vault.modified_time(rel)
        if modified_time is not None:
            os.utime(dest, (modified_time, modified_time))
    return True


def canvas_dependencies(vault, seeds, index, includes, excludes):
    """Validate the complete canvas graph before any canvas is written."""
    dependencies: set[str] = set()
    visited: set[str] = set()

    def target_of(ref, source):
        ref = urllib.parse.unquote(ref)
        # Explicit vault paths must not fall back to a different basename.
        if "/" in ref or "\\" in ref:
            target = next(
                (
                    candidate
                    for candidate in (ref, ref + NOTE_EXT)
                    if candidate in index.get(candidate.lower(), [])
                ),
                None,
            )
        else:
            target = resolve(ref, index, source)
        if (
            not Vault._safe(ref)
            or target is None
            or any(under(target, e) for e in excludes)
            or ext_of(target) not in ASSET_ALLOW | {NOTE_EXT}
            or (
                ext_of(target) == NOTE_EXT
                and not in_publish_set(target, includes, excludes)
            )
        ):
            raise PublicationError(
                "canvas contains a disallowed or unresolved reference"
            )
        dependencies.add(target)
        if ext_of(target) == ".canvas":
            visit(target)

    def visit(rel):
        if rel in visited:
            return
        visited.add(rel)
        try:
            data = vault.read(rel)
            obj = json.loads(data.decode("utf-8")) if data is not None else None
        except (ValueError, UnicodeError):
            raise PublicationError("malformed canvas") from None
        if (
            not isinstance(obj, dict)
            or not isinstance(obj.get("nodes", []), list)
            or not isinstance(obj.get("edges", []), list)
            or any(not isinstance(edge, dict) for edge in obj.get("edges", []))
        ):
            raise PublicationError("malformed canvas structure")
        for node in obj.get("nodes", []):
            if not isinstance(node, dict) or node.get("type") not in (
                "file",
                "text",
                "link",
                "group",
            ):
                raise PublicationError("malformed canvas node")
            if node["type"] == "file":
                ref = node.get("file")
                if not isinstance(ref, str) or not ref:
                    raise PublicationError("malformed canvas file node")
                target_of(ref, rel)
            elif node["type"] == "text":
                if not isinstance(node.get("text"), str):
                    raise PublicationError("malformed canvas text node")
                for ref in canvas_refs_of(node["text"]):
                    target_of(ref, rel)
            elif node["type"] == "group" and "background" in node:
                ref = node["background"]
                if not isinstance(ref, str) or not ref:
                    raise PublicationError("malformed canvas background")
                target_of(ref, rel)
            elif node["type"] == "link":
                url = node.get("url")
                if not isinstance(url, str):
                    raise PublicationError("malformed canvas link")
                try:
                    parsed = urllib.parse.urlsplit(url)
                    if parsed.scheme not in {"http", "https"} or not parsed.hostname:
                        raise ValueError("unsupported URL")
                except ValueError:
                    raise PublicationError("canvas contains an unsafe link") from None

    for rel in seeds:
        visit(rel)
    return dependencies


def main() -> int:
    try:
        return sync_main()
    except (PublicationError, OSError, subprocess.CalledProcessError) as exc:
        print(f"error: publication failed ({type(exc).__name__})", file=sys.stderr)
        # Detailed diagnostics are local opt-in only.
        if "--verbose" in sys.argv:
            print(str(exc), file=sys.stderr)
        return 1


def sync_main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument(
        "--vault",
        default=os.environ.get("VAULT_PATH"),
        help="path to the Obsidian vault",
    )
    ap.add_argument("--quiet", action="store_true")
    ap.add_argument(
        "--verbose", action="store_true", help="include source paths in local reports"
    )
    args = ap.parse_args()

    if not args.vault:
        print("error: set VAULT_PATH or pass --vault", file=sys.stderr)
        return 1
    try:
        vault_path = Path(args.vault).expanduser()
    except (OSError, RuntimeError):
        print("error: invalid vault location", file=sys.stderr)
        return 1
    if not vault_path.is_dir():
        print("error: vault not found", file=sys.stderr)
        print("       set VAULT_PATH or pass --vault", file=sys.stderr)
        return 1

    includes, excludes = read_publish_list()
    vault = Vault(vault_path)
    report = Report()

    if CONTENT.exists():
        try:
            shutil.rmtree(CONTENT)
        except OSError:
            raise PublicationError("could not reset generated content") from None
    CONTENT.mkdir(parents=True)
    (CONTENT / ".gitkeep").touch()  # keeps the (empty) directory tracked by git

    all_files = vault.all_files()
    if not all_files:
        print("error: vault has no files (empty clone?)", file=sys.stderr)
        return 1
    index = build_index(all_files)

    canvas_seeds = {
        rel
        for rel in all_files
        if ext_of(rel) == ".canvas" and in_publish_set(rel, includes, excludes)
    }
    for rel in all_files:
        if ext_of(rel) == NOTE_EXT and in_publish_set(rel, includes, excludes):
            data = vault.read(rel)
            if data is None:
                raise PublicationError("source note could not be read")
            for ref in refs_of(data.decode("utf-8", errors="ignore")):
                target = resolve(ref, index, rel)
                if (
                    target
                    and ext_of(target) == ".canvas"
                    and not any(under(target, e) for e in excludes)
                ):
                    canvas_seeds.add(target)
    dependencies = canvas_dependencies(vault, canvas_seeds, index, includes, excludes)
    for rel in sorted(dependencies):
        if ext_of(rel) in ASSET_ALLOW and not in_publish_set(rel, includes, excludes):
            if not copy_into_content(vault, rel):
                raise PublicationError("canvas dependency could not be read")
            report.assets += 1
            report.asset_bytes += (CONTENT / rel).stat().st_size

    # 1. copy the allowlisted folders (notes + locally stored allowed assets)
    note_files: list[str] = []
    for entry in includes:
        matches = [f for f in all_files if under(f, entry)]
        if not matches:
            print("error: publish entry not found in vault", file=sys.stderr)
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

    # Quartz's Assets emitter copies non-Markdown content files to the site root.
    if not LLMS_TXT.is_file():
        print(f"error: {LLMS_TXT} missing, no llms.txt to publish", file=sys.stderr)
        return 1
    shutil.copyfile(LLMS_TXT, CONTENT / "llms.txt")

    if not args.quiet:
        print_report(report, includes, excludes, vault, detailed=args.verbose)
    return 0


def print_report(
    r: Report,
    includes: list[str],
    excludes: list[str],
    vault: Vault,
    detailed: bool = False,
) -> None:
    print()
    print("sync report")
    print(
        f"  mode:              {'git (sparse clone)' if vault.use_git else 'worktree'}"
    )
    print(f"  publish entries:   {len(includes)}")
    for e in includes if detailed else []:
        print(f"    - {e}")
    if excludes:
        print(f"  excluded entries:  {len(excludes)}")
        for e in excludes if detailed else []:
            print(f"    ! {e}")
    print(f"  notes copied:      {r.notes}")
    print(f"  assets copied:     {r.assets} ({r.asset_bytes / 1024 / 1024:.1f} MB)")
    print(f"  BLOCKED documents: {len(r.blocked)}  <- never published")
    for ref, by in sorted(r.blocked.items()) if detailed else []:
        who = ", ".join(sorted(by)[:3])
        print(f"    ! {ref}  (referenced by: {who})")
    print(f"  skipped bases:     {len(r.skipped)}")
    for ref, by in sorted(r.skipped.items()) if detailed else []:
        print(f"    - {ref}  (referenced by: {', '.join(sorted(by)[:3])})")
    print(f"  links outside publish set: {len(r.outside)}")
    for ref, by in sorted(r.outside.items())[:15] if detailed else []:
        print(f"    - {ref}  (from {', '.join(sorted(by)[:2])})")
    if len(r.outside) > 15:
        print(f"    ... and {len(r.outside) - 15} more")
    print(f"  unresolved refs:   {len(r.unresolved)}")
    for ref, by in sorted(r.unresolved.items())[:15] if detailed else []:
        print(f"    ? {ref}  (from {', '.join(sorted(by)[:2])})")
    if len(r.unresolved) > 15:
        print(f"    ... and {len(r.unresolved) - 15} more")
    print()


if __name__ == "__main__":
    sys.exit(main())
