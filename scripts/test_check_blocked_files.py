"""Regression checks for the CI document gate."""

import runpy
import tempfile
import unittest
from pathlib import Path

CHECKER = runpy.run_path(str(Path(__file__).with_name("check-blocked-files.py")))
blocked_files = CHECKER["blocked_files"]


class BlockedFilesTest(unittest.TestCase):
    def test_nested_documents_and_canvases_are_blocked_case_insensitively(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            (root / "notes").mkdir()
            for name in ("book.MOBI", "sheet.ODS", "diagram.canvas", "archive.ZIP"):
                (root / "notes" / name).touch()
            (root / "notes" / "safe.md").touch()
            (root / "photo.png").touch()

            found = {p.name for p in blocked_files(root)}
            self.assertEqual(found, {"book.MOBI", "sheet.ODS", "diagram.canvas", "archive.ZIP"})

    def test_clean_directory_has_no_blocked_files(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            (root / "index.html").touch()
            (root / "note.md").touch()
            self.assertEqual(blocked_files(root), [])


if __name__ == "__main__":
    unittest.main()
