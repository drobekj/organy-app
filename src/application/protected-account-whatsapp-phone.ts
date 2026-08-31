import type { Pool } from "pg";
import { ProtectedActorError, resolveProtectedUser } from "./protected-actor";

export class ProtectedWhatsAppPhoneError extends Error {
  constructor(readonly code: "invalidInput" | "unauthenticated" | "permissionDenied" | "notFound", message: string) {
    super(message);
    this.name = "ProtectedWhatsAppPhoneError";
  }
}

export type ProtectedWhatsAppPhoneSnapshot = { phoneE164: string | null };

export function normalizeWhatsAppPhone(value: unknown): string {
  if (typeof value !== "string") throw new ProtectedWhatsAppPhoneError("invalidInput", "Phone number is required.");
  const stripped = value.trim().replace(/[\s().-]/g, "");
  if (!stripped) throw new ProtectedWhatsAppPhoneError("invalidInput", "Phone number is required.");

  let normalized: string;
  if (stripped.startsWith("+")) normalized = stripped;
  else if (stripped.startsWith("00")) normalized = `+${stripped.slice(2)}`;
  else if (/^[0-9]{9}$/.test(stripped)) normalized = `+420${stripped}`;
  else if (/^[0-9]{10,15}$/.test(stripped)) normalized = `+${stripped}`;
  else throw new ProtectedWhatsAppPhoneError("invalidInput", "Use an international phone number such as +420 774 880 971. Czech 9-digit numbers are accepted too.");

  if (!/^\+[1-9][0-9]{7,14}$/.test(normalized)) {
    throw new ProtectedWhatsAppPhoneError("invalidInput", "Phone number must contain a valid international country code and 8 to 15 digits.");
  }
  return normalized;
}

export function buildWhatsAppUrlForPhone(baseUrl: string, phoneE164: string): string {
  const normalized = normalizeWhatsAppPhone(phoneE164);
  const url = new URL(baseUrl);
  if (url.protocol !== "https:" || url.hostname !== "wa.me") {
    throw new ProtectedWhatsAppPhoneError("invalidInput", "Only WhatsApp wa.me links can receive a protected Account phone number.");
  }
  url.pathname = `/${normalized.slice(1)}`;
  return url.toString();
}

export class PostgresProtectedWhatsAppPhoneService {
  constructor(private readonly pool: Pool) {}

  async getSelf(headers: Headers): Promise<ProtectedWhatsAppPhoneSnapshot> {
    const user = await this.requireOwner(headers);
    return this.getByAppUserId(user.id);
  }

  async setSelf(headers: Headers, phone: unknown): Promise<ProtectedWhatsAppPhoneSnapshot> {
    const user = await this.requireOwner(headers);
    const phoneE164 = normalizeWhatsAppPhone(phone);
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
