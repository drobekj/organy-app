import { NextRequest, NextResponse } from "next/server";
import { getAppDbPool } from "../../../../src/db/app-pool";
import { CongregationVoterError } from "../../../../src/application/congregation-preference-voter";
import { createRuntimeCongregationPreferenceService } from "../../../../src/application/congregation-voter-runtime";

const congregationVoterCookie = "organy_congregation_voter";

export async function GET(request: NextRequest) {
  if (process.env.ORGANY_RUNTIME !== "db" || !process.env.DATABASE_URL) return redirectNotice(request, "requestFailed");
  try {
    const result = await createRuntimeCongregationPreferenceService(getAppDbPool()).confirmRegistration(
      request.nextUrl.searchParams.get("token"),
      { ipAddress: request.headers.get("x-vercel-forwarded-for") ?? request.headers.get("x-forwarded-for") ?? undefined },
    );
    if (result.kind === "confirmed") {
      const response = NextResponse.redirect(new URL("/congregation-preferences", request.url), 303);
      response.cookies.set(congregationVoterCookie, result.session.token, {
        httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/",
      });
      return response;
    }
    if (result.kind === "expired") return redirectNotice(request, "confirmationExpired", { nickname: result.nickname });
    return redirectNotice(request, result.kind === "alreadyConfirmed" ? "alreadyConfirmed" : "confirmationInvalid");
  } catch (error) {
    if (error instanceof CongregationVoterError) {
      const notice = error.code === "rateLimited" ? "rateLimited" : error.code === "quotaReached" ? "quotaReached" : error.code === "frozen" ? "registrationFrozen" : "requestFailed";
      return redirectNotice(request, notice);
    }
    return redirectNotice(request, "requestFailed");
  }
}

function redirectNotice(request: NextRequest, notice: string, params?: Record<string, string>) {
  const target = new URL("/congregation-preferences", request.url);
  target.searchParams.set("entry", "1");
  target.searchParams.set("notice", notice);
  for (const [key, value] of Object.entries(params ?? {})) target.searchParams.set(key, value);
  return NextResponse.redirect(target, 303);
}
