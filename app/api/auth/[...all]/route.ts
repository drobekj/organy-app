import { toNextJsHandler } from "better-auth/next-js";
import { assertProtectedAuthConfigured, auth } from "../../../../src/auth/server";

const handler = toNextJsHandler(auth);

export async function GET(request: Request) {
  assertProtectedAuthConfigured();
  return handler.GET(request);
}

export async function POST(request: Request) {
  assertProtectedAuthConfigured();
  return handler.POST(request);
}
