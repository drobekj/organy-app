import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

export function proxy(request: NextRequest) {
  if (process.env.ORGANY_EXPERIENCE !== "demo") return NextResponse.next();

  const destination = request.nextUrl.clone();
  destination.pathname = "/demo-congregation-preferences";
  return NextResponse.rewrite(destination);
}

export const config = {
  matcher: "/congregation-preferences",
};
