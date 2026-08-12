import { NextResponse } from "next/server";
import { toNextJsHandler } from "better-auth/next-js";
import { auth, authRuntimeConfigurationError } from "../../../../src/auth/server";

const handlers = toNextJsHandler(auth);
const unavailable = () => NextResponse.json({ error: { code: "internalError", message: authRuntimeConfigurationError() } }, { status: 500 });
export async function GET(request: Request) { return authRuntimeConfigurationError() ? unavailable() : handlers.GET(request); }
export async function POST(request: Request) { return authRuntimeConfigurationError() ? unavailable() : handlers.POST(request); }
