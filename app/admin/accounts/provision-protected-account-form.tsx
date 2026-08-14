import { PasswordVisibilityField } from "../../password-visibility-field";

export function ProvisionProtectedAccountForm({ targets }: { targets: { appUserId: string; displayName: string }[] }) {
  if (targets.length === 0) return <p className="field-help">No eligible Actor is available.</p>;
  return <form action="/api/protected-accounts" method="post" className="planning-form">
    <input type="hidden" name="action" value="provision" />
    <label>Application Actor<select name="appUserId" required>{targets.map((target) => <option key={target.appUserId} value={target.appUserId}>{target.displayName}</option>)}</select></label>
    <label>Username<input name="username" minLength={3} maxLength={64} required /></label>
    <PasswordVisibilityField id="initial-password" label="Initial password" name="password" minLength={8} autoComplete="new-password" required />
    <fieldset><legend>Protected roles</legend><label><input type="checkbox" name="roles" value="admin" /> admin</label><label><input type="checkbox" name="roles" value="priest" /> priest</label><label><input type="checkbox" name="roles" value="organist" defaultChecked /> organist</label></fieldset>
    <button type="submit">Create protected Account</button>
  </form>;
}
