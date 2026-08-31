import type { Pool } from "pg";
import type { PlanningRole } from "../planning-lifecycle";
import type { AppUser } from "./interaction-contracts";
import { appendAuditEvent, humanAuditActor } from "./audit-history";
import { canOwnWhatsAppPhone, normalizeWhatsAppPhone } from "./whatsapp-phone";

export type ProtectedWhatsAppPhoneSetting = {
  phoneE164: string | null;
  confirmedAt: string | null;
};

export class ProtectedWhatsAppPhoneError extends Error {
  constructor(readonly code: "invalidInput" | "permissionDenied" | "notFound", message: string) {
    super(message);
    this.name = "ProtectedWhatsAppPhoneError";
  }
}

export class PostgresProtectedWhatsAppPhoneService {
  constructor(private readonly pool: Pool) {}

  async get(user: AppUser): Promise<ProtectedWhatsAppPhoneSetting> {
    assertEligibleOwner(user);
    const result = await this.pool.query(
      `select whatsapp_phone_e164, whatsapp_phone_confirmed_at
         from protected_account_actor_links
        where app_user_id = $1`,
      [user.id],
    );
    if (!result.rows[0]) throw new ProtectedWhatsAppPhoneError("notFound", "Protected Account was not found.");
    return mapSetting(result.rows[0]);
  }

  async save(user: AppUser, requestedRole: PlanningRole, input: unknown): Promise<ProtectedWhatsAppPhoneSetting> {
    assertEligibleOwner(user);
    const role = resolvePhoneAuditRole(user, requestedRole);
    let phoneE164: string;
    try { phoneE164 = normalizeWhatsAppPhone(input); }
    catch (error) {
      throw new ProtectedWhatsAppPhoneError("invalidInput", error instanceof Error ? error.message : "Phone number is invalid.");
    }

    const client = await this.pool.connect();
    try {
      await client.query("begin");
      const current = await client.query(
        `select whatsapp_phone_e164, whatsapp_phone_confirmed_at
           from protected_account_actor_links
          where app_user_id = $1
          for update`,
        [user.id],
      );
      if (!current.rows[0]) throw new ProtectedWhatsAppPhoneError("notFound", "Protected Account was not found.");
      const before = mapSetting(current.rows[0]);
      const updated = await client.query(
        `update protected_account_actor_links
            set whatsapp_phone_e164 = $2, whatsapp_phone_confirmed_at = now()
          where app_user_id = $1
          returning whatsapp_phone_e164, whatsapp_phone_confirmed_at`,
        [user.id, phoneE164],
      );
      const after = mapSetting(updated.rows[0]);
      await appendAuditEvent(client, {
        actor: humanAuditActor({ userId: user.id, displayName: user.displayName, role, ...(user.personId ? { personId: user.personId } : {}) }),
        action: before.phoneE164 ? "account.whatsappPhone.update" : "account.whatsappPhone.save",
        objectKind: "protectedAccount",
        objectRef: user.id,
        beforeState: { configured: Boolean(before.phoneE164) },
        afterState: { configured: true },
      });
      await client.query("commit");
      return after;
    } catch (error) {
      await client.query("rollback").catch(() => undefined);
      if (error instanceof ProtectedWhatsAppPhoneError) throw error;
      throw new ProtectedWhatsAppPhoneError("invalidInput", "WhatsApp phone could not be saved.");
    } finally { client.release(); }
  }

  async forget(user: AppUser, requestedRole: PlanningRole): Promise<ProtectedWhatsAppPhoneSetting> {
    assertEligibleOwner(user);
    const role = resolvePhoneAuditRole(user, requestedRole);
    const client = await this.pool.connect();
    try {
      await client.query("begin");
      const current = await client.query(
        `select whatsapp_phone_e164, whatsapp_phone_confirmed_at
           from protected_account_actor_links
          where app_user_id = $1
          for update`,
        [user.id],
      );
      if (!current.rows[0]) throw new ProtectedWhatsAppPhoneError("notFound", "Protected Account was not found.");
      const before = mapSetting(current.rows[0]);
      if (before.phoneE164) {
        await client.query(
          `update protected_account_actor_links
              set whatsapp_phone_e164 = null, whatsapp_phone_confirmed_at = null
            where app_user_id = $1`,
          [user.id],
        );
        await appendAuditEvent(client, {
          actor: humanAuditActor({ userId: user.id, displayName: user.displayName, role, ...(user.personId ? { personId: user.personId } : {}) }),
          action: "account.whatsappPhone.forget",
          objectKind: "protectedAccount",
          objectRef: user.id,
          beforeState: { configured: true },
          afterState: { configured: false },
        });
      }
      await client.query("commit");
      return { phoneE164: null, confirmedAt: null };
    } catch (error) {
      await client.query("rollback").catch(() => undefined);
      if (error instanceof ProtectedWhatsAppPhoneError) throw error;
      throw new ProtectedWhatsAppPhoneError("invalidInput", "WhatsApp phone could not be forgotten.");
    } finally { client.release(); }
  }
}

export function resolvePhoneAuditRole(user: AppUser, requestedRole: PlanningRole): "priest" | "admin" {
  if ((requestedRole === "priest" || requestedRole === "admin") && user.roles.includes(requestedRole)) return requestedRole;
  if (user.roles.includes("priest")) return "priest";
  if (user.roles.includes("admin")) return "admin";
  throw new ProtectedWhatsAppPhoneError("permissionDenied", "Only priest or admin protected Accounts can use WhatsApp phone settings.");
}

function assertEligibleOwner(user: AppUser) {
  if (!canOwnWhatsAppPhone(user.roles)) {
    throw new ProtectedWhatsAppPhoneError("permissionDenied", "Only priest or admin protected Accounts can use WhatsApp phone settings.");
  }
}

function mapSetting(row: Record<string, unknown>): ProtectedWhatsAppPhoneSetting {
  return {
    phoneE164: row.whatsapp_phone_e164 ? String(row.whatsapp_phone_e164) : null,
    confirmedAt: row.whatsapp_phone_confirmed_at
      ? new Date(String(row.whatsapp_phone_confirmed_at)).toISOString()
      : null,
  };
}
