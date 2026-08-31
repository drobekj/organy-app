export class WhatsAppPhoneValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WhatsAppPhoneValidationError";
  }
}

export function normalizeWhatsAppPhone(value: unknown): string {
  if (typeof value !== "string") throw new WhatsAppPhoneValidationError("Phone number is required.");
  const stripped = value.trim().replace(/[\s().-]/g, "");
  if (!stripped) throw new WhatsAppPhoneValidationError("Phone number is required.");

  let normalized: string;
  if (stripped.startsWith("+")) normalized = stripped;
  else if (stripped.startsWith("00")) normalized = `+${stripped.slice(2)}`;
  else if (/^[0-9]{9}$/.test(stripped)) normalized = `+420${stripped}`;
  else if (/^[0-9]{10,15}$/.test(stripped)) normalized = `+${stripped}`;
  else throw new WhatsAppPhoneValidationError("Use an international phone number such as +420 777 123 456. Czech 9-digit numbers are accepted too.");

  if (!/^\+[1-9][0-9]{7,14}$/.test(normalized)) {
    throw new WhatsAppPhoneValidationError("Phone number must contain a valid international country code and 8 to 15 digits.");
  }
  return normalized;
}

export function buildWhatsAppUrlForPhone(baseUrl: string, phoneE164: string): string {
  const normalized = normalizeWhatsAppPhone(phoneE164);
  const url = new URL(baseUrl);
  if (url.protocol !== "https:" || url.hostname !== "wa.me") {
    throw new WhatsAppPhoneValidationError("Only WhatsApp wa.me links can receive a protected Account phone number.");
  }
  url.pathname = `/${normalized.slice(1)}`;
  return url.toString();
}
