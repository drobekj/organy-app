import { NextRequest, NextResponse } from "next/server";
import { getAppDbPool } from "../../../src/db/app-pool";
import { CongregationVoterError, PostgresCongregationPreferenceService } from "../../../src/application/congregation-preference-voter";

const congregationVoterCookie = "organy_congregation_voter";
type FormAction = "enterNickname" | "saveOwnPreference" | "clearNickname";

export async function POST(request: NextRequest) {
  if (process.env.ORGANY_RUNTIME !== "db") return problem("Congregation preference DB runtime is not enabled.", 400);
  if (!process.env.DATABASE_URL) return problem("DATABASE_URL is required for congregation preferences.", 500);

  const form = await request.formData().catch(() => undefined);
  if (!form) return problem("Form data is required.", 400);
  const action = String(form.get("action") ?? "") as FormAction;

  if (action === "clearNickname") {
    const response = NextResponse.redirect(new URL("/congregation-preferences", request.url), 303);
    response.cookies.delete(congregationVoterCookie);
    return response;
  }

  const pool = getAppDbPool();
  try {
    const service = new PostgresCongregationPreferenceService(pool);
    if (action === "enterNickname") {
      const session = await service.enterNickname(form.get("nickname"));
      const response = NextResponse.redirect(new URL("/congregation-preferences", request.url), 303);
      response.cookies.set(congregationVoterCookie, session.token, {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        path: "/",
      });
      return response;
    }

    if (action === "saveOwnPreference") {
      const scoreText = String(form.get("score") ?? "");
      const score = scoreText === "0" ? 0 : scoreText === "1" ? 1 : Number.NaN;
      const songId = String(form.get("referenceSongId") ?? "");
      await service.saveOwnReferencePreference(request.cookies.get(congregationVoterCookie)?.value, songId, score);
      const target = new URL("/congregation-preferences", request.url);
      target.searchParams.set("song", songId);
      target.searchParams.set("saved", "1");
      return NextResponse.redirect(target, 303);
    }

    return problem("Unsupported congregation preference action.", 400);
  } catch (error) {
    if (error instanceof CongregationVoterError) {
      const status = error.code === "invalidInput" ? 400 : error.code === "unauthenticated" ? 401 : error.code === "notFound" ? 404 : 403;
      return problem(error.message, status);
    }
    return problem(error instanceof Error ? error.message : "Congregation preference request failed.", 500);
  }
}

function problem(message: string, status: number) {
  return NextResponse.json({ error: { message } }, { status });
}
