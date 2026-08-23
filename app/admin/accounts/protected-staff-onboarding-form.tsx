import { PasswordVisibilityField } from "../../password-visibility-field";

export function ProtectedStaffOnboardingForm({ people }: { people: { id: string; displayName: string; priest: boolean; organist: boolean }[] }) {
  return <form action="/api/protected-staff-onboarding" method="post" className="planning-form">
    <label>
      Existing Person (optional)
      <select name="personId" defaultValue="">
        <option value="">Create a new Person</option>
        {people.map((person) => <option key={person.id} value={person.id}>{person.displayName}</option>)}
      </select>
    </label>
    <label>Display name for new Person<input name="displayName" /></label>
    <label>Username<input name="username" minLength={3} maxLength={64} required /></label>
    <PasswordVisibilityField id="staff-initial-password" label="Initial password" name="password" minLength={8} autoComplete="new-password" required />
    <fieldset>
      <legend>Staff roles</legend>
      <label><input type="checkbox" name="roles" value="priest" /> Priest</label>
      <label><input type="checkbox" name="roles" value="organist" /> Organist</label>
    </fieldset>
    <p className="field-help">Choose an existing historical Person or leave the selector on “Create a new Person”. At least one staff role is required.</p>
    <button type="submit">Add staff account</button>
  </form>;
}
