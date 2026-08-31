export const WHATSAPP_PHONE_CHANGED_EVENT = "organy-whatsapp-phone-changed";

export class WhatsAppPhoneValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WhatsAppPhoneValidationError";
  }
}

export function normalizeWhatsAppPhone(value: unknown): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new WhatsAppPhoneValidationError("Phone number is required.");
  }

  const compact = value.trim().replace(/[\s().-]/g, "");
  let international: string;
  if (compact.startsWith("+")) international = compact;
  else if (compact.startsWith("00")) international = `+${compact.slice(2)}`;
  else if (/^\d{9}$/.test(compact)) international = `+420${compact}`;
  else throw new WhatsAppPhoneValidationError("Use an international number beginning with +, or a 9-digit Czech number.");

  if (!/^\+[1-9]\d{7,14}$/.test(international)) {
    throw new WhatsAppPhoneValidationError("Phone number must be a valid international number.");
  }
  return international;
}

export function whatsAppPhoneDigits(phoneE164: string): string {
  return normalizeWhatsAppPhone(phoneE164).slice(1);
}

export function canOwnWhatsAppPhone(roles: readonly string[]): boolean {
  return roles.includes("priest") || roles.includes("admin");
}
