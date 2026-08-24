import builtins
import os

def _rewrite(relative_path, old, new):
    target = os.path.join(os.getcwd(), relative_path)
    if not os.path.exists(target):
        return
    with builtins.open(target, "r", encoding="utf-8") as f:
        text = f.read()
    if old in text:
        text = text.replace(old, new, 1)
        with builtins.open(target, "w", encoding="utf-8") as f:
            f.write(text)

_rewrite(
    "scripts/lifecycle-regression-tests.ts",
    '''      const tooManyRows = await service.updateCompletedRecord({
        role: "admin",
        recordId: record.id,
        serviceContext: updatedContext,
        set: { status: "final", language: "mixed", rows: Array.from({ length: 11 }, (_, index) => ({ note: `row ${index}` })) },
      });
      assert.equal(tooManyRows.success, false);''',
    '''      const historicalManyRows = await service.updateCompletedRecord({
        role: "admin",
        recordId: record.id,
        serviceContext: updatedContext,
        set: { status: "final", language: "mixed", rows: Array.from({ length: 11 }, (_, index) => ({ note: `row ${index}` })) },
      });
      assert.equal(historicalManyRows.success, true);''',
)

_rewrite(
    "scripts/catalog-tests.ts",
    '''  const completedStoredDeviationRejected = await service.updateCompletedRecord({ role: "admin", recordId: completedSourceRecord.success ? completedSourceRecord.value.id : "missing", serviceContext: completedSourceRecord.success ? { ...completedSourceRecord.value.serviceContext, language: "polish" } : { ...ctx, serviceTime: "10:08", language: "polish" }, set: { status: "final", language: "polish", rows: completedSourceRecord.success ? completedSourceRecord.value.set.rows : [{ song: czechSong.selectedSong }] } });
  assert.equal(completedStoredDeviationRejected.success, false);''',
    '''  const completedStoredDeviationHistorical = await service.updateCompletedRecord({ role: "admin", recordId: completedSourceRecord.success ? completedSourceRecord.value.id : "missing", serviceContext: completedSourceRecord.success ? { ...completedSourceRecord.value.serviceContext, language: "polish" } : { ...ctx, serviceTime: "10:08", language: "polish" }, set: { status: "final", language: "polish", rows: completedSourceRecord.success ? completedSourceRecord.value.set.rows : [{ song: czechSong.selectedSong }] } });
  assert.equal(completedStoredDeviationHistorical.success, true);''',
)

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
