"""R74 – mirror only organy-app/public/fingering into GitHub/Vercel.

Install THIS script in organy-app's root, not in score-fingering-lab.
No paths, imports, database access or runtime dependencies on score-fingering-lab.
Preview: python publish_fingering_pdfs.py
Publish: python publish_fingering_pdfs.py --publish (one detailed pre-commit HUMAN OK)
"""
from __future__ import annotations

import argparse
import concurrent.futures
import getpass
import hashlib
import json
import os
import re
import subprocess
import sys
import tempfile
import time
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import dataclass
from pathlib import Path

REL_DIR = "public/fingering"
PDF_NAME = re.compile(r"EK[0-9]+[A-Z]?-[0-9]{3}_fingering\.pdf\Z")
COMMIT_SHA = re.compile(r"[0-9a-f]{40}\Z")
ALLOWED_REMOTES = {
    "https://github.com/drobekj/organy-app",
    "git@github.com:drobekj/organy-app",
    "ssh://git@github.com/drobekj/organy-app",
}
# R73's verified production baseline, only used if no R73/R74 state exists.
INITIAL_PRODUCTION_SHA = "d0d88c01d8fa3b27d98d4d0a0979948333ae4767"
VERCEL_PROJECT_ID = "prj_HaAJloeBq90EcFrMOVVC3kTiJxc0"
PRODUCTION_URL = "https://organy-app.vercel.app"
GIT_AUTHOR = "drobekj"
GIT_EMAIL = "106076286+drobekj@users.noreply.github.com"
TIMEOUT_SECONDS = 300


class PublishError(RuntimeError):
    pass


@dataclass(frozen=True)
class Delta:
    added: tuple[str, ...] = ()
    updated: tuple[str, ...] = ()
    deleted: tuple[str, ...] = ()

    @property
    def total(self) -> int:
        return len(self.added) + len(self.updated) + len(self.deleted)


def git(repo: Path, *args: str, env: dict[str, str] | None = None) -> str:
    try:
        r = subprocess.run(["git", "-C", str(repo), *args], text=True,
                           encoding="utf-8", errors="replace", capture_output=True, env=env)
    except FileNotFoundError as exc:
        raise PublishError("Git není dostupný v PATH") from exc
    if r.returncode:
        raise PublishError(f"Git {args[0]} selhal: {(r.stderr or r.stdout).strip()}")
    return r.stdout.strip()


def git_commit_env() -> dict[str, str]:
    env = os.environ.copy()
    env.update({"GIT_AUTHOR_NAME": GIT_AUTHOR, "GIT_AUTHOR_EMAIL": GIT_EMAIL,
                "GIT_COMMITTER_NAME": GIT_AUTHOR, "GIT_COMMITTER_EMAIL": GIT_EMAIL})
    return env


