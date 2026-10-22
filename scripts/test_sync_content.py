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

    def test_sync_copies_canvas_files_from_published_folders(self):
        canvas = self.vault / "Notes" / "Architecture.canvas"
        canvas.write_text('{"nodes": [], "edges": []}\n', encoding="utf-8")

        self._sync()

        self.assertEqual(
            (self.content / "Notes" / "Architecture.canvas").read_text(
                encoding="utf-8"
            ),
            '{"nodes": [], "edges": []}\n',
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


class PublicationBoundaryTest(SyncContentDatesTest):
    def run_sync(self, *flags):
        import contextlib
        import io

        output = io.StringIO()
        with (
            patch.object(
                sys, "argv", ["sync-content.py", "--vault", str(self.vault), *flags]
            ),
            contextlib.redirect_stdout(output),
            contextlib.redirect_stderr(output),
        ):
            status = SYNC.main()
        return status, output.getvalue()

    def write(self, rel, text):
        path = self.vault / rel
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(text, encoding="utf-8")
        return path

    def test_safe_reporting(self):
        self.note.write_text("[[Private/secret]] [[missing-secret]] [[secret.pdf]]")
        self.write("Private/secret.md", "private")
        self.write("Private/secret.pdf", "private")
        status, output = self.run_sync()
        self.assertEqual(status, 0)
        self.assertNotIn("secret", output)
        self.assertNotIn("The Bitter Lesson", output)
        self.assertIn("BLOCKED documents: 1", output)
        self.assertIn("secret", self.run_sync("--verbose")[1])
        self.assertEqual(self.run_sync("--quiet")[1], "")

    def test_symlinks_fail_safely(self):
        outside = self.root / "outside-secret.md"
        outside.write_text("private")
        for target in (outside, self.root, self.root / "missing-secret"):
            link = self.vault / "Notes/secret-link.md"
            link.symlink_to(target)
            status, output = self.run_sync()
            self.assertEqual(status, 1)
            self.assertNotIn("secret", output)
            link.unlink()

    def test_direct_reads_reject_unsafe_paths(self):
        outside = self.root / "outside.md"
        outside.write_text("private")
        (self.vault / "Notes/link.md").symlink_to(outside)
        self.write("Notes/.hidden.md", "hidden")
        vault = SYNC.Vault(self.vault)
        for rel in ("../outside.md", "Notes/link.md", "Notes/.hidden.md"):
            self.assertIsNone(vault.read(rel))

    def test_hidden_paths_excluded_in_both_modes(self):
        self.write("Notes/.hidden.md", "hidden")
        self.write("Notes/.hidden/also.md", "hidden")
        self.assertEqual(self.run_sync()[0], 0)
        self.assertFalse((self.content / "Notes/.hidden.md").exists())
        self._git("add", ".")
        self._git("commit", "--quiet", "-m", "hidden fixtures")
        import shutil

        shutil.rmtree(self.vault / "Notes")
        self.assertEqual(self.run_sync()[0], 0)
        self.assertFalse((self.content / "Notes/.hidden.md").exists())
        self.assertFalse((self.content / "Notes/.hidden").exists())

    def test_git_symlink_mode_rejected(self):
        (self.vault / "Notes/link.md").symlink_to("secret-target")
        self._git("add", ".")
        self._git("commit", "--quiet", "-m", "link fixture")
        import shutil

        shutil.rmtree(self.vault / "Notes")
        status, output = self.run_sync()
        self.assertEqual(status, 1)
        self.assertNotIn("secret", output)

    def test_shared_media_and_exclusions(self):
        self.note.write_text("![[Shared/yes.png]] ![[Shared/no.png]]")
        self.write("Shared/yes.png", "image")
        self.write("Shared/no.png", "image")
        self.publish_list.write_text("Notes\n!Shared/no.png\n")
        self.assertEqual(self.run_sync()[0], 0)
        self.assertTrue((self.content / "Shared/yes.png").exists())
        self.assertFalse((self.content / "Shared/no.png").exists())

    def test_canvas_fails_closed(self):
        import json

        self.write("Private/secret.md", "private")
        cases = [
            "{",
            "[]",
            '{"nodes": {}}',
            json.dumps(
                {"nodes": [{"type": "file", "file": "Private/secret.md"}], "edges": []}
            ),
            json.dumps(
                {"nodes": [{"type": "text", "text": "[[Private/secret]]"}], "edges": []}
            ),
        ]
        for data in cases:
            self.write("Notes/test.canvas", data)
            status, output = self.run_sync()
            self.assertEqual(status, 1, data)
            self.assertNotIn("secret", output)
            self.assertFalse((self.content / "Notes/test.canvas").exists())

    def test_nested_canvases_and_approved_targets(self):
        import json

        def canvas(nodes):
            return json.dumps({"nodes": nodes, "edges": []})

        self.write(
            "Notes/test.canvas",
            canvas([{"type": "file", "file": "Shared/nested.canvas"}]),
        )
        self.write(
            "Shared/nested.canvas",
            canvas(
                [
                    {"type": "file", "file": "Shared/image.png"},
                    {"type": "file", "file": "Notes/The Bitter Lesson.md"},
                    {"type": "text", "text": "Arbitrary prose is not classified."},
                ]
            ),
        )
        self.write("Shared/image.png", "image")
        self.assertEqual(self.run_sync()[0], 0)
        self.assertTrue((self.content / "Shared/nested.canvas").exists())
        self.assertTrue((self.content / "Shared/image.png").exists())
        self.publish_list.write_text("Notes\n!Shared/image.png\n")
        self.assertEqual(self.run_sync()[0], 1)

    def test_canvas_unsafe_and_missing_explicit_paths(self):
        import json

        for ref in (
            "../Notes/The Bitter Lesson.md",
            "%2e%2e/Notes/The Bitter Lesson.md",
            "/Notes/The Bitter Lesson.md",
            "Private/The Bitter Lesson.md",
            "Notes/.hidden.md",
            "missing.canvas",
        ):
            self.write(
                "Notes/test.canvas",
                json.dumps({"nodes": [{"type": "file", "file": ref}], "edges": []}),
            )
            status, output = self.run_sync()
            self.assertEqual(status, 1, ref)
            self.assertNotIn(ref, output)

    def test_symlink_to_excluded_note_rejected(self):
        target = self.write("Private/secret.md", "private")
        self.publish_list.write_text("Notes\n!Private\n")
        (self.vault / "Notes/link.md").symlink_to(target)
        self.assertEqual(self.run_sync()[0], 1)

    def test_git_submodule_mode_rejected(self):
        commit = subprocess.check_output(
            ["git", "-C", str(self.vault), "rev-parse", "HEAD"], text=True
        ).strip()
        self._git(
            "update-index", "--add", "--cacheinfo", f"160000,{commit},Notes/submodule"
        )
        self._git("commit", "--quiet", "-m", "submodule fixture")
        import shutil

        shutil.rmtree(self.vault / "Notes")
        self.assertEqual(self.run_sync()[0], 1)

    def test_canvas_background_references_follow_publication_policy(self):
        import json

        self.write("Shared/background.png", "image")
        canvas = self.write(
            "Notes/test.canvas",
            json.dumps(
                {"nodes": [{"type": "group", "background": "Shared/background.png"}]}
            ),
        )
        self.assertEqual(self.run_sync()[0], 0)
        self.assertTrue((self.content / "Shared/background.png").exists())
        self.publish_list.write_text("Notes\n!Shared/background.png\n")
        status, output = self.run_sync()
        self.assertEqual(status, 1)
        self.assertNotIn("background.png", output)
        self.assertFalse((self.content / "Notes/test.canvas").exists())
        canvas.write_text(json.dumps({"nodes": [{"type": "group", "background": 7}]}))
        self.assertEqual(self.run_sync()[0], 1)

    def test_canvas_link_nodes_reject_local_or_unsafe_urls(self):
        import json

        for url in (
            "file:///private/secret",
            "obsidian://open?vault=secret",
            "javascript:alert(1)",
            "Private/secret.md",
            7,
        ):
            self.write(
                "Notes/test.canvas",
                json.dumps({"nodes": [{"type": "link", "url": url}], "edges": []}),
            )
            status, output = self.run_sync()
            self.assertEqual(status, 1)
            self.assertNotIn("secret", output)
        self.write(
            "Notes/test.canvas",
            json.dumps(
                {"nodes": [{"type": "link", "url": "https://example.com"}], "edges": []}
            ),
        )
        self.assertEqual(self.run_sync()[0], 0)

    def test_canvas_invalid_node_type_fails_without_traceback(self):
        self.write("Notes/test.canvas", '{"nodes": [{"type": []}], "edges": []}')
        status, output = self.run_sync()
        self.assertEqual(status, 1)
        self.assertNotIn("Traceback", output)

    def test_empty_canvas_uses_optional_arrays(self):
        self.write("Notes/test.canvas", "{}")
        self.assertEqual(self.run_sync()[0], 0)

    def test_canvas_markdown_private_destinations_fail_safely(self):
        import json

        self.write("Private/secret note.md", "private")
        self.write("Private/secret.md", "private")
        for text in (
            "[private](<Private/secret note.md>)",
            "[private][p]\n\n[p]: Private/secret.md",
            "[private][p]\n\n[p]: <Private/secret note.md>",
            "[private][p]\n\n[p]: <Private/secret&#32;note.md>",
            "[private][p q]\n\n[p\nq]: Private/secret.md",
            r"[private][p\]q]" + "\n\n" + r"[p\]q]: Private/secret.md",
            "[private](<Private/secret&#32;note.md>)",
            "[private](Private/secret&#46;md)",
            '[unused]: <Private/secret note.md> "title"',
            "[private](<Private/secret note.md)",
        ):
            with self.subTest(text=text):
                self.write(
                    "Notes/test.canvas",
                    json.dumps({"nodes": [{"type": "text", "text": text}]}),
                )
                status, output = self.run_sync()
                self.assertEqual(status, 1)
                self.assertNotIn("secret", output)
                self.assertFalse((self.content / "Notes/test.canvas").exists())

    def test_canvas_markdown_approved_destinations(self):
        import json

        self.write("Notes/approved note.md", "public")
        self.write("Notes/approved(nested).md", "public")
        for text in (
            '[public](<Notes/approved note.md> "title")',
            '[public][p]\n\n[p]: <Notes/approved note.md> "title"',
            "[public][p]\n\n[p]: Notes/approved%20note.md",
            "[public](<Notes/approved&#32;note.md>)",
            "[public](Notes/approved(nested).md)",
            "[public](Notes/approved\\(nested\\).md)",
            "[external](https://example.com/a?x=1&amp;y=2)",
            "[public][p]\n\n[p]:\n<Notes/approved&#32;note.md>",
        ):
            with self.subTest(text=text):
                self.write(
                    "Notes/test.canvas",
                    json.dumps({"nodes": [{"type": "text", "text": text}]}),
                )
                self.assertEqual(self.run_sync()[0], 0)
                self.assertTrue((self.content / "Notes/test.canvas").exists())

    def test_canvas_html_destinations_follow_publication_policy(self):
        import json

        self.write("Private/secret.md", "private")
        self.write("Notes/approved.md", "public")
        for text in (
            "<a href=Private/secret.md>private</a>",
            '<a HREF="Private&#47;secret.md">private</a>',
            "<img src=Private/secret.md>",
            '<img srcset="Private/secret.md 1x">',
            '<iframe srcdoc="private embedded document"></iframe>',
        ):
            with self.subTest(text=text):
                self.write(
                    "Notes/test.canvas",
                    json.dumps({"nodes": [{"type": "text", "text": text}]}),
                )
                status, output = self.run_sync()
                self.assertEqual(status, 1)
                self.assertNotIn("secret", output)
                self.assertFalse((self.content / "Notes/test.canvas").exists())
        for text in (
            "<a href=Notes/approved.md>public</a>",
            '<a href="https://example.com">external</a>',
        ):
            with self.subTest(text=text):
                self.write(
                    "Notes/test.canvas",
                    json.dumps({"nodes": [{"type": "text", "text": text}]}),
                )
                self.assertEqual(self.run_sync()[0], 0)

    def test_missing_vault_option_fails_safely(self):
        import contextlib
        import io

        output = io.StringIO()
        with (
            patch.dict(os.environ, {}, clear=True),
            patch.object(sys, "argv", ["sync-content.py"]),
            contextlib.redirect_stderr(output),
        ):
            self.assertEqual(SYNC.main(), 1)
        self.assertIn("set VAULT_PATH or pass --vault", output.getvalue())


if __name__ == "__main__":
    unittest.main()
