from pathlib import Path

path = Path("scripts/issue-224-client-patch.py")
text = path.read_text()
old = '''replace_once(
    'onChange={(event) => setSelectedAssignedRole(event.target.value as PlanningRole)}>{storedUser.roles.map((role)',
    'onChange={(event) => selectAssignedRole(event.target.value as PlanningRole)}>{storedUser.roles.map((role)',
    "first role selector",
)
replace_once(
    'onChange={(event) => setSelectedAssignedRole(event.target.value as PlanningRole)}>{storedUser.roles.map((role)',
    'onChange={(event) => selectAssignedRole(event.target.value as PlanningRole)}>{storedUser.roles.map((role)',
    "second role selector",
)
'''
new = '''role_selector = 'onChange={(event) => setSelectedAssignedRole(event.target.value as PlanningRole)}>{storedUser.roles.map((role)'
role_selector_replacement = 'onChange={(event) => selectAssignedRole(event.target.value as PlanningRole)}>{storedUser.roles.map((role)'
if text.count(role_selector) != 2:
    raise SystemExit(f"role selectors: expected exactly 2 matches, found {text.count(role_selector)}")
text = text.replace(role_selector, role_selector_replacement)
'''
if text.count(old) != 1:
    raise SystemExit(f"role selector guard block: expected exactly 1 match, found {text.count(old)}")
path.write_text(text.replace(old, new, 1))
