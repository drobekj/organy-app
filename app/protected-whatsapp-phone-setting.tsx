"use client";

import { FormEvent, useEffect, useState } from "react";
import { WHATSAPP_PHONE_CHANGED_EVENT, canOwnWhatsAppPhone, normalizeWhatsAppPhone } from "../src/application/whatsapp-phone";

export function ProtectedWhatsAppPhoneSetting({ initialPhone, roles }: { initialPhone?: string; roles: string[] }) {
  const [phone, setPhone] = useState(initialPhone ?? "");
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState(initialPhone ?? "");
  const [pending, setPending] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  useEffect(() => {
    function handlePhoneChange(event: Event) {
      const value = (event as CustomEvent<unknown>).detail;
      const next = typeof value === "string" ? value : "";
      setPhone(next);
      if (next) setInput(next);
      else setOpen(false);
    }
    window.addEventListener(WHATSAPP_PHONE_CHANGED_EVENT, handlePhoneChange);
    return () => window.removeEventListener(WHATSAPP_PHONE_CHANGED_EVENT, handlePhoneChange);
  }, []);

  if (!phone || !canOwnWhatsAppPhone(roles)) return null;

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFeedback(null);
    let normalized: string;
    try { normalized = normalizeWhatsAppPhone(input); }
    catch (error) {
      setFeedback(error instanceof Error ? error.message : "Phone number is invalid.");
      return;
    }

    setPending(true);
    try {
      const response = await fetch("/api/account/whatsapp-phone", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ phone: normalized }),
      });
      const payload = await response.json().catch(() => undefined) as { phoneE164?: string; error?: { message?: string } } | undefined;
      if (!response.ok || !payload?.phoneE164) {
        setFeedback(payload?.error?.message ?? "WhatsApp phone could not be saved.");
        return;
      }
      setPhone(payload.phoneE164);
      setInput(payload.phoneE164);
      setOpen(false);
      window.dispatchEvent(new CustomEvent(WHATSAPP_PHONE_CHANGED_EVENT, { detail: payload.phoneE164 }));
    } catch {
      setFeedback("WhatsApp phone could not be saved.");
    } finally { setPending(false); }
  }

  async function forget() {
    if (!window.confirm("Forget this WhatsApp phone and revoke automatic use?")) return;
    setPending(true);
    setFeedback(null);
    try {
      const response = await fetch("/api/account/whatsapp-phone", { method: "DELETE" });
      const payload = await response.json().catch(() => undefined) as { error?: { message?: string } } | undefined;
      if (!response.ok) {
        setFeedback(payload?.error?.message ?? "WhatsApp phone could not be forgotten.");
        return;
      }
      setPhone("");
      setInput("");
      setOpen(false);
      window.dispatchEvent(new CustomEvent(WHATSAPP_PHONE_CHANGED_EVENT, { detail: null }));
    } catch {
      setFeedback("WhatsApp phone could not be forgotten.");
    } finally { setPending(false); }
  }

  return (
    <>
      <button type="button" onClick={() => { setInput(phone); setFeedback(null); setOpen(true); }}>Phone Setting</button>
      {open && (
        <div className="post-finalize-dialog-backdrop" role="presentation">
          <section className="post-finalize-dialog" role="dialog" aria-modal="true" aria-labelledby="phone-setting-dialog-title">
            <h2 id="phone-setting-dialog-title">Phone Setting</h2>
            <p>This number is saved to your protected Account and is used to open WhatsApp after you finalize a plan.</p>
            <form className="planning-form" onSubmit={save}>
              <label>
                Phone number
                <input type="tel" inputMode="tel" autoComplete="tel" value={input} onChange={(event) => setInput(event.target.value)} required />
              </label>
              {feedback && <p className="auth-error" role="alert">{feedback}</p>}
              <div className="post-finalize-dialog-actions">
                <button type="submit" disabled={pending}>{pending ? "Saving…" : "Save"}</button>
                <button type="button" disabled={pending} onClick={forget}>Forget Phone</button>
                <button type="button" disabled={pending} onClick={() => { setOpen(false); setFeedback(null); }}>Cancel</button>
              </div>
            </form>
          </section>
        </div>
      )}
    </>
  );
}
