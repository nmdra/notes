"""Regression checks for the CI document gate."""

import runpy
import tempfile
import unittest
from pathlib import Path

CHECKER = runpy.run_path(str(Path(__file__).with_name("check-blocked-files.py")))
blocked_files = CHECKER["blocked_files"]


class BlockedFilesTest(unittest.TestCase):
    def test_canvases_are_allowed_but_documents_and_bases_are_blocked(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            (root / "notes").mkdir()
            for name in (
                "book.MOBI",
                "sheet.ODS",
                "diagram.canvas",
                "diagram.BASE",
                "archive.ZIP",
            ):
                (root / "notes" / name).touch()
            (root / "notes" / "safe.md").touch()
            (root / "photo.png").touch()

            found = {p.name for p in blocked_files(root)}
            self.assertEqual(
                found, {"book.MOBI", "sheet.ODS", "diagram.BASE", "archive.ZIP"}
            )

    def test_clean_directory_has_no_blocked_files(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            (root / "index.html").touch()
            (root / "note.md").touch()
            self.assertEqual(blocked_files(root), [])


class SymlinkGateTest(unittest.TestCase):
    def test_all_symlink_types_are_blocked(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            (root / "safe.md").touch()
            (root / "directory").mkdir()
            for name, target in [
                ("file-link.md", root / "safe.md"),
                ("dir-link", root / "directory"),
                ("broken-link", root / "missing"),
            ]:
                (root / name).symlink_to(target)
            self.assertEqual(
                {p.name for p in blocked_files(root)},
                {"file-link.md", "dir-link", "broken-link"},
            )

    def test_default_failure_is_counts_only_and_verbose_is_opt_in(self):
        import contextlib
        import io
        import sys
        from unittest.mock import patch

        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            (root / "private-secret.pdf").touch()
            for flags, detailed in (([], False), (["--verbose"], True)):
                output = io.StringIO()
                with (
                    patch.object(
                        sys, "argv", ["check-blocked-files.py", str(root), *flags]
                    ),
                    contextlib.redirect_stdout(output),
                ):
                    self.assertEqual(CHECKER["main"](), 1)
                self.assertEqual("private-secret" in output.getvalue(), detailed)
                self.assertIn("found: 1", output.getvalue())


if __name__ == "__main__":
    unittest.main()
