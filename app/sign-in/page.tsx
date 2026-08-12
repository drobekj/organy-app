import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { ProtectedSignInForm } from "./protected-sign-in-form";
import { ProtectedActorError, resolveProtectedUser } from "../../src/application/protected-actor";
import { authPool } from "../../src/auth/server";

export default async function SignInPage() {
  if (process.env.ORGANY_RUNTIME !== "db") redirect("/");
  if (!process.env.BETTER_AUTH_SECRET) {
    return <main className="auth-shell"><div className="auth-card"><h1>Authentication is not configured</h1><p>BETTER_AUTH_SECRET is required for DB runtime.</p></div></main>;
  }

  try {
    await resolveProtectedUser(await headers(), authPool);
    redirect("/");
  } catch (error) {
    if (error instanceof ProtectedActorError && error.code === "unauthenticated") return <ProtectedSignInForm />;
    if (error instanceof ProtectedActorError) {
      return <main className="auth-shell"><div className="auth-card"><h1>Account unavailable</h1><p>{error.message}</p></div></main>;
    }
    throw error;
  }
}
