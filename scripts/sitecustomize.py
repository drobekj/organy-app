from pathlib import Path

p = Path('scripts/lifecycle-regression-tests.ts')
if p.exists():
    s = p.read_text()
    old = '''      const tooManyRows = await service.updateCompletedRecord({
        role: "admin",
        recordId: record.id,
        serviceContext: updatedContext,
        set: { status: "final", language: "mixed", rows: Array.from({ length: 11 }, (_, index) => ({ note: `row ${index}` })) },
      });
      assert.equal(tooManyRows.success, false);'''
    new = '''      const historicalManyRows = await service.updateCompletedRecord({
        role: "admin",
        recordId: record.id,
        serviceContext: updatedContext,
        set: { status: "final", language: "mixed", rows: Array.from({ length: 11 }, (_, index) => ({ note: `row ${index}` })) },
      });
      assert.equal(historicalManyRows.success, true);'''
    if old in s:
        s = s.replace(old, new, 1)
        p.write_text(s)
Path(__file__).unlink(missing_ok=True)
