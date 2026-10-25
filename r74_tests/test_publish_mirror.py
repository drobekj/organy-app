"""R74 behavioral tests: real temporary Git branches and bare remotes, no production calls."""
from __future__ import annotations

import hashlib
import importlib.util
import io
import json
import os
import subprocess
import sys
import tempfile
import unittest
import urllib.error
from contextlib import redirect_stdout, redirect_stderr
from pathlib import Path
from unittest.mock import patch

PUB_PATH = Path(__file__).resolve().parents[1] / "publish_fingering_pdfs.py"
spec = importlib.util.spec_from_file_location("organy_mirror_r74", PUB_PATH)
pub = importlib.util.module_from_spec(spec)
sys.modules[spec.name] = pub
spec.loader.exec_module(pub)


def git(*args):
    r = subprocess.run(["git", *map(str, args)], check=True, capture_output=True, text=True)
    return r.stdout.strip()


class MirrorTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        root = Path(self.temp.name)
        self.remote = root / "remote.git"
        self.repo = root / "organy-app"
        self.conf = root / "config"
        self.source = self.repo / "public" / "fingering"
        self.conf.mkdir()
        self.pdf_urls = []
        git("init", "--bare", self.remote)
        git("init", "-b", "main", self.repo)
        git("-C", self.repo, "config", "user.name", "test")
        git("-C", self.repo, "config", "user.email", "test@example.invalid")
        git("-C", self.repo, "remote", "add", "origin", self.remote)
        self.source.mkdir(parents=True)
        (self.repo / "README.md").write_text("application baseline")
        self.put("EK123-001", b"base")
        self.put("EK456-001", b"old")
        git("-C", self.repo, "add", ".")
        git("-C", self.repo, "commit", "-m", "baseline")
        git("-C", self.repo, "push", "-u", "origin", "main")
        self.baseline = git("-C", self.repo, "rev-parse", "HEAD")
        self.patches = [
            patch.object(pub, "hook_path", return_value=self.conf / "vercel_deploy_hook.url"),
            patch.object(pub, "state_path", return_value=self.conf / "fingering_deployment_state.json"),
        ]
        for p in self.patches:
            p.start()
            self.addCleanup(p.stop)
        self.remote_allowed = str(self.remote).removesuffix(".git")
        pub.ALLOWED_REMOTES.add(self.remote_allowed)
        self.addCleanup(pub.ALLOWED_REMOTES.discard, self.remote_allowed)
        (self.conf / "vercel_deploy_hook.url").write_text(
            f"https://api.vercel.com/v1/integrations/deploy/{pub.VERCEL_PROJECT_ID}/FAKEHOOK", encoding="utf-8")
        pub.write_state({"last_confirmed_sha": self.baseline})
        # Even a name resembling the Prstoklady project is outside the repo and untouched.
        self.original = root / "score-fingering-lab" / "data" / "samples" / "EK123-001" / "original"
        self.original.mkdir(parents=True)
        self.original_pdf = self.original / "EK123-001_fingering.pdf"
        self.original_pdf.write_bytes(b"ORIGINAL UNTOUCHABLE")

    def put(self, sid, suffix=b"data"):
        f = self.source / f"{sid}_fingering.pdf"
        f.write_bytes(b"%PDF-1.7\n" + suffix)
        return f

    def run_sync(self, publish):
        with redirect_stdout(io.StringIO()) as out, redirect_stderr(io.StringIO()) as err:
            code = pub.main((["--publish"] if publish else []) + ["--repo", str(self.repo)])
        return code, out.getvalue(), err.getvalue()

    def confirmed(self):
        return (patch.object(pub, "confirm_changes", return_value=True),
                patch.object(pub, "deploy_hook", return_value="JOB123"),
                patch.object(pub, "wait_for_mirror", return_value=True))

    def test_audit_add_update_delete_push_all_in_one_git_commit_and_preserve_original(self):
        self.put("EK123-001", b"corrected")
        (self.source / "EK456-001_fingering.pdf").unlink()
        self.put("EK789-001", b"new")
        code, output, _ = self.run_sync(False)
        self.assertEqual(code, 0)
        self.assertIn("PŘIDAT 1 | NAHRADIT 1 | SMAZAT 1", output)
        self.assertIn("EK456-001_fingering.pdf", output)
        self.assertEqual(git("-C", self.repo, "rev-parse", "HEAD"), self.baseline)
        a, b, c = self.confirmed()
        with a as confirm, b as hook, c as wait:
            code, output, err = self.run_sync(True)
        self.assertEqual((code, err), (0, ""))
        self.assertIn("HOTOVO", output)
        self.assertIn("EK456-001_fingering.pdf", confirm.call_args.args[0])
        hook.assert_called_once()
        wait.assert_called_once()
        self.assertEqual(wait.call_args.args[3], ("public/fingering/EK456-001_fingering.pdf",))
        head = git("-C", self.repo, "rev-parse", "HEAD")
        self.assertEqual(git("--git-dir", self.remote, "rev-parse", "main"), head)
        tree = pub.tree_pdfs(self.repo, "HEAD")
        self.assertEqual(set(tree), {f"{pub.REL_DIR}/EK123-001_fingering.pdf", f"{pub.REL_DIR}/EK789-001_fingering.pdf"})
        self.assertEqual(self.original_pdf.read_bytes(), b"ORIGINAL UNTOUCHABLE")
        self.assertEqual(pub.read_state()["last_confirmed_sha"], head)

    def test_cancel_does_not_change_git_or_origin_or_original(self):
        (self.source / "EK456-001_fingering.pdf").unlink()
        with patch.object(pub, "confirm_changes", return_value=False), patch.object(pub, "deploy_hook") as hook:
            code, out, _ = self.run_sync(True)
        self.assertEqual(code, 0)
        self.assertIn("ZRUŠENO", out)
        self.assertEqual(git("--git-dir", self.remote, "rev-parse", "main"), self.baseline)
        self.assertEqual(git("-C", self.repo, "rev-parse", "HEAD"), self.baseline)
        self.assertEqual(git("-C", self.repo, "diff", "--cached", "--name-only"), "")
        self.assertTrue(self.original_pdf.exists())
        hook.assert_not_called()

    def test_pending_old_git_pdf_plus_local_new_change_and_deletion(self):
        self.put("EK999-001", b"queued")
        git("-C", self.repo, "add", "--", "public/fingering/EK999-001_fingering.pdf")
        git("-C", self.repo, "commit", "-m", "waiting on GitHub")
        git("-C", self.repo, "push", "origin", "main")
        (self.source / "EK456-001_fingering.pdf").unlink()
        self.put("EK890-001", b"newer")
        a, b, c = self.confirmed()
        with a as confirm, b, c:
            code, out, _ = self.run_sync(True)
        self.assertEqual(code, 0)
        self.assertIn("PŘIDAT 2 | NAHRADIT 0 | SMAZAT 1", out)
        self.assertIn("EK999-001_fingering.pdf", confirm.call_args.args[0])
        self.assertIn("EK890-001_fingering.pdf", confirm.call_args.args[0])
        self.assertIn("EK456-001_fingering.pdf", confirm.call_args.args[0])
        self.assertIn("+1  ~0  -1", out)

    def test_hook_failure_rolls_back_github_and_preserves_local_source(self):
        wanted = self.put("EK789-001", b"wanted")
        with patch.object(pub, "confirm_changes", return_value=True), \
             patch.object(pub, "deploy_hook", side_effect=[pub.PublishError("network"), "ROLLBACKJOB"]) as hook, \
             patch.object(pub, "wait_for_mirror", return_value=True) as wait:
            code, out, err = self.run_sync(True)
        self.assertEqual(code, 2)
        self.assertEqual(err, "")
        self.assertIn("ROLLBACK HOTOVO", out)
        self.assertEqual(hook.call_count, 2)
        self.assertEqual(wait.call_count, 1, "candidate hook failed before verification; only rollback is verified")
        remote = git("--git-dir", self.remote, "rev-parse", "main")
        self.assertEqual(set(pub.tree_pdfs(self.repo, remote)), set(pub.tree_pdfs(self.repo, self.baseline)))
        self.assertTrue(wanted.exists(), "rollback must not delete the local source-of-truth PDF")
        self.assertNotIn("transaction", pub.read_state())
        self.assertEqual(pub.read_state()["last_confirmed_sha"], remote)

    def test_verification_failure_rolls_back_both_github_and_production(self):
        wanted = self.put("EK789-001", b"wanted")
        with patch.object(pub, "confirm_changes", return_value=True), \
             patch.object(pub, "deploy_hook", side_effect=["PUBLISHJOB", "ROLLBACKJOB"]) as hook, \
             patch.object(pub, "wait_for_mirror", side_effect=[False, True]) as wait:
            code, out, err = self.run_sync(True)
        self.assertEqual((code, err), (2, ""))
        self.assertIn("ROLLBACK HOTOVO", out)
        self.assertEqual(hook.call_count, 2)
        self.assertEqual(wait.call_count, 2)
        remote = git("--git-dir", self.remote, "rev-parse", "main")
        self.assertEqual(set(pub.tree_pdfs(self.repo, remote)), set(pub.tree_pdfs(self.repo, self.baseline)))
        self.assertTrue(wanted.exists())
        self.assertEqual(pub.read_state()["last_confirmed_sha"], remote)

    def test_failed_rollback_is_recovered_before_any_new_publication(self):
        self.put("EK789-001", b"wanted")
        with patch.object(pub, "confirm_changes", return_value=True), \
             patch.object(pub, "deploy_hook", side_effect=["PUBLISHJOB", "ROLLBACKJOB"]), \
             patch.object(pub, "wait_for_mirror", side_effect=[False, False]):
            code, _, _ = self.run_sync(True)
        self.assertEqual(code, 2)
        state = pub.read_state()
        self.assertEqual(state["transaction"]["phase"], "rollback_pushed")
        rollback = state["transaction"]["rollback_sha"]
        self.assertEqual(git("--git-dir", self.remote, "rev-parse", "main"), rollback)

        with patch.object(pub, "confirm_changes") as confirm, \
             patch.object(pub, "deploy_hook", return_value="RECOVERYJOB"), \
             patch.object(pub, "wait_for_mirror", return_value=True):
            code, out, err = self.run_sync(True)
        self.assertEqual((code, err), (2, ""))
        self.assertIn("ROLLBACK RECOVERY HOTOVO", out)
        confirm.assert_not_called()
        self.assertNotIn("transaction", pub.read_state())
        self.assertEqual(pub.read_state()["last_confirmed_sha"], rollback)

    def test_recovery_clears_staged_pdf_after_crash_before_commit(self):
        wanted = self.put("EK789-001", b"wanted")
        git("-C", self.repo, "add", "public/fingering/EK789-001_fingering.pdf")
        pub.write_state({"last_confirmed_sha": self.baseline, "transaction": {
            "phase": "approved",
            "baseline_sha": self.baseline,
            "before_sha": self.baseline,
        }})
        with patch.object(pub, "confirm_changes", return_value=False):
            code, out, err = self.run_sync(True)
        self.assertEqual((code, err), (0, ""))
        self.assertIn("provádím nový audit", out)
        self.assertEqual(git("-C", self.repo, "diff", "--cached", "--name-only"), "")
        self.assertEqual(git("-C", self.repo, "rev-parse", "HEAD"), self.baseline)
        self.assertEqual(git("--git-dir", self.remote, "rev-parse", "main"), self.baseline)
        self.assertTrue(wanted.exists())
        self.assertNotIn("transaction", pub.read_state())

    def test_recovery_discards_unpushed_local_candidate_but_preserves_source(self):
        wanted = self.put("EK789-001", b"wanted")
        git("-C", self.repo, "add", "public/fingering/EK789-001_fingering.pdf")
        git("-C", self.repo, "commit", "-m", "local candidate")
        candidate = git("-C", self.repo, "rev-parse", "HEAD")
        pub.write_state({"last_confirmed_sha": self.baseline, "transaction": {
            "phase": "local_committed",
            "baseline_sha": self.baseline,
            "before_sha": self.baseline,
            "candidate_sha": candidate,
        }})
        with patch.object(pub, "confirm_changes", return_value=False):
            code, out, err = self.run_sync(True)
        self.assertEqual((code, err), (0, ""))
        self.assertIn("neodeslaný publikační commit byl vrácen", out)
        self.assertEqual(git("-C", self.repo, "rev-parse", "HEAD"), self.baseline)
        self.assertEqual(git("--git-dir", self.remote, "rev-parse", "main"), self.baseline)
        self.assertTrue(wanted.exists())
        self.assertNotIn("transaction", pub.read_state())

    def test_publisher_control_files_do_not_block_legacy_pdf_waiting_on_github(self):
        (self.repo / "PUBLIKOVAT_PRSTOKLADY.cmd").write_text("@echo off\n")
        git("-C", self.repo, "add", "PUBLIKOVAT_PRSTOKLADY.cmd")
        git("-C", self.repo, "commit", "-m", "publisher control")
        self.put("EK789-001", b"legacy pending")
        git("-C", self.repo, "add", "public/fingering/EK789-001_fingering.pdf")
        git("-C", self.repo, "commit", "-m", "legacy pending PDF")
        git("-C", self.repo, "push", "origin", "main")
        with patch.object(pub, "confirm_changes", return_value=True), \
             patch.object(pub, "deploy_hook", return_value="JOB"), \
             patch.object(pub, "wait_for_mirror", return_value=True):
            code, out, err = self.run_sync(True)
        self.assertEqual((code, err), (0, ""))
        self.assertIn("už jsou na main; pokračuji čekajícím deploymentem", out)
        self.assertEqual(pub.read_state()["last_confirmed_sha"], git("-C", self.repo, "rev-parse", "HEAD"))

    def test_missing_state_reconstructs_latest_byte_verified_publisher_baseline(self):
        # Make the existing baseline recognizable as a publisher-created revision.
        git("-C", self.repo, "commit", "--amend", "-m", "Sync Fingering PDF mirror (+2 ~0 -0)")
        recovered_baseline = git("-C", self.repo, "rev-parse", "HEAD")
        git("-C", self.repo, "push", "--force", "origin", "main")
        pub.state_path().unlink()

        with patch.object(pub, "production_matches_revision",
                          side_effect=lambda repo, revision, known: revision == recovered_baseline) as match:
            code, out, err = self.run_sync(False)

        self.assertEqual((code, err), (0, ""))
        self.assertIn("STATE RECOVERY OK", out)
        self.assertEqual(pub.read_state()["last_confirmed_sha"], recovered_baseline)
        match.assert_called()

    def test_missing_state_never_falls_back_to_historical_constant(self):
        git("-C", self.repo, "commit", "--amend", "-m", "Sync Fingering PDF mirror (+2 ~0 -0)")
        git("-C", self.repo, "push", "--force", "origin", "main")
        pub.state_path().unlink()

        with patch.object(pub, "production_matches_revision", return_value=False):
            code, out, err = self.run_sync(False)

        self.assertEqual(code, 1)
        self.assertNotIn("PUBLIKACE FINGERING PDF", out)
        self.assertIn("neodpovídá byte-exact veřejné produkci", err)
        self.assertFalse(pub.state_path().exists())

    def test_missing_state_rejects_nonpublisher_history_instead_of_guessing(self):
        pub.state_path().unlink()
        with patch.object(pub, "production_matches_revision") as match:
            code, out, err = self.run_sync(False)
        self.assertEqual(code, 1)
        self.assertIn("nejsou bezpečné kandidáty", err)
        match.assert_not_called()

    def test_block_unrelated_committed_code_since_last_ready(self):
        (self.repo / "README.md").write_text("changed app")
        git("-C", self.repo, "add", "README.md")
        git("-C", self.repo, "commit", "-m", "app change")
        git("-C", self.repo, "push", "origin", "main")
        self.put("EK789-001")
        with patch.object(pub, "confirm_changes") as confirm:
            code, _, err = self.run_sync(True)
        self.assertEqual(code, 1)
        self.assertIn("změna aplikace", err)
        confirm.assert_not_called()

    def test_block_unrelated_staged_code(self):
        (self.repo / "README.md").write_text("other")
        git("-C", self.repo, "add", "README.md")
        with patch.object(pub, "confirm_changes") as confirm:
            code, _, err = self.run_sync(True)
        self.assertEqual(code, 1)
        self.assertIn("index", err)
        confirm.assert_not_called()

    def test_block_filename_malformed_or_nonpdf_without_any_git_change(self):
        (self.source / "definitely-bad.pdf").write_bytes(b"%PDF-1.4\n")
        code, _, err = self.run_sync(True)
        self.assertEqual(code, 1)
        self.assertIn("Nepovolený soubor", err)
        self.assertEqual(git("--git-dir", self.remote, "rev-parse", "main"), self.baseline)

    def test_block_symlink_into_original(self):
        link = self.source / "EK567-001_fingering.pdf"
        try:
            link.symlink_to(self.original_pdf)
        except (OSError, NotImplementedError):
            self.skipTest("symlink unavailable on host")
        code, _, err = self.run_sync(True)
        self.assertEqual(code, 1)
        self.assertIn("odkaz", err)
        self.assertEqual(self.original_pdf.read_bytes(), b"ORIGINAL UNTOUCHABLE")

    def test_block_changed_pdf_after_human_audit(self):
        f = self.put("EK789-001", b"before")
        def mutate(_):
            f.write_bytes(b"%PDF-1.7\nAFTER AUDIT")
            return True
        with patch.object(pub, "confirm_changes", side_effect=mutate):
            code, _, err = self.run_sync(True)
        self.assertEqual(code, 1)
        self.assertIn("po auditu změnila", err)
        self.assertEqual(git("--git-dir", self.remote, "rev-parse", "main"), self.baseline)

    def test_baseline_and_local_same_no_action(self):
        with patch.object(pub, "confirm_changes") as confirm, patch.object(pub, "deploy_hook") as hook:
            code, out, _ = self.run_sync(True)
        self.assertEqual(code, 0)
        self.assertIn("HOTOVO", out)
        confirm.assert_not_called()
        hook.assert_not_called()

    def test_remote_ahead_failure_precedes_confirmation(self):
        clone = self.repo.parent / "other"
        git("clone", "-b", "main", self.remote, clone)
        git("-C", clone, "config", "user.name", "other")
        git("-C", clone, "config", "user.email", "other@example.invalid")
        (clone / "README.md").write_text("external update")
        git("-C", clone, "commit", "-am", "remote modified")
        git("-C", clone, "push", "origin", "main")
        self.put("EK789-001")
        with patch.object(pub, "confirm_changes") as confirm:
            code, _, err = self.run_sync(True)
        self.assertEqual(code, 1)
        self.assertIn("není totožná", err)
        confirm.assert_not_called()

    def test_pending_added_then_removed_locally_cancels_without_deployment(self):
        self.put("EK789-001")
        git("-C", self.repo, "add", "public/fingering/EK789-001_fingering.pdf")
        git("-C", self.repo, "commit", "-m", "unpublished extra")
        git("-C", self.repo, "push", "origin", "main")
        (self.source / "EK789-001_fingering.pdf").unlink()
        with patch.object(pub, "confirm_changes", return_value=True), patch.object(pub, "deploy_hook") as hook:
            code, out, _ = self.run_sync(True)
        self.assertEqual(code, 0)
        self.assertIn("deployment není potřebný", out)
        hook.assert_not_called()
        self.assertNotIn("pending_sha", pub.read_state())
        self.assertEqual(set(pub.tree_pdfs(self.repo, "HEAD")), set(pub.tree_pdfs(self.repo, self.baseline)))

    def test_rollback_commit_preserves_non_pdf_control_files_and_local_worktree(self):
        control = self.repo / "publish_fingering_pdfs.py"
        control.write_text("new publisher")
        git("-C", self.repo, "add", "publish_fingering_pdfs.py")
        git("-C", self.repo, "commit", "-m", "control")
        self.put("EK789-001", b"wanted")
        git("-C", self.repo, "add", "public/fingering/EK789-001_fingering.pdf")
        git("-C", self.repo, "commit", "-m", "candidate")
        candidate = git("-C", self.repo, "rev-parse", "HEAD")
        git("-C", self.repo, "push", "origin", "main")
        state = {"last_confirmed_sha": self.baseline, "transaction": {
            "phase": "pushed",
            "baseline_sha": self.baseline,
            "before_sha": self.baseline,
            "candidate_sha": candidate,
        }}
        pub.write_state(state)
        rollback = pub.prepare_rollback_commit(self.repo, state, candidate, self.baseline)
        pub.push_prepared_rollback(self.repo, state, candidate, rollback)
        self.assertEqual(git("-C", self.repo, "show", f"{rollback}:publish_fingering_pdfs.py"), "new publisher")
        self.assertEqual(set(pub.tree_pdfs(self.repo, rollback)), set(pub.tree_pdfs(self.repo, self.baseline)))
        self.assertTrue((self.source / "EK789-001_fingering.pdf").exists())
        self.assertEqual(git("-C", self.repo, "diff", "--cached", "--name-only"), "")

    def test_windows_audit_payload_is_scrollable_and_default_cancel(self):
        dummy = subprocess.CompletedProcess([], 2)
        with patch.object(pub.sys, "platform", "win32"), \
             patch.object(pub.subprocess, "run", return_value=dummy) as runner:
            self.assertFalse(pub.confirm_changes("SMAZAT (50):\nEK123-001_fingering.pdf"))
        args = runner.call_args.args[0]
        import base64
        code = base64.b64decode(args[-1]).decode("utf-16le")
        self.assertIn("$text.ScrollBars = 'Vertical'", code)
        self.assertIn("[regex]::Split($rawAudit, '\\r\\n|\\n|\\r')", code)
        self.assertIn("$text.Lines = [string[]]$details", code)
        self.assertIn("$layout.Controls.Add($text,0,1)", code)
        self.assertIn("$form.AcceptButton = $cancel", code)
        # Footer controls are positioned by a TableLayoutPanel only after
        # the parent is sized; anchoring from their initial 200px-wide panel
        # pushed both buttons off screen in the actual Windows GUI.
        self.assertIn("$footer.ColumnCount = 3", code)
        self.assertIn("$footer.Dock = 'Fill'", code)
        self.assertIn("$footer.Controls.Add($ok,1,0)", code)
        self.assertIn("$footer.Controls.Add($cancel,2,0)", code)
        self.assertIn("$ok.Dock = 'Fill'", code)
        self.assertIn("$cancel.Dock = 'Fill'", code)
        self.assertNotIn("$ok.Location =", code)
        self.assertNotIn("$cancel.Location =", code)
        self.assertNotIn("$ok.Anchor =", code)
        self.assertNotIn("$cancel.Anchor =", code)
        self.assertIn("$form.Add_Shown({ $text.Select(0,0); [void]$cancel.Focus() })", code)
        payload = base64.b64decode(runner.call_args.kwargs["input"]).decode("utf-8")
        self.assertIn("SMAZAT (50)", payload)


    def test_gitignored_new_pdf_is_stopped_before_dialog(self):
        (self.repo / ".gitignore").write_text("public/fingering/EK789-001_fingering.pdf\n")
        self.put("EK789-001")
        with patch.object(pub, "confirm_changes") as confirm:
            code, _, err = self.run_sync(True)
        self.assertEqual(code, 1)
        self.assertIn("Git ignoruje nové PDF", err)
        confirm.assert_not_called()
        self.assertEqual(git("--git-dir", self.remote, "rev-parse", "main"), self.baseline)

    def test_check_online_requires_exact_sha256(self):
        data = b"%PDF-1.7\ncorrect"
        sha = hashlib.sha256(data).hexdigest()
        class Response:
            status = 200
            def __init__(self, body): self.body = io.BytesIO(body)
            def __enter__(self): return self
            def __exit__(self, *args): return False
            def read(self, n): return self.body.read(n)
        path = "public/fingering/EK123-001_fingering.pdf"
        with patch.object(pub.urllib.request, "urlopen", return_value=Response(data)):
            self.assertTrue(pub.check_online(path, sha, self.baseline))
        with patch.object(pub.urllib.request, "urlopen", return_value=Response(b"%PDF-1.7\nwrong")):
            self.assertFalse(pub.check_online(path, sha, self.baseline))

    def test_mirror_verification_checks_all_local_pdfs_and_deleted_pdf(self):
        self.put("EK789-001")
        removed = ("public/fingering/EK456-001_fingering.pdf",)
        expected = {"public/fingering/EK123-001_fingering.pdf": hashlib.sha256(b"x").hexdigest(),
                    "public/fingering/EK789-001_fingering.pdf": hashlib.sha256(b"y").hexdigest()}
        with patch.object(pub, "check_online", return_value=True) as check:
            self.assertTrue(pub.wait_for_mirror(self.repo, self.baseline, expected, removed, timeout=1))
        checks = [(a[0], a[1]) for a, _ in check.call_args_list]
        self.assertEqual(set(checks), set(expected.items()) | {(removed[0], None)})

    def test_fifty_deletions_reported_and_cancelled_without_touching_originals(self):
        for i in range(10, 60):
            self.put(f"EK{i}-001", b"more")
        git("-C", self.repo, "add", "-A", "--", "public/fingering")
        git("-C", self.repo, "commit", "-m", "add 50")
        git("-C", self.repo, "push", "origin", "main")
        # For this test, those PDFs were previously deployed.
        new_base = git("-C", self.repo, "rev-parse", "HEAD")
        pub.write_state({"last_confirmed_sha": new_base})
        for i in range(10, 60):
            (self.source / f"EK{i}-001_fingering.pdf").unlink()
        with patch.object(pub, "confirm_changes", return_value=False) as confirm:
            code, out, err = self.run_sync(True)
        self.assertEqual((code, err), (0, ""))
        self.assertIn("SMAZAT 50", out)
        self.assertIn("POZOR: bude veřejně odstraněno 50 PDF", confirm.call_args.args[0])
        self.assertEqual(git("--git-dir", self.remote, "rev-parse", "main"), new_base)
        self.assertEqual(self.original_pdf.read_bytes(), b"ORIGINAL UNTOUCHABLE")

    def test_http_absence_only_counts_404_410_not_403(self):
        p = "public/fingering/EK123-001_fingering.pdf"
        def err(code):
            return urllib.error.HTTPError("https://fake", code, "", {}, None)
        with patch.object(pub.urllib.request, "urlopen", side_effect=err(404)):
            self.assertTrue(pub.check_online(p, None, self.baseline))
        with patch.object(pub.urllib.request, "urlopen", side_effect=err(403)):
            self.assertFalse(pub.check_online(p, None, self.baseline))
        with patch.object(pub.urllib.request, "urlopen", side_effect=err(404)):
            self.assertFalse(pub.check_online(p, hashlib.sha256(b"file").hexdigest(), self.baseline))


if __name__ == "__main__":
    unittest.main()
