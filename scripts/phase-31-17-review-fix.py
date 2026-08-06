from pathlib import Path
import runpy
import subprocess

runpy.run_path(str(Path(__file__).with_name("phase-31-17-row-ux-fix.py")), run_name="__main__")

# The historical registered job stages a smaller review file set. Stage the
# additional verified compact-row product files before its commit step.
subprocess.run([
    "git", "add",
    "app/globals.css",
    "docs/candidate-selection-knowledge-transfer.md",
    "docs/phase-31-17-contract.md",
    "scripts/phase-30-1-candidate-flow-tests.ts",
    "scripts/phase-31-16-tests.tsx",
    "src/planning-lifecycle/candidate-flow.ts",
    "src/planning-lifecycle/candidate-list.tsx",
], check=True)