def digest(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for block in iter(lambda: f.read(1024 * 1024), b""):
            h.update(block)
    return h.hexdigest()


def safe_file(path: Path) -> None:
    if path.is_symlink() or (hasattr(path, "is_junction") and path.is_junction()) or not path.is_file():
        raise PublishError(f"Neregulérní PDF / odkaz: {path}")


def repo_root(repo: Path) -> Path:
    if not repo.is_dir() or repo.is_symlink() or (hasattr(repo, "is_junction") and repo.is_junction()):
        raise PublishError("Chybí adresář projektu organy-app")
    actual = Path(git(repo, "rev-parse", "--show-toplevel")).resolve()
    if actual != repo.resolve():
        raise PublishError(f"Git root není očekávaný organy-app: {actual}")
    if git(repo, "branch", "--show-current") != "main":
        raise PublishError("Publikace je povolena pouze z větve main")
    remote = git(repo, "remote", "get-url", "origin").rstrip("/").removesuffix(".git")
    if remote not in ALLOWED_REMOTES:
        raise PublishError(f"Neočekávaný Git remote: {remote}")
    directory = repo / REL_DIR
    if ((repo / "public").is_symlink()
            or (hasattr(repo / "public", "is_junction") and (repo / "public").is_junction())
            or directory.is_symlink()
            or (hasattr(directory, "is_junction") and directory.is_junction())
            or not directory.is_dir()):
        raise PublishError("Adresář public/fingering není regulérní")
    if git(repo, "diff", "--cached", "--no-renames", "--name-only"):
        raise PublishError("Git index obsahuje cizí připravené změny; nic nebylo změněno")
    return directory


def local_pdfs(directory: Path) -> dict[str, str]:
    """Local directory is the *only* source of the desired public PDF set."""
    result = {}
    for item in directory.iterdir():
        if item.is_symlink() or (hasattr(item, "is_junction") and item.is_junction()):
            raise PublishError(f"Symbolický odkaz v publikačním adresáři: {item.name}")
        if item.is_dir():
            # No subdirectory is part of the public fingering contract.
            raise PublishError(f"Neočekávaná podsložka public/fingering: {item.name}")
        if not item.is_file():
            raise PublishError(f"Neregulérní položka: {item.name}")
        if not PDF_NAME.fullmatch(item.name):
            raise PublishError(f"Nepovolený soubor v public/fingering: {item.name}")
        safe_file(item)
        with item.open("rb") as f:
            if f.read(5) != b"%PDF-":
                raise PublishError(f"Chybí PDF signatura: {item.name}")
        result[f"{REL_DIR}/{item.name}"] = digest(item)
    folded = [s.casefold() for s in result]
    if len(folded) != len(set(folded)):
        raise PublishError("Kolize jmen PDF nerozlišující velikost písmen")
    return dict(sorted(result.items()))


def tree_pdfs(repo: Path, revision: str) -> dict[str, str]:
    """Git blob IDs (not SHA256); tree -r is an independent list of *all* PDFs."""
    data = git(repo, "ls-tree", "-r", revision, "--", REL_DIR)
    result = {}
    for line in data.splitlines():
        if not line:
            continue
        try:
            head, path = line.split("\t", 1)
            mode, kind, blob = head.split()
        except ValueError as exc:
            raise PublishError("Nelze přečíst Git tree publikačního adresáře") from exc
        if kind != "blob" or mode != "100644" and mode != "100755":
            raise PublishError(f"Neobvyklý Git objekt v publikačním adresáři: {path}")
        if path.count("/") != 2 or not PDF_NAME.fullmatch(Path(path).name):
            raise PublishError(f"Nepovolená položka v Git public/fingering: {path}")
        result[path] = blob
    return result


def file_delta(before: dict[str, str], after: dict[str, str]) -> Delta:
    b, a = set(before), set(after)
    return Delta(tuple(sorted(a - b)),
                 tuple(sorted(p for p in b & a if before[p] != after[p])),
                 tuple(sorted(b - a)))


def git_blob_map(repo: Path, pdfs: dict[str, str]) -> dict[str, str]:
    return {p: git(repo, "hash-object", str(repo / p)) for p in pdfs}


def private_dir() -> Path:
    base = os.environ.get("LOCALAPPDATA")
    return (Path(base) / "Prstoklady" if base and sys.platform == "win32"
            else Path.home() / ".config" / "prstoklady")


def hook_path() -> Path:
    return private_dir() / "vercel_deploy_hook.url"


def state_path() -> Path:
    return private_dir() / "fingering_deployment_state.json"


def secure_write(path: Path, contents: str) -> None:
    if path.parent.is_symlink() or path.is_symlink():
        raise PublishError("Nedovolený symbolický odkaz u konfigurace")
    path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    fd, name = tempfile.mkstemp(prefix=".fingering-", dir=path.parent)
    try:
        os.chmod(name, 0o600)
        with os.fdopen(fd, "w", encoding="utf-8") as stream:
            stream.write(contents)
        os.replace(name, path)
    finally:
        Path(name).unlink(missing_ok=True)


def hook_url(value: str) -> str:
    url = value.strip()
    p = urllib.parse.urlsplit(url)
    if (p.scheme != "https" or p.hostname != "api.vercel.com" or p.port is not None
            or p.username or p.password or p.query or p.fragment
            or not re.fullmatch(rf"/v1/integrations/deploy/{re.escape(VERCEL_PROJECT_ID)}/[A-Za-z0-9_-]+", p.path)):
        raise PublishError("Neplatný Vercel Deploy Hook URL")
    return url


def setup_hook() -> None:
    print("Vercel > organy-app > Settings > Git > Deploy Hooks (branch main).")
    url = hook_url(getpass.getpass("Vlož tajnou hook URL (nebude vidět): "))
    secure_write(hook_path(), url + "\n")
    print("Hook uložen pro aktuální účet mimo oba repozitáře.")


def read_hook() -> str:
    p = hook_path()
    if p.is_symlink() or not p.is_file():
        raise PublishError("Chybí Deploy Hook. Jednorázově použij --setup-hook (R73 konfigurace se přebírá).")
    return hook_url(p.read_text(encoding="utf-8"))


def read_state() -> dict:
    p = state_path()
    if p.is_symlink():
        raise PublishError("Symbolický odkaz deployment state")
    if not p.exists():
        return {"last_confirmed_sha": INITIAL_PRODUCTION_SHA}
    try:
        d = json.loads(p.read_text(encoding="utf-8"))
        if not isinstance(d, dict) or not COMMIT_SHA.fullmatch(d["last_confirmed_sha"]):
            raise ValueError()
        return d
    except (ValueError, KeyError, TypeError) as exc:
        raise PublishError("Neplatný deployment state: publikace zastavena") from exc


def write_state(value: dict) -> None:
    secure_write(state_path(), json.dumps(value, sort_keys=True, indent=2) + "\n")


def verify_baseline(repo: Path, old: str, now: str) -> None:
    # No unseen application/migration commits may slip through via the hook.
    if git(repo, "merge-base", old, now) != old:
        raise PublishError("Evidovaná produkční revize není předkem main; STOP")
    for line in git(repo, "diff", "--name-status", "--no-renames", old, now).splitlines():
        try:
            status, path = line.split("\t", 1)
        except ValueError as exc:
            raise PublishError("Neobvyklá Git změna od posledního Vercelu") from exc
        if status not in {"A", "M", "D"} or not path.startswith(REL_DIR + "/") \
                or path.count("/") != 2 or not PDF_NAME.fullmatch(Path(path).name):
            raise PublishError("Čeká nenasazená změna aplikace mimo Fingering PDF: " + path)


def git_synced(repo: Path) -> str:
    git(repo, "fetch", "--quiet", "origin", "main")
    here = git(repo, "rev-parse", "HEAD")
    remote = git(repo, "rev-parse", "FETCH_HEAD")
    if here != remote:
        raise PublishError("Lokální main není totožná s GitHub main; synchronizuj repozitář")
    return here


def remote_is(repo: Path, sha: str) -> None:
    result = git(repo, "ls-remote", "origin", "refs/heads/main").split()
    if not result or result[0] != sha:
        raise PublishError("GitHub main se změnila v průběhu operace; STOP")


def audit_text(delta: Delta, queued: Delta, unchanged: int, head: str, baseline: str) -> str:
    lines = ["PUBLIKACE FINGERING PDF – AUDIT PŘED ZMĚNOU", "",
             f"Změny proti produkčnímu baseline {baseline[:7]}:",
             f"  PŘIDAT {len(delta.added)} | NAHRADIT {len(delta.updated)} | SMAZAT {len(delta.deleted)} | BEZE ZMĚNY {unchanged}",
             ""]
    for title, values in [("PŘIDAT", delta.added), ("NAHRADIT", delta.updated), ("SMAZAT", delta.deleted)]:
        lines.append(f"{title} ({len(values)}):")
        lines.extend("  " + Path(x).name for x in values)
        if not values:
            lines.append("  (zadne)")
        lines.append("")
    lines.extend(["Z toho nyní čeká lokální Git commit:",
                  f"  +{len(queued.added)}  ~{len(queued.updated)}  -{len(queued.deleted)}",
                  "Nevyřízená starší PDF na GitHubu jsou zahrnuta."])
    if delta.deleted:
        lines.extend(["", f"POZOR: bude veřejně odstraněno {len(delta.deleted)} PDF!",
                      "Originální samply ani schválená data projektu Prstoklady se nemění."])
    lines.extend(["", "OK = commit/push změn a spuštění Vercel Production.",
                  "ZRUŠIT = žádný commit, push ani deployment."])
    return "\n".join(lines)


def confirm_changes(message: str) -> bool:
    """Scrollable Windows audit; no third-party dependencies. Fails closed if UI unavailable."""
    if sys.platform != "win32":
        print(message)
        return input("Potvrdit publikaci? [ano/N]: ").strip().lower() == "ano"
    # PowerShell WinForms is available with Windows; -EncodedCommand prevents
    # command injection and handles Czech diacritics. No hook secret in text.
    ps = r'''
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

# Plain LF from Python must be separated into real WinForms lines.
# RichTextBox.Lines also avoids any dependence on newline normalization.
$rawAudit = [System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String([Console]::In.ReadToEnd()))
$auditLines = [regex]::Split($rawAudit, '\r\n|\n|\r')
$context = ''
$summary = ''
$details = [string[]]$auditLines
if ($auditLines.Length -ge 6 -and $auditLines[0] -like 'PUBLIKACE FINGERING PDF*' -and $auditLines[3] -match 'PŘIDAT') {
    $context = $auditLines[2].Trim()
    $summary = $auditLines[3].Trim()
    $details = [string[]]$auditLines[5..($auditLines.Length - 1)]
}

$form = New-Object System.Windows.Forms.Form
$form.Text = 'Organy – publikace Fingering PDF'
$form.ClientSize = New-Object System.Drawing.Size(960,660)
$form.MinimumSize = New-Object System.Drawing.Size(720,470)
$form.StartPosition = 'CenterScreen'
$form.TopMost = $true
$form.MinimizeBox = $false
$form.Font = New-Object System.Drawing.Font('Segoe UI',10)

$layout = New-Object System.Windows.Forms.TableLayoutPanel
$layout.Dock = 'Fill'
$layout.RowCount = 3
$layout.ColumnCount = 1
[void]$layout.ColumnStyles.Add(([System.Windows.Forms.ColumnStyle]::new([System.Windows.Forms.SizeType]::Percent,100)))
[void]$layout.RowStyles.Add(([System.Windows.Forms.RowStyle]::new([System.Windows.Forms.SizeType]::Absolute,110)))
[void]$layout.RowStyles.Add(([System.Windows.Forms.RowStyle]::new([System.Windows.Forms.SizeType]::Percent,100)))
[void]$layout.RowStyles.Add(([System.Windows.Forms.RowStyle]::new([System.Windows.Forms.SizeType]::Absolute,62)))

$header = New-Object System.Windows.Forms.Panel
$header.Dock = 'Fill'
$header.BackColor = [System.Drawing.Color]::FromArgb(242,245,249)
$title = New-Object System.Windows.Forms.Label
$title.Text = 'Kontrola změn před publikací'
$title.Font = New-Object System.Drawing.Font('Segoe UI',15,[System.Drawing.FontStyle]::Bold)
$title.Location = New-Object System.Drawing.Point(18,10)
$title.Size = New-Object System.Drawing.Size(900,35)
$title.Anchor = 'Top,Left,Right'
$description = New-Object System.Windows.Forms.Label
$description.Text = $context
$description.Location = New-Object System.Drawing.Point(18,48)
$description.Size = New-Object System.Drawing.Size(900,23)
$description.Anchor = 'Top,Left,Right'
$counts = New-Object System.Windows.Forms.Label
$counts.Text = $summary
$counts.Font = New-Object System.Drawing.Font('Segoe UI',11,[System.Drawing.FontStyle]::Bold)
$counts.Location = New-Object System.Drawing.Point(18,77)
$counts.Size = New-Object System.Drawing.Size(900,26)
$counts.Anchor = 'Top,Left,Right'
if ($summary -match 'SMAZAT [1-9]') { $counts.ForeColor = [System.Drawing.Color]::DarkRed }
$header.Controls.Add($title)
$header.Controls.Add($description)
$header.Controls.Add($counts)

$text = New-Object System.Windows.Forms.RichTextBox
$text.Multiline = $true
$text.ReadOnly = $true
$text.DetectUrls = $false
$text.WordWrap = $true
$text.ScrollBars = 'Vertical'
$text.Font = New-Object System.Drawing.Font('Consolas',11)
$text.Dock = 'Fill'
$text.Margin = New-Object System.Windows.Forms.Padding(12,8,12,8)
$text.Lines = [string[]]$details
$text.Select(0,0)

# Footer buttons must be placed by the layout manager, NOT by absolute
# coordinates + Bottom/Right anchors before the parent panel is sized.
# WinForms initially sizes a new Panel to 200x100; such anchors can push
# buttons permanently beyond the visible form after DPI/autoscaling.
$footer = New-Object System.Windows.Forms.TableLayoutPanel
$footer.Dock = 'Fill'
$footer.RowCount = 1
$footer.ColumnCount = 3
[void]$footer.RowStyles.Add(([System.Windows.Forms.RowStyle]::new([System.Windows.Forms.SizeType]::Percent,100)))
[void]$footer.ColumnStyles.Add(([System.Windows.Forms.ColumnStyle]::new([System.Windows.Forms.SizeType]::Percent,100)))
[void]$footer.ColumnStyles.Add(([System.Windows.Forms.ColumnStyle]::new([System.Windows.Forms.SizeType]::Absolute,180)))
[void]$footer.ColumnStyles.Add(([System.Windows.Forms.ColumnStyle]::new([System.Windows.Forms.SizeType]::Absolute,180)))
$ok = New-Object System.Windows.Forms.Button
$ok.Text = 'OK – Publikovat'
$ok.Dock = 'Fill'
$ok.Margin = New-Object System.Windows.Forms.Padding(6,10,6,10)
$ok.DialogResult = [System.Windows.Forms.DialogResult]::OK
$cancel = New-Object System.Windows.Forms.Button
$cancel.Text = 'Zrušit'
$cancel.Dock = 'Fill'
$cancel.Margin = New-Object System.Windows.Forms.Padding(6,10,6,10)
$cancel.DialogResult = [System.Windows.Forms.DialogResult]::Cancel
[void]$footer.Controls.Add($ok,1,0)
[void]$footer.Controls.Add($cancel,2,0)

$layout.Controls.Add($header,0,0)
$layout.Controls.Add($text,0,1)
$layout.Controls.Add($footer,0,2)
$form.Controls.Add($layout)
$form.CancelButton = $cancel
$form.AcceptButton = $cancel
$form.Add_Shown({ $text.Select(0,0); [void]$cancel.Focus() })
$result = $form.ShowDialog()
$form.Dispose()
if ($result -eq [System.Windows.Forms.DialogResult]::OK) { exit 0 } else { exit 2 }
'''
    import base64
    payload = base64.b64encode(message.encode("utf-8")).decode("ascii")
    encoded = base64.b64encode(ps.encode("utf-16le")).decode("ascii")
    try:
        proc = subprocess.run(["powershell.exe", "-NoProfile", "-STA", "-EncodedCommand", encoded],
                              input=payload, text=True, encoding="ascii", timeout=300)
    except (FileNotFoundError, subprocess.TimeoutExpired) as exc:
        raise PublishError("Potvrzovací Windows okno není dostupné; žádná změna neproběhla") from exc
    if proc.returncode == 0:
        return True
    if proc.returncode == 2:
        return False
    raise PublishError("Chyba potvrzovacího Windows okna; nic se neměnilo")


def deploy_hook(url: str) -> str:
    req = urllib.request.Request(url, data=b"", method="POST")
    try:
        with urllib.request.urlopen(req, timeout=20) as res:
            if res.status not in (200, 201, 202):
                raise PublishError(f"Vercel odmítl požadavek (HTTP {res.status})")
            return str(json.loads(res.read(8192))["job"]["id"])
    except (urllib.error.URLError, TimeoutError, ValueError, KeyError, TypeError) as exc:
        raise PublishError("Vercel hook není potvrzen; PDF zůstávají na GitHubu, lze zkusit --publish znovu") from exc


def check_online(path: str, expected: str | None, commit: str) -> bool:
    """Expected hash or precise HTTP 404/410 for removal (not timeout/403)."""
    url = PRODUCTION_URL + "/" + path.removeprefix("public/") + "?r74=" + commit[:16]
    req = urllib.request.Request(url, headers={"User-Agent": "Organy-R74-Mirror-Verify", "Cache-Control": "no-cache"})
    try:
        with urllib.request.urlopen(req, timeout=15) as res:
            if res.status != 200 or expected is None:
                return False
            h = hashlib.sha256()
            for b in iter(lambda: res.read(1024 * 1024), b""):
                h.update(b)
            return h.hexdigest() == expected
    except urllib.error.HTTPError as exc:
        return expected is None and exc.code in (404, 410)
    except (urllib.error.URLError, TimeoutError):
        return False


def wait_for_mirror(repo: Path, sha: str, expected: dict[str, str], removed: tuple[str, ...],
                    timeout: float = TIMEOUT_SECONDS) -> bool:
    work = [(p, digest_) for p, digest_ in expected.items()] + [(p, None) for p in removed]
    deadline = time.monotonic() + timeout
    while True:
        remote_is(repo, sha)
        with concurrent.futures.ThreadPoolExecutor(max_workers=8) as pool:
            results = list(pool.map(lambda item: check_online(item[0], item[1], sha), work))
        if all(results):
            return True
        if time.monotonic() >= deadline:
            return False
        print(f"VERCEL: čekám na shodu obsahu ({sum(results)}/{len(results)}) ...", flush=True)
        time.sleep(min(12, max(0, deadline - time.monotonic())))


def verify_committed(repo: Path, expected_blobs: dict[str, str], delta: Delta) -> None:
    target = tree_pdfs(repo, "HEAD")
    if target != expected_blobs:
        raise PublishError("Git HEAD není přesným obrazem lokálního public/fingering; STOP")
    actual = {x for x in git(repo, "diff-tree", "--no-renames", "--no-commit-id", "--name-only", "-r", "HEAD").splitlines() if x}
    expected_paths = set(delta.added) | set(delta.updated) | set(delta.deleted)
    if actual != expected_paths:
        raise PublishError("Commit obsahuje jiné soubory než schválený audit; PUSH ZABLOKOVÁN")
    author = git(repo, "show", "-s", "--format=%an%n%ae%n%cn%n%ce", "HEAD").splitlines()
    if author != [GIT_AUTHOR, GIT_EMAIL, GIT_AUTHOR, GIT_EMAIL]:
        raise PublishError("Neočekávaná identita autora publikačního commitu; PUSH ZABLOKOVÁN")


def sync(repo: Path, publish: bool) -> int:
    directory = repo_root(repo)
    hook = read_hook() if publish else None
    head = git_synced(repo) if publish else git(repo, "rev-parse", "HEAD")
    state = read_state()
    baseline = state["last_confirmed_sha"]
    verify_baseline(repo, baseline, head)
    source = local_pdfs(directory)
    local_blobs = git_blob_map(repo, source)
    head_blobs = tree_pdfs(repo, head)
    baseline_blobs = tree_pdfs(repo, baseline)
    git_delta = file_delta(head_blobs, local_blobs)
    production_delta = file_delta(baseline_blobs, local_blobs)
    audit = audit_text(production_delta, git_delta, len(local_blobs) - len(production_delta.added) - len(production_delta.updated), head, baseline)
    print(audit)
    if not production_delta.total and not git_delta.total:
        print("HOTOVO: public/fingering je totožný s posledním ověřeným publikovaným stavem.")
        return 0
    if not publish:
        print("NÁHLED BEZ ZMĚN. Pro schválení spusť --publish.")
        return 0
    # A Git ignore rule must not silently drop a locally selected PDF.
    for rel in git_delta.added:
        ignored = subprocess.run(["git", "-C", str(repo), "check-ignore", "-q", "--", rel],
                                 stdout=subprocess.DEVNULL, stderr=subprocess.PIPE)
        if ignored.returncode == 0:
            raise PublishError("Git ignoruje nové PDF: " + rel)
        if ignored.returncode not in (0, 1):
            raise PublishError("Git check-ignore selhal pro " + rel)
    remote_is(repo, head)
    if not confirm_changes(audit):
        print("ZRUŠENO: žádný Git commit/push ani Vercel deployment.")
        return 0
    # Guard against any last-moment content change after the HUMAN approval.
    repo_root(repo)
    remote_is(repo, head)
    if local_pdfs(directory) != source or git_blob_map(repo, source) != local_blobs:
        raise PublishError("PDF se po auditu změnila; nic nebylo publikováno")
    if git(repo, "rev-parse", "HEAD") != head:
        raise PublishError("HEAD se po auditu změnila")
    if git_delta.total:
        all_paths = list(git_delta.added + git_delta.updated + git_delta.deleted)
        git(repo, "add", "-A", "--", *all_paths)
        indexed = set(git(repo, "diff", "--cached", "--no-renames", "--name-only").splitlines())
        if indexed != set(all_paths):
            raise PublishError("Staging nesouhlasí s auditem. STOP před commitem")
        for path, blob in local_blobs.items():
            if git(repo, "rev-parse", f":{path}") != blob and path in all_paths:
                raise PublishError(f"Git filtr změnil obsah {path}; STOP")
        if local_pdfs(directory) != source:
            raise PublishError("PDF se během Git staging změnila; STOP")
        summary = f"+{len(git_delta.added)} ~{len(git_delta.updated)} -{len(git_delta.deleted)}"
        git(repo, "commit", "-m", f"Sync Fingering PDF mirror ({summary})", env=git_commit_env())
        verify_committed(repo, local_blobs, git_delta)
        current = git(repo, "rev-parse", "HEAD")
        git(repo, "push", "origin", "HEAD:refs/heads/main")
        print(f"GITHUB PUSH OK: {current[:7]} ({summary})")
    else:
        current = head
        print("GITHUB: všechny soubory už byly odeslány; pokračuji čekajícím deploymentem.")
    remote_is(repo, current)
    if local_pdfs(directory) != source:
        raise PublishError("Lokální PDF se během commitu/push změnila; deployment zastaven, opakuj --publish")
    # Persist pending SHA after successful push, including when Vercel fails.
    if not production_delta.total:
        # Git history may have cancelled an earlier undelivered PDF change.
        # Never claim the new commit SHA is deployed when only the PDF content matches.
        state.pop("pending_sha", None)
        state.pop("pending_pdfs", None)
        write_state(state)
        print("GITHUB: stav PDF se shoduje s již zveřejněným baseline; deployment není potřebný.")
        return 0
    state["pending_sha"] = current
    state["pending_pdfs"] = list(production_delta.added + production_delta.updated + production_delta.deleted)
    write_state(state)
    job = deploy_hook(hook)
    print(f"VERCEL: potvrzený požadavek (job {job}), čekám na online stav ...")
    if not wait_for_mirror(repo, current, source, production_delta.deleted):
        print("VERCEL: zatím NENÍ ověřen; znovu spusť --publish. PDF na GitHubu zůstávají.")
        return 2
    state["last_confirmed_sha"] = current
    state.pop("pending_sha", None)
    state.pop("pending_pdfs", None)
    write_state(state)
    print("VERCEL: HOTOVO – všechna očekávaná PDF SHA-256 souhlasí; odstraněná vracejí 404/410.")
    return 0


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(description="R74: Organy public/fingering ↔ GitHub ↔ Vercel, audit + OK")
    p.add_argument("--publish", action="store_true", help="audit + OK, synchronizace a ověření Vercelu")
    p.add_argument("--setup-hook", action="store_true", help="jednorázové nastavení Vercel Deploy Hooku")
    p.add_argument("--repo", type=Path, help="cesta k organy-app (pro testování)")
    args = p.parse_args(argv)
    try:
        if args.setup_hook:
            if args.publish:
                p.error("--setup-hook nelze kombinovat s --publish")
            setup_hook()
            return 0
        repo = args.repo or Path(__file__).resolve().parent
        return sync(repo, args.publish)
    except (PublishError, OSError) as exc:
        print("STOP:", exc, file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
