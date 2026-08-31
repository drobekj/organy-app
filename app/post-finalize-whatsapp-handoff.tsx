"use client";

import { FormEvent, useEffect, useState } from "react";
import type { PersistedPlanningPlan } from "../src/application/planning-lifecycle";
import { WHATSAPP_PHONE_CHANGED_EVENT, normalizeWhatsAppPhone } from "../src/application/whatsapp-phone";
import { buildFinalPlanWhatsAppUrl } from "../src/planning-lifecycle/whatsapp-finalization";
import type { RuntimeMode } from "./planning-lifecycle-client";

type Props = {
  plan: PersistedPlanningPlan;
  runtimeMode: RuntimeMode;
  onClose: () => void;
};

export function PostFinalizeWhatsAppHandoff({ plan, runtimeMode, onClose }: Props) {
  const [phone, setPhone] = useState<string | null>(null);
  const [loadingPhone, setLoadingPhone] = useState(runtimeMode === "db");
  const [phonePromptOpen, setPhonePromptOpen] = useState(false);
  const [phoneInput, setPhoneInput] = useState("");
  const [rememberPhone, setRememberPhone] = useState(true);
  const [phoneError, setPhoneError] = useState<string | null>(null);
  const [savingPhone, setSavingPhone] = useState(false);

  useEffect(() => {
    function handlePhoneChange(event: Event) {
      const value = (event as CustomEvent<unknown>).detail;
      setPhone(typeof value === "string" && value ? value : null);
    }
    window.addEventListener(WHATSAPP_PHONE_CHANGED_EVENT, handlePhoneChange);
    return () => window.removeEventListener(WHATSAPP_PHONE_CHANGED_EVENT, handlePhoneChange);
  }, []);

  useEffect(() => {
    if (runtimeMode !== "db") {
      setLoadingPhone(false);
      return;
    }
    let cancelled = false;
    void fetch("/api/account/whatsapp-phone", { method: "GET", cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error("Saved WhatsApp phone could not be loaded.");
        return response.json() as Promise<{ phoneE164?: string | null }>;
      })
      .then((result) => {
        if (!cancelled) setPhone(result.phoneE164 ?? null);
      })
      .catch(() => {
        if (!cancelled) setPhone(null);
      })
      .finally(() => {
        if (!cancelled) setLoadingPhone(false);
      });
    return () => { cancelled = true; };
  }, [runtimeMode]);

  function openPhonePrompt() {
    setPhoneInput(phone ?? "");
    setRememberPhone(true);
    setPhoneError(null);
    setPhonePromptOpen(true);
  }

  function openOneTime(phoneE164: string) {
    window.open(buildFinalPlanWhatsAppUrl(plan, phoneE164), "_blank", "noopener,noreferrer");
    onClose();
  }

  async function submitPhone(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPhoneError(null);
    let phoneE164: string;
    try { phoneE164 = normalizeWhatsAppPhone(phoneInput); }
    catch (error) {
      setPhoneError(error instanceof Error ? error.message : "Phone number is invalid.");
      return;
    }

    if (!rememberPhone || runtimeMode !== "db") {
      openOneTime(phoneE164);
      return;
    }

    const popup = window.open("about:blank", "_blank");
    if (popup) popup.opener = null;
    setSavingPhone(true);
    try {
      const response = await fetch("/api/account/whatsapp-phone", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ phone: phoneE164 }),
      });
      const payload = await response.json().catch(() => undefined) as { phoneE164?: string; error?: { message?: string } } | undefined;
      if (!response.ok || !payload?.phoneE164) {
        popup?.close();
        setPhoneError(payload?.error?.message ?? "WhatsApp phone could not be saved.");
        return;
      }
      setPhone(payload.phoneE164);
      window.dispatchEvent(new CustomEvent(WHATSAPP_PHONE_CHANGED_EVENT, { detail: payload.phoneE164 }));
      const target = buildFinalPlanWhatsAppUrl(plan, payload.phoneE164);
      if (popup) popup.location.href = target;
      else window.open(target, "_blank", "noopener,noreferrer");
      onClose();
    } catch {
      popup?.close();
      setPhoneError("WhatsApp phone could not be saved.");
    } finally {
      setSavingPhone(false);
    }
  }

  if (phonePromptOpen) {
    return (
      <div className="post-finalize-dialog-backdrop" role="presentation">
        <section className="post-finalize-dialog" role="dialog" aria-modal="true" aria-labelledby="whatsapp-phone-dialog-title">
          <h2 id="whatsapp-phone-dialog-title">WhatsApp phone</h2>
          <p>Enter the phone number that WhatsApp should open for this finalized plan.</p>
          <p className="field-help">If you save it, the number is stored with your protected Account and future WhatsApp handoffs will use it automatically. You can later change or forget it in User → Phone Setting.</p>
          <form className="planning-form" onSubmit={submitPhone}>
            <label>
              Phone number
              <input
                type="tel"
                inputMode="tel"
                autoComplete="tel"
                value={phoneInput}
                onChange={(event) => setPhoneInput(event.target.value)}
                placeholder="+420 601 234 567"
                required
              />
            </label>
            {runtimeMode === "db" && (
              <label>
                <input type="checkbox" checked={rememberPhone} onChange={(event) => setRememberPhone(event.target.checked)} />
                {" "}Save this number to my protected Account and use it automatically next time
              </label>
            )}
            {phoneError && <p className="auth-error" role="alert">{phoneError}</p>}
            <div className="post-finalize-dialog-actions">
              <button type="submit" disabled={savingPhone}>{savingPhone ? "Saving…" : "Open WhatsApp"}</button>
              <button type="button" disabled={savingPhone} onClick={() => { setPhonePromptOpen(false); setPhoneError(null); }}>Back</button>
            </div>
          </form>
        </section>
      </div>
    );
  }

  return (
    <div className="post-finalize-dialog-backdrop" role="presentation">
      <section className="post-finalize-dialog" role="dialog" aria-modal="true" aria-labelledby="post-finalize-dialog-title">
        <h2 id="post-finalize-dialog-title">Plan finalized</h2>
        <p>Inform about the finalized plan via WhatsApp?</p>
        <div className="post-finalize-dialog-actions">
          {phone ? (
            <a href={buildFinalPlanWhatsAppUrl(plan, phone)} target="_blank" rel="noopener noreferrer" onClick={onClose}>
              Open WhatsApp
            </a>
          ) : (
            <button type="button" onClick={openPhonePrompt} disabled={loadingPhone}>
              {loadingPhone ? "Loading…" : "Open WhatsApp"}
            </button>
          )}
          <button type="button" onClick={onClose}>Close</button>
        </div>
      </section>
    </div>
  );
}
