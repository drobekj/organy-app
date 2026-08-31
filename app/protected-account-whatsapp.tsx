"use client";

import { FormEvent, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { buildWhatsAppUrlForPhone, normalizeWhatsAppPhone } from "../src/planning-lifecycle/whatsapp-phone";

type Props = { initialPhoneE164: string | null; roles: string[] };
type DialogMode = "firstUse" | "setting" | null;

export function ProtectedAccountWhatsApp({ initialPhoneE164, roles }: Props) {
  const eligible = roles.includes("priest") || roles.includes("admin");
  const [phoneE164, setPhoneE164] = useState<string | null>(initialPhoneE164);
  const [menuTarget, setMenuTarget] = useState<HTMLElement | null>(null);
  const [dialogMode, setDialogMode] = useState<DialogMode>(null);
  const [phoneInput, setPhoneInput] = useState(initialPhoneE164 ?? "");
  const [pendingWhatsAppUrl, setPendingWhatsAppUrl] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    if (!eligible) return;
    let activeSlot: HTMLElement | null = null;

    function ensureMenuSlot() {
      if (!phoneE164) {
        document.querySelectorAll<HTMLElement>("[data-whatsapp-phone-slot]").forEach((slot) => slot.remove());
        activeSlot = null;
        setMenuTarget(null);
        return;
      }
      const popovers = Array.from(document.querySelectorAll<HTMLElement>(".workspace-account-popover"));
      const popover = popovers.find((candidate) => Array.from(candidate.querySelectorAll("button")).some((button) => button.textContent?.trim() === "Change Password"));
      if (!popover) return;
      const changePassword = Array.from(popover.querySelectorAll<HTMLButtonElement>("button")).find((button) => button.textContent?.trim() === "Change Password");
      if (!changePassword) return;
      let slot = popover.querySelector<HTMLElement>("[data-whatsapp-phone-slot]");
      if (!slot) {
        slot = document.createElement("span");
        slot.dataset.whatsappPhoneSlot = "true";
        slot.style.display = "contents";
        changePassword.before(slot);
      }
      if (slot !== activeSlot) {
        activeSlot = slot;
        setMenuTarget(slot);
      }
    }

    ensureMenuSlot();
    const observer = new MutationObserver(ensureMenuSlot);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => {
      observer.disconnect();
      activeSlot?.remove();
      document.querySelectorAll<HTMLElement>("[data-whatsapp-phone-slot]").forEach((slot) => slot.remove());
    };
  }, [eligible, phoneE164]);

  useEffect(() => {
    if (!eligible) return;
    function interceptWhatsApp(event: MouseEvent) {
      const target = event.target instanceof Element ? event.target : null;
      const link = target?.closest<HTMLAnchorElement>('.post-finalize-dialog a[href^="https://wa.me/"]');
      if (!link) return;
      event.preventDefault();
      const baseUrl = link.href;
      if (phoneE164) {
        window.open(buildWhatsAppUrlForPhone(baseUrl, phoneE164), "_blank", "noopener,noreferrer");
        return;
      }
      setPendingWhatsAppUrl(baseUrl);
      setPhoneInput("");
      setFeedback(null);
      setDialogMode("firstUse");
    }
    document.addEventListener("click", interceptWhatsApp, true);
    return () => document.removeEventListener("click", interceptWhatsApp, true);
  }, [eligible, phoneE164]);

  function openSetting() {
    setPhoneInput(phoneE164 ?? "");
    setFeedback(null);
    setDialogMode("setting");
  }

  function closeDialog() {
    if (pending) return;
    setDialogMode(null);
    setPendingWhatsAppUrl(null);
    setFeedback(null);
  }

  function validatedPhone(): string | null {
    try {
      const normalized = normalizeWhatsAppPhone(phoneInput);
      setFeedback(null);
      return normalized;
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "Phone number is invalid.");
      return null;
    }
  }

  function openOnce() {
    const normalized = validatedPhone();
    if (!normalized || !pendingWhatsAppUrl) return;
    window.open(buildWhatsAppUrlForPhone(pendingWhatsAppUrl, normalized), "_blank", "noopener,noreferrer");
    setDialogMode(null);
    setPendingWhatsAppUrl(null);
  }

  async function savePhone(): Promise<string | null> {
    const normalized = validatedPhone();
    if (!normalized) return null;
    setPending(true);
    try {
      const response = await fetch("/api/protected-account-whatsapp-phone", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ phone: normalized }),
      });
      const body = await response.json().catch(() => ({})) as { phoneE164?: string; error?: { message?: string } };
      if (!response.ok || !body.phoneE164) {
        setFeedback(body.error?.message ?? "Phone number could not be saved.");
        return null;
      }
      setPhoneE164(body.phoneE164);
      setPhoneInput(body.phoneE164);
      return body.phoneE164;
    } catch {
      setFeedback("Phone number could not be saved.");
      return null;
    } finally {
      setPending(false);
    }
  }

  async function saveAndOpen() {
    if (!pendingWhatsAppUrl) return;
    const popup = window.open("about:blank", "_blank");
    const normalized = await savePhone();
    if (!normalized) {
      popup?.close();
      return;
    }
    const target = buildWhatsAppUrlForPhone(pendingWhatsAppUrl, normalized);
    if (popup) popup.location.href = target;
    else window.location.assign(target);
    setDialogMode(null);
    setPendingWhatsAppUrl(null);
  }

  async function saveSetting(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalized = await savePhone();
    if (normalized) {
      setDialogMode(null);
      setFeedback(null);
    }
  }

  async function forgetPhone() {
    if (pending) return;
    setPending(true);
    setFeedback(null);
    try {
      const response = await fetch("/api/protected-account-whatsapp-phone", { method: "DELETE" });
      const body = await response.json().catch(() => ({})) as { error?: { message?: string } };
      if (!response.ok) {
        setFeedback(body.error?.message ?? "Phone number could not be removed.");
        return;
      }
      setPhoneE164(null);
      setPhoneInput("");
      setDialogMode(null);
    } catch {
      setFeedback("Phone number could not be removed.");
    } finally {
      setPending(false);
    }
  }

  if (!eligible) return null;

  return (
    <>
      {menuTarget && phoneE164 && createPortal(
        <button type="button" onClick={openSetting}>Phone setting</button>,
        menuTarget,
      )}

      {dialogMode && (
        <div className="post-finalize-dialog-backdrop" role="presentation">
          <section className="post-finalize-dialog" role="dialog" aria-modal="true" aria-labelledby="whatsapp-phone-dialog-title">
            <h2 id="whatsapp-phone-dialog-title">{dialogMode === "firstUse" ? "WhatsApp phone" : "Phone setting"}</h2>
            {dialogMode === "firstUse" ? (
              <p>This phone number will be used to open WhatsApp with the prepared finalized-plan message. You can use it once, or save it to your protected Account so future WhatsApp handoffs open automatically without this step.</p>
            ) : (
              <p>This number is stored on your protected Account because you previously allowed automatic use for finalized-plan WhatsApp handoffs.</p>
            )}
            <label>
              Phone number
              <input
                type="tel"
                autoComplete="tel"
                value={phoneInput}
                onChange={(event) => { setPhoneInput(event.target.value); setFeedback(null); }}
                placeholder="+420 777 123 456"
                disabled={pending}
              />
            </label>
            <p className="field-help">Use an international number with country code. A Czech 9-digit number is automatically stored as +420.</p>
            {feedback && <p className="auth-error" role="alert">{feedback}</p>}
            <div className="post-finalize-dialog-actions">
              {dialogMode === "firstUse" ? (
                <>
                  <button type="button" onClick={openOnce} disabled={pending}>Open once</button>
                  <button type="button" onClick={() => void saveAndOpen()} disabled={pending}>{pending ? "Saving…" : "Save & Open WhatsApp"}</button>
                </>
              ) : (
                <>
                  <form onSubmit={saveSetting} style={{ display: "contents" }}>
                    <button type="submit" disabled={pending}>{pending ? "Saving…" : "Save phone"}</button>
                  </form>
                  <button type="button" onClick={() => void forgetPhone()} disabled={pending}>Forget phone</button>
                </>
              )}
              <button type="button" onClick={closeDialog} disabled={pending}>Cancel</button>
            </div>
          </section>
        </div>
      )}
    </>
  );
}
