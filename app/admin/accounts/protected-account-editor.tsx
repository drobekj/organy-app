type Account = { authUserId: string; appUserId: string; username: string; displayName: string; active: boolean; roles: string[]; personId?: string; personDisplayName?: string; personPriest?: boolean; personOrganist?: boolean };

export function ProtectedAccountEditor({ account }: { account: Account }) {
  const eligibility = account.personId ? [account.personPriest ? "priest" : "", account.personOrganist ? "organist" : ""].filter(Boolean).join(", ") || "none" : undefined;
  return <article className="detail-panel">
    <div className="app-header">
      <div>
        <h3>{account.displayName}</h3>
        <p className="field-help">Username: <strong>{account.username}</strong> · Actor: {account.appUserId}</p>
        <p className="field-help">{account.personId ? `${account.personDisplayName ?? account.personId} · Person eligibility: ${eligibility}` : "No Person linkage"}</p>
        <p><strong>{account.active ? "Active" : "Inactive"}</strong></p>
      </div>
      <form action="/api/protected-accounts" method="post">
        <input type="hidden" name="action" value="setActive" />
        <input type="hidden" name="appUserId" value={account.appUserId} />
        <input type="hidden" name="active" value={account.active ? "false" : "true"} />
        <button type="submit">{account.active ? "Deactivate" : "Reactivate"}</button>
      </form>
    </div>
    <form action="/api/protected-accounts" method="post" className="planning-form">
      <input type="hidden" name="action" value="updateRoles" />
      <input type="hidden" name="appUserId" value={account.appUserId} />
      <fieldset><legend>Protected roles</legend><div className="form-actions">
        {(["admin", "priest", "organist"] as const).map((role) => <label key={role}><input type="checkbox" name="roles" value={role} defaultChecked={account.roles.includes(role)} /> {role}</label>)}
      </div></fieldset>
      <button type="submit">Save roles</button>
    </form>
  </article>;
}
