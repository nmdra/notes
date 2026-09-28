"""Regression tests for published-note modification dates."""

import importlib.util
import os
import subprocess
import sys
import tempfile
import unittest
from datetime import datetime
from pathlib import Path
from unittest.mock import patch

SYNC_SPEC = importlib.util.spec_from_file_location(
    "sync_content", Path(__file__).with_name("sync-content.py")
)
if SYNC_SPEC is None or SYNC_SPEC.loader is None:
    raise RuntimeError("Could not load sync-content.py")
SYNC = importlib.util.module_from_spec(SYNC_SPEC)
SYNC_SPEC.loader.exec_module(SYNC)


class SyncContentDatesTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)
        self.vault = self.root / "vault"
        self.note = self.vault / "Notes" / "The Bitter Lesson.md"
        self.note.parent.mkdir(parents=True)
        self.note.write_text("A note.\n", encoding="utf-8")
        self._git("init", "--quiet")
        self._git("config", "user.name", "Test User")
        self._git("config", "user.email", "test@example.com")
        self._commit("initial note", "2024-01-01T00:00:00+00:00")

        self.content = self.root / "content"
        self.publish_list = self.root / "publish.list"
        self.publish_list.write_text("Notes\n", encoding="utf-8")
        self.homepage = self.root / "index.md"
        self.homepage.write_text("Home\n", encoding="utf-8")
        self.llms_txt = self.root / "llms.txt"
        self.llms_txt.write_text("# Test site\n", encoding="utf-8")
        setattr(SYNC, "LLMS_TXT", self.llms_txt)
        setattr(SYNC, "CONTENT", self.content)
        setattr(SYNC, "PUBLISH_LIST", self.publish_list)
        setattr(SYNC, "HOME_PAGE", self.homepage)

    def _git(self, *args, env=None):
        subprocess.run(
            ["git", "-C", str(self.vault), *args],
            check=True,
            capture_output=True,
            env=env,
        )

    def _commit(self, message, timestamp):
        self._git("add", "Notes/The Bitter Lesson.md")
        env = os.environ.copy()
        env["GIT_AUTHOR_DATE"] = timestamp
        env["GIT_COMMITTER_DATE"] = timestamp
        self._git("commit", "--quiet", "-m", message, env=env)

    def _sync(self):
        args = ["sync-content.py", "--vault", str(self.vault), "--quiet"]
        with patch.object(sys, "argv", args):
            self.assertEqual(getattr(SYNC, "main")(), 0)
        return self.content / "Notes" / "The Bitter Lesson.md"

    def test_sync_copies_llms_txt_to_content_root(self):
        self._sync()

        self.assertEqual(
            (self.content / "llms.txt").read_text(encoding="utf-8"),
            self.llms_txt.read_text(encoding="utf-8"),
        )

    def test_sync_fails_when_llms_txt_is_missing(self):
        self.llms_txt.unlink()
        args = ["sync-content.py", "--vault", str(self.vault), "--quiet"]
        with patch.object(sys, "argv", args):
            self.assertEqual(getattr(SYNC, "main")(), 1)

    def test_clean_note_uses_latest_vault_commit_time(self):
        timestamp = "2025-02-03T04:05:06+00:00"
        self.note.write_text("Updated note.\n", encoding="utf-8")
        self._commit("update note", timestamp)

        generated = self._sync()

        expected = datetime.fromisoformat(timestamp).timestamp()
        self.assertEqual(generated.stat().st_mtime, expected)

    def test_dirty_local_note_keeps_its_working_tree_time(self):
        self.note.write_text("Uncommitted edit.\n", encoding="utf-8")
        timestamp = 1_750_000_000
        os.utime(self.note, (timestamp, timestamp))

        generated = self._sync()

        self.assertEqual(generated.stat().st_mtime, timestamp)


if __name__ == "__main__":
    unittest.main()
