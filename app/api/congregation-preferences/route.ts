import { NextRequest, NextResponse } from "next/server";
import { getAppDbPool } from "../../../src/db/app-pool";
import { CongregationVoterError, PostgresCongregationPreferenceService } from "../../../src/application/congregation-preference-voter";
import { createRuntimeCongregationPreferenceService } from "../../../src/application/congregation-voter-runtime";

const congregationVoterCookie = "organy_congregation_voter";
type FormAction = "signIn" | "register" | "resendConfirmation" | "recoverNickname" | "saveOwnPreference" | "clearNickname";

export async function POST(request: NextRequest) {
  if (process.env.ORGANY_RUNTIME !== "db") return problem("Congregation preference DB runtime is not enabled.", 400);
  if (!process.env.DATABASE_URL) return problem("DATABASE_URL is required for congregation preferences.", 500);
  const pool = getAppDbPool();
  const preferenceService = new PostgresCongregationPreferenceService(pool);
  const contentType = request.headers.get("content-type") ?? "";

  if (contentType.includes("application/json")) {
    try {
      const body = await request.json() as { action?: unknown; referenceSongId?: unknown; score?: unknown };
      if (body.action !== "saveOwnPreference") return problem("Unsupported congregation preference action.", 400);
      const preference = await preferenceService.saveOwnReferencePreference(
        request.cookies.get(congregationVoterCookie)?.value,
        body.referenceSongId,
        body.score,
      );
      return NextResponse.json({ preference: { referenceSongId: preference.referenceSongId, score: preference.score } });
    } catch (error) {
      return serviceProblem(error);
    }
  }

  const form = await request.formData().catch(() => undefined);
  if (!form) return problem("Form data is required.", 400);
  const action = String(form.get("action") ?? "") as FormAction;
  if (action === "clearNickname") {
    await preferenceService.clearSession(request.cookies.get(congregationVoterCookie)?.value);
    const response = entryRedirect(request);
    response.cookies.delete(congregationVoterCookie);
    return response;
  }

  try {
    if (action === "signIn") {
      const result = await preferenceService.signIn(form.get("nickname"));
      if (result.kind === "signedIn") return signedInRedirect(request, result.session.token);
      return noticeRedirect(request, result.kind === "pending" ? "pending" : "missingNickname", {
        nickname: result.nickname,
      });
    }

    const registrationService = createRuntimeCongregationPreferenceService(pool);
    const requestContext = {
      ipAddress: clientIp(request),
      currentSessionToken: request.cookies.get(congregationVoterCookie)?.value,
    };

    if (action === "register") {
      const result = await registrationService.requestRegistration(form.get("nickname"), form.get("email"), requestContext);
      if (result.kind === "created" || result.kind === "legacyClaimCreated") return noticeRedirect(request, "registrationCreated");
      if (result.kind === "alreadyRegistered") return noticeRedirect(request, "alreadyRegistered");
      if (result.kind === "reservedNickname") return noticeRedirect(request, "reservedNickname", { view: "register" });
      if (result.kind === "registeredEmail") return noticeRedirect(request, "registeredEmail", { view: "register" });
      if (result.kind === "awaitingConfirmation") return noticeRedirect(request, "awaitingConfirmation", { nickname: result.nickname });
      return noticeRedirect(request, "requestFailed");
    }

    if (action === "resendConfirmation") {
      const nickname = String(form.get("nickname") ?? "");
      const result = await registrationService.resendConfirmation(nickname, requestContext);
      if (result.kind === "sent") return noticeRedirect(request, "confirmationResent");
      if (result.kind === "alreadyConfirmed") return noticeRedirect(request, "alreadyConfirmed");
      return noticeRedirect(request, "confirmationMissing", { nickname });
    }

    if (action === "recoverNickname") {
      const result = await registrationService.recoverNickname(form.get("email"), requestContext);
      return noticeRedirect(request, result.kind === "sent" ? "recoverySent" : "recoveryMissing", { view: "recover" });
    }

    if (action === "saveOwnPreference") {
      const scoreText = String(form.get("score") ?? "");
      const score = scoreText === "0" ? 0 : scoreText === "1" ? 1 : Number.NaN;
      const songId = String(form.get("referenceSongId") ?? "");
      await preferenceService.saveOwnReferencePreference(request.cookies.get(congregationVoterCookie)?.value, songId, score);
      const target = new URL("/congregation-preferences", request.url);
      target.searchParams.set("song", songId);
      target.searchParams.set("saved", "1");
      return NextResponse.redirect(target, 303);
    }
    return problem("Unsupported congregation preference action.", 400);
  } catch (error) {
    if (error instanceof CongregationVoterError) {
      const view = action === "recoverNickname" ? "recover" : action === "register" ? "register" : undefined;
      return noticeRedirect(request, noticeForError(error), view ? { view } : undefined);
    }
    return serviceProblem(error);
  }
}

function signedInRedirect(request: NextRequest, token: string) {
  const response = NextResponse.redirect(new URL("/congregation-preferences", request.url), 303);
  response.cookies.set(congregationVoterCookie, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
  });
  return response;
}

function entryRedirect(request: NextRequest) {
  return NextResponse.redirect(new URL("/congregation-preferences?entry=1", request.url), 303);
}

function noticeRedirect(request: NextRequest, notice: string, params?: Record<string, string>) {
  const target = new URL("/congregation-preferences", request.url);
  target.searchParams.set("entry", "1");
  target.searchParams.set("notice", notice);
  for (const [key, value] of Object.entries(params ?? {})) target.searchParams.set(key, value);
  return NextResponse.redirect(target, 303);
}

function noticeForError(error: CongregationVoterError): string {
  if (error.code === "invalidInput" && error.message === "Enter a valid email address.") return "invalidEmail";
  if (error.code === "invalidInput") return "invalidNickname";
  if (error.code === "rateLimited") return "rateLimited";
  if (error.code === "frozen") return "registrationFrozen";
  if (error.code === "quotaReached") return "quotaReached";
  if (error.code === "mailUnavailable") return "mailUnavailable";
  return "requestFailed";
}

function clientIp(request: NextRequest): string | undefined {
  return request.headers.get("x-vercel-forwarded-for") ?? request.headers.get("x-forwarded-for") ?? undefined;
}

function serviceProblem(error: unknown) {
  if (error instanceof CongregationVoterError) {
    const status = error.code === "invalidInput" ? 400 : error.code === "unauthenticated" ? 401 : error.code === "notFound" ? 404 : error.code === "rateLimited" ? 429 : 403;
    return problem(error.message, status);
  }
  return problem("Congregation preference request failed.", 500);
}

function problem(message: string, status: number) {
  return NextResponse.json({ error: { message } }, { status });
}
