import { PasswordVisibilityField } from "../../password-visibility-field";
import { ConfirmSubmitButton } from "./confirm-submit-button";

type Account = { authUserId: string; appUserId: string; username: string; displayName: string; active: boolean; roles: string[]; personId?: string; personDisplayName?: string; personPriest?: boolean; personOrganist?: boolean; whatsappPhoneE164?: string };

export function ProtectedAccountEditor({ account, currentAppUserId, canDeactivate }: { account: Account; currentAppUserId: string; canDeactivate: boolean }) {
  const eligibility = account.personId ? [account.personPriest ? "priest" : "", account.personOrganist ? "organist" : ""].filter(Boolean).join(", ") || "none" : undefined;
  const canResetPassword = account.appUserId !== currentAppUserId;
  return <article className="detail-panel">
    <div className="app-header">
      <div>
        <h3>{account.displayName}</h3>
        <p className="field-help">Username: <strong>{account.username}</strong> · Actor: {account.appUserId}</p>
        <p className="field-help">{account.personId ? `${account.personDisplayName ?? account.personId} · Person eligibility: ${eligibility}` : "No Person linkage"}</p>
        <p><strong>{account.active ? "Active" : "Inactive"}</strong></p>
      </div>
      {account.active && !canDeactivate ? <p className="field-help">Last active admin cannot be deactivated.</p> : <form action="/api/protected-accounts" method="post">
        <input type="hidden" name="action" value="setActive" />
        <input type="hidden" name="appUserId" value={account.appUserId} />
        <input type="hidden" name="active" value={account.active ? "false" : "true"} />
        <button type="submit">{account.active ? "Deactivate" : "Reactivate"}</button>
      </form>}
    </div>
    <div className="planning-form">
      <p className="field-help">WhatsApp phone: {account.whatsappPhoneE164 ? <strong>{account.whatsappPhoneE164}</strong> : "not saved"}</p>
      {account.whatsappPhoneE164 && <form action="/api/protected-account-whatsapp-phone/admin-remove" method="post">
        <input type="hidden" name="appUserId" value={account.appUserId} />
        <ConfirmSubmitButton message={`Remove the stored WhatsApp phone for ${account.displayName}? The account owner will be asked again before future automatic WhatsApp use.`}>Remove WhatsApp phone</ConfirmSubmitButton>
      </form>}
      <p className="field-help">Only the account owner can add or change this phone. Admin can remove it to revoke automatic use.</p>
    </div>
    <form action="/api/protected-accounts" method="post" className="planning-form">
      <input type="hidden" name="action" value="updateRoles" />
      <input type="hidden" name="appUserId" value={account.appUserId} />
      <fieldset><legend>Protected roles</legend><div className="form-actions">
        {(["admin", "priest", "organist"] as const).map((role) => <label key={role}><input type="checkbox" name="roles" value={role} defaultChecked={account.roles.includes(role)} /> {role}</label>)}
      </div></fieldset>
      <button type="submit">Save roles</button>
    </form>
    {canResetPassword && <form action="/api/protected-accounts" method="post">
      <input type="hidden" name="action" value="deleteAccount" />
      <input type="hidden" name="appUserId" value={account.appUserId} />
      <ConfirmSubmitButton message={`Delete protected Account ${account.username}? The Person and service history will be preserved.`}>Delete Account</ConfirmSubmitButton>
    </form>}
    {canResetPassword ? <form action="/api/protected-accounts" method="post" className="planning-form">
      <input type="hidden" name="action" value="resetPassword" />
      <input type="hidden" name="appUserId" value={account.appUserId} />
      <PasswordVisibilityField id={`reset-password-${account.authUserId}`} label="Replacement password" name="password" minLength={8} maxLength={128} autoComplete="new-password" required />
      <p className="field-help">The replacement password is not displayed again. Hand it to the account owner outside the application.</p>
      <button type="submit">Reset password and revoke sessions</button>
    </form> : <p className="field-help">Use Change password on the main screen for your own account.</p>}
  </article>;
}
