#!/usr/bin/env python3
"""Reject blocked documents and symlinks, with counts-only output by default."""

from __future__ import annotations

import argparse
import runpy
from pathlib import Path

POLICY = runpy.run_path(str(Path(__file__).with_name("sync-content.py")))
BLOCKED_SUFFIXES = POLICY["BLOCKED_EXT"] | POLICY["SKIP_EXT"]


def blocked_files(directory: Path) -> list[Path]:
    return sorted(
        path
        for path in directory.rglob("*")
        if path.is_symlink()
        or (path.is_file() and path.suffix.lower() in BLOCKED_SUFFIXES)
    )


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("directory", type=Path, help="generated directory to check")
    parser.add_argument("--verbose", action="store_true", help="include blocked paths")
    args = parser.parse_args()

    if not args.directory.is_dir():
        parser.error("directory not found")

    blocked = (
        [args.directory]
        if args.directory.is_symlink()
        else blocked_files(args.directory)
    )
    if blocked:
        print(f"::error::Blocked files or symlinks found: {len(blocked)}")
        for path in blocked if args.verbose else []:
            print(path)
        return 1

    print("Generated directory clean")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
