#!/usr/bin/env python3
"""Fail when generated content or site output contains a blocked document."""

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
        if path.is_file() and path.suffix.lower() in BLOCKED_SUFFIXES
    )


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("directory", type=Path, help="generated directory to check")
    args = parser.parse_args()

    if not args.directory.is_dir():
        parser.error(f"directory not found: {args.directory}")

    blocked = blocked_files(args.directory)
    if blocked:
        print(f"::error::Blocked files found in {args.directory}")
        for path in blocked:
            print(path)
        return 1

    print(f"{args.directory} clean")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
