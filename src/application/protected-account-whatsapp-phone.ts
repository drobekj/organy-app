import type { Pool } from "pg";
import { normalizeWhatsAppPhone, WhatsAppPhoneValidationError } from "../planning-lifecycle/whatsapp-phone";
import { ProtectedActorError, resolveProtectedUser } from "./protected-actor";

export class ProtectedWhatsAppPhoneError extends Error {
  constructor(readonly code: "invalidInput" | "unauthenticated" | "permissionDenied" | "notFound", message: string) {
    super(message);
    this.name = "ProtectedWhatsAppPhoneError";
  }
}

export type ProtectedWhatsAppPhoneSnapshot = { phoneE164: string | null };

export class PostgresProtectedWhatsAppPhoneService {
  constructor(private readonly pool: Pool) {}

  async getSelf(headers: Headers): Promise<ProtectedWhatsAppPhoneSnapshot> {
    const user = await this.requireOwner(headers);
    return this.getByAppUserId(user.id);
  }

  async setSelf(headers: Headers, phone: unknown): Promise<ProtectedWhatsAppPhoneSnapshot> {
    const user = await this.requireOwner(headers);
    let phoneE164: string;
    try { phoneE164 = normalizeWhatsAppPhone(phone); }
    catch (error) {
      if (error instanceof WhatsAppPhoneValidationError) throw new ProtectedWhatsAppPhoneError("invalidInput", error.message);
      throw error;
    }
    const result = await this.pool.query(
      "update app_users set whatsapp_phone_e164 = $2, updated_at = now() where id = $1 returning whatsapp_phone_e164",
      [user.id, phoneE164],
    );
    if (!result.rows[0]) throw new ProtectedWhatsAppPhoneError("notFound", "Protected Account was not found.");
    return { phoneE164: String(result.rows[0].whatsapp_phone_e164) };
  }

  async removeSelf(headers: Headers): Promise<ProtectedWhatsAppPhoneSnapshot> {
    const user = await this.requireOwner(headers);
    return this.clear(user.id);
  }

  async removeAsAdmin(headers: Headers, appUserIdInput: unknown): Promise<{ appUserId: string; phoneE164: null }> {
    const admin = await this.resolve(headers);
    if (!admin.roles.includes("admin")) throw new ProtectedWhatsAppPhoneError("permissionDenied", "Admin role is required.");
    const appUserId = typeof appUserIdInput === "string" ? appUserIdInput.trim() : "";
    if (!appUserId) throw new ProtectedWhatsAppPhoneError("invalidInput", "Application user is required.");
    const result = await this.pool.query(
      "update app_users u set whatsapp_phone_e164 = null, updated_at = now() from protected_account_actor_links l where u.id = $1 and l.app_user_id = u.id returning u.id",
      [appUserId],
    );
    if (!result.rows[0]) throw new ProtectedWhatsAppPhoneError("notFound", "Protected Account was not found.");
    return { appUserId, phoneE164: null };
  }

  async getByAppUserId(appUserId: string): Promise<ProtectedWhatsAppPhoneSnapshot> {
    const result = await this.pool.query("select whatsapp_phone_e164 from app_users where id = $1", [appUserId]);
    if (!result.rows[0]) throw new ProtectedWhatsAppPhoneError("notFound", "Protected Account was not found.");
    return { phoneE164: result.rows[0].whatsapp_phone_e164 ? String(result.rows[0].whatsapp_phone_e164) : null };
  }

  private async clear(appUserId: string): Promise<ProtectedWhatsAppPhoneSnapshot> {
    const result = await this.pool.query(
      "update app_users set whatsapp_phone_e164 = null, updated_at = now() where id = $1 returning id",
      [appUserId],
    );
    if (!result.rows[0]) throw new ProtectedWhatsAppPhoneError("notFound", "Protected Account was not found.");
    return { phoneE164: null };
  }

  private async requireOwner(headers: Headers) {
    const user = await this.resolve(headers);
    if (!user.roles.some((role) => role === "admin" || role === "priest")) {
      throw new ProtectedWhatsAppPhoneError("permissionDenied", "WhatsApp phone setting is available only to priest and admin accounts.");
    }
    return user;
  }

  private async resolve(headers: Headers) {
    try {
      return await resolveProtectedUser(headers, this.pool);
    } catch (error) {
      if (error instanceof ProtectedActorError) {
        throw new ProtectedWhatsAppPhoneError(error.code === "unauthenticated" ? "unauthenticated" : "permissionDenied", error.message);
      }
      throw error;
    }
  }
}
