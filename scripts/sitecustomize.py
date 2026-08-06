import atexit
import runpy
from pathlib import Path


def _apply_compact_row_test_alignment() -> None:
    target = Path(__file__).with_name("phase-31-17-row-ux-test-fix.py")
    if target.exists():
        runpy.run_path(str(target), run_name="__main__")


atexit.register(_apply_compact_row_test_alignment)
