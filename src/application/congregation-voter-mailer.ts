export type CongregationConfirmationMessage = {
  to: string;
  nickname: string;
  email: string;
  confirmationUrl: string;
  deliveryId: string;
};

export type CongregationRecoveryMessage = {
  to: string;
  nickname: string;
  deliveryId: string;
};

export interface CongregationVoterMailer {
  sendConfirmation(message: CongregationConfirmationMessage): Promise<void>;
  sendNicknameRecovery(message: CongregationRecoveryMessage): Promise<void>;
}

export class ResendCongregationVoterMailer implements CongregationVoterMailer {
  constructor(
    private readonly apiKey: string,
    private readonly from: string,
    private readonly fetcher: typeof fetch = fetch,
  ) {}

  async sendConfirmation(message: CongregationConfirmationMessage): Promise<void> {
    const nickname = escapeHtml(message.nickname);
    const email = escapeHtml(message.email);
    const confirmationUrl = escapeHtml(message.confirmationUrl);
    await this.send({
      to: message.to,
      subject: "Confirm your Congregation Preferences registration",
      text: `Nickname: ${message.nickname}\nEmail: ${message.email}\n\nConfirm registration: ${message.confirmationUrl}\n\nThis link expires in 24 hours.`,
      html: `<p>Nickname: <strong>${nickname}</strong></p><p>Email: <strong>${email}</strong></p><p><a href="${confirmationUrl}">Confirm registration</a></p><p>This link expires in 24 hours.</p>`,
      deliveryId: message.deliveryId,
    });
  }

  async sendNicknameRecovery(message: CongregationRecoveryMessage): Promise<void> {
    const nickname = escapeHtml(message.nickname);
    await this.send({
      to: message.to,
      subject: "Your Congregation Preferences nickname",
      text: `Your Congregation Preferences nickname is: ${message.nickname}`,
      html: `<p>Your Congregation Preferences nickname is: <strong>${nickname}</strong></p>`,
      deliveryId: message.deliveryId,
    });
  }

  private async send(input: { to: string; subject: string; text: string; html: string; deliveryId: string }): Promise<void> {
    const response = await this.fetcher("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        authorization: `Bearer ${this.apiKey}`,
        "content-type": "application/json",
        "idempotency-key": input.deliveryId,
      },
      body: JSON.stringify({
        from: this.from,
        to: [input.to],
        subject: input.subject,
        text: input.text,
        html: input.html,
      }),
    });
    if (!response.ok) {
      throw new Error(`Transactional email provider rejected the request (${response.status}).`);
    }
  }
}

export function confirmationUrl(baseUrl: string, token: string): string {
  const target = new URL("/api/congregation-preferences/confirm", requireCanonicalBaseUrl(baseUrl));
  target.searchParams.set("token", token);
  return target.toString();
}

export function requireCanonicalBaseUrl(value: string): URL {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error("CONGREGATION_BASE_URL must be a valid absolute URL.");
  }
  const loopback = ["localhost", "127.0.0.1", "::1"].includes(url.hostname.replace(/^\[|\]$/g, "").toLowerCase());
  if (url.protocol !== "https:" && !(url.protocol === "http:" && loopback)) {
    throw new Error("CONGREGATION_BASE_URL must use HTTPS except for loopback acceptance.");
  }
  url.pathname = "/";
  url.search = "";
  url.hash = "";
  return url;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>'"]/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "'": "&#39;",
    '"': "&quot;",
  })[character] ?? character);
}
