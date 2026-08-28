"use client";

import { FormEvent, useState } from "react";
import { PersonDeleteButton } from "./person-delete-button";

export type ManagedPerson = {
  id: string;
  displayName: string;
  active: boolean;
  priest: boolean;
  organist: boolean;
};

export function PersonAdminPanel({ people }: { people: ManagedPerson[] }) {
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string>();
  const [newPerson, setNewPerson] = useState({ displayName: "", active: true, priest: true, organist: false });

  async function savePerson(person: Omit<ManagedPerson, "id"> & { id?: string }, pendingKey: string) {
    setPending(pendingKey);
    setError(undefined);
    try {
      const response = await fetch("/api/catalog", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "savePerson",
          input: { person },
          actor: { role: "admin" },
        }),
      });
      const body = await response.json().catch(() => undefined) as
        | { success: true; value: ManagedPerson }
        | { success: false; error: { message?: string } }
        | { error?: { message?: string } }
        | undefined;
      if (!response.ok || !body || !("success" in body) || !body.success) {
        const message = body && "error" in body ? body.error?.message : undefined;
        setError(message ?? "Person could not be saved.");
        return;
      }
      window.location.assign("/admin/accounts?message=Person%20saved.");
    } catch {
      setError("Person could not be saved. Please try again.");
    } finally {
      setPending(null);
    }
  }

  async function submitExisting(event: FormEvent<HTMLFormElement>, person: ManagedPerson) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    await savePerson({
      id: person.id,
      displayName: String(data.get("displayName") ?? ""),
      active: data.has("active"),
      priest: data.has("priest"),
      organist: data.has("organist"),
    }, person.id);
  }

  return <section className="detail-panel" aria-label="Person administration">
    <h2>Persons</h2>
    <p className="field-help">Manage Person identity and Planning eligibility here. Protected Account roles remain separate. Permanent deletion succeeds only when no protected Account or Working, Final, or Completed service references the Person.</p>

    <form className="planning-form person-admin-create" onSubmit={(event) => {
      event.preventDefault();
      void savePerson(newPerson, "new");
    }}>
      <h3>Add Person</h3>
      <label>Display name<input required value={newPerson.displayName} onChange={(event) => setNewPerson((value) => ({ ...value, displayName: event.target.value }))} /></label>
      <div className="form-actions">
        <label><input type="checkbox" checked={newPerson.priest} onChange={(event) => setNewPerson((value) => ({ ...value, priest: event.target.checked }))} /> Priest</label>
        <label><input type="checkbox" checked={newPerson.organist} onChange={(event) => setNewPerson((value) => ({ ...value, organist: event.target.checked }))} /> Organist</label>
        <label><input type="checkbox" checked={newPerson.active} onChange={(event) => setNewPerson((value) => ({ ...value, active: event.target.checked }))} /> Active</label>
      </div>
      <button type="submit" disabled={pending !== null}>{pending === "new" ? "Adding…" : "Add Person"}</button>
    </form>

    {error && <p className="auth-error" role="alert">{error}</p>}

    <div className="person-admin-list">
      {people.map((person) => <article className="detail-panel" key={person.id}>
        <form className="planning-form" onSubmit={(event) => void submitExisting(event, person)}>
          <label>Display name<input name="displayName" defaultValue={person.displayName} required /></label>
          <div className="form-actions">
            <label><input type="checkbox" name="priest" defaultChecked={person.priest} /> Priest</label>
            <label><input type="checkbox" name="organist" defaultChecked={person.organist} /> Organist</label>
            <label><input type="checkbox" name="active" defaultChecked={person.active} /> Active</label>
          </div>
          <div className="form-actions">
            <button type="submit" disabled={pending !== null}>{pending === person.id ? "Saving…" : "Save Person"}</button>
            <PersonDeleteButton personId={person.id} displayName={person.displayName} />
          </div>
        </form>
      </article>)}
    </div>
  </section>;
}
