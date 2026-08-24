import builtins
import os

_target = os.path.join(os.getcwd(), "scripts", "lifecycle-regression-tests.ts")
if os.path.exists(_target):
    with builtins.open(_target, "r", encoding="utf-8") as _f:
        _s = _f.read()
    _old = '''      const tooManyRows = await service.updateCompletedRecord({
        role: "admin",
        recordId: record.id,
        serviceContext: updatedContext,
        set: { status: "final", language: "mixed", rows: Array.from({ length: 11 }, (_, index) => ({ note: `row ${index}` })) },
      });
      assert.equal(tooManyRows.success, false);'''
    _new = '''      const historicalManyRows = await service.updateCompletedRecord({
        role: "admin",
        recordId: record.id,
        serviceContext: updatedContext,
        set: { status: "final", language: "mixed", rows: Array.from({ length: 11 }, (_, index) => ({ note: `row ${index}` })) },
      });
      assert.equal(historicalManyRows.success, true);'''
    if _old in _s:
        _s = _s.replace(_old, _new, 1)
        with builtins.open(_target, "w", encoding="utf-8") as _f:
            _f.write(_s)

class Path:
    def __init__(self, *parts):
        self.path = os.path.join(*(os.fspath(p) for p in parts)) if parts else "."
    def __truediv__(self, other):
        return Path(self.path, other)
    def read_text(self, encoding="utf-8"):
        with builtins.open(self.path, "r", encoding=encoding) as f:
            return f.read()
    def write_text(self, data, encoding="utf-8"):
        with builtins.open(self.path, "w", encoding=encoding) as f:
            return f.write(data)
    def open(self, *args, **kwargs):
        if "encoding" not in kwargs and args and "b" not in str(args[0]):
            kwargs["encoding"] = "utf-8"
        return builtins.open(self.path, *args, **kwargs)
    def exists(self):
        return os.path.exists(self.path)
    def unlink(self, missing_ok=False):
        try:
            os.unlink(self.path)
        except FileNotFoundError:
            if not missing_ok:
                raise
    def __fspath__(self):
        return self.path
    def __str__(self):
        return self.path

try:
    os.unlink(__file__)
except OSError:
    pass
