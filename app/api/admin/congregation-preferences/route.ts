import { NextRequest, NextResponse } from "next/server";
import { authPool } from "../../../../src/auth/server";
import {
  CongregationPreferenceAdminError,
  PostgresCongregationPreferenceAdminService,
  type CongregationPreferenceAdminLanguage,
} from "../../../../src/application/congregation-preference-admin";

export async function POST(request: NextRequest) {
  if (process.env.ORGANY_RUNTIME !== "db") {
    return problem("Congregation preference administration is available only in DB runtime.", 400);
  }

  const service = new PostgresCongregationPreferenceAdminService(authPool);
  const isForm = request.headers.get("content-type")?.includes("application/x-www-form-urlencoded")
    || request.headers.get("content-type")?.includes("multipart/form-data");

  let language: CongregationPreferenceAdminLanguage = "czech";
  try {
    if (!isForm) {
      return problem("Form data is required.", 400);
    }

    const form = await request.formData();
    const action = String(form.get("action") ?? "");
    language = normalizeLanguage(form.get("language"));
    const target = new URL("/admin/preferences", request.url);
    target.searchParams.set("language", language);

    if (action === "setScore") {
      const profileId = String(form.get("profileId") ?? "");
      const referenceSongId = String(form.get("referenceSongId") ?? "");
      const score = Number(form.get("score"));
      const result = await service.setPreferenceScore(request.headers, { profileId, referenceSongId, score });
      target.searchParams.set("message", `Preference for ${result.nickname} set to ${result.score}.`);
      if (result.score === 0 && result.beforeScore === 1) {
        target.searchParams.set("undoProfileId", result.profileId);
        target.searchParams.set("undoSongId", result.referenceSongId);
      }
      return NextResponse.redirect(target, 303);
    }

    if (action === "removePreference") {
      const result = await service.removePreference(request.headers, {
        profileId: form.get("profileId"),
        referenceSongId: form.get("referenceSongId"),
      });
      target.searchParams.set("message", `Preference removed for ${result.nickname}.`);
      return NextResponse.redirect(target, 303);
    }

    if (action === "deleteNickname") {
      const result = await service.deleteNickname(request.headers, { userId: form.get("userId") });
      target.searchParams.set("message", `Nickname ${result.nickname} deleted with ${result.preferenceCount} preference(s).`);
      return NextResponse.redirect(target, 303);
    }

    return problem("Unsupported congregation preference administration action.", 400);
  } catch (error) {
    const target = new URL("/admin/preferences", request.url);
    target.searchParams.set("language", language);
    target.searchParams.set("error", errorMessage(error));
    return NextResponse.redirect(target, 303);
  }
}

function normalizeLanguage(value: FormDataEntryValue | null): CongregationPreferenceAdminLanguage {
  const language = String(value ?? "czech");
  if (language !== "czech" && language !== "polish") {
    throw new CongregationPreferenceAdminError("invalidInput", "Language must be czech or polish.");
  }
  return language;
}

function errorMessage(error: unknown) {
  if (error instanceof CongregationPreferenceAdminError) return error.message;
  return error instanceof Error ? error.message : "Congregation preference administration failed.";
}

function problem(message: string, status: number) {
  return NextResponse.json({ error: { message } }, { status });
}
