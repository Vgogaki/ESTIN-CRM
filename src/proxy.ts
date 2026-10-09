import { NextResponse, type NextRequest } from "next/server";
import { gateDecision } from "./server/review-gate";

/** Runs before every request. A no-op unless REVIEW_GATE=on — see src/server/review-gate.ts. */
export function proxy(request: NextRequest) {
  const decision = gateDecision({
    enabled: process.env.REVIEW_GATE === "on",
    user: process.env.REVIEW_GATE_USER,
    pass: process.env.REVIEW_GATE_PASSWORD,
    header: request.headers.get("authorization"),
    pathname: request.nextUrl.pathname,
  });

  if (decision === "allow") return NextResponse.next();
  if (decision === "misconfigured") {
    return new NextResponse("This site is not configured correctly.", { status: 503 });
  }
  return new NextResponse("Authentication required.", {
    status: 401,
    headers: { "WWW-Authenticate": 'Basic realm="ESTIN review", charset="UTF-8"' },
  });
}

// Every path, including API routes and static files: nothing is reachable without the gate.
export const config = { matcher: "/:path*" };
