import { NextResponse } from "next/server";

/** Liveness only, for the host's "is it up" check. Deliberately touches no data and reveals nothing. */
export function GET() {
  return NextResponse.json({ ok: true });
}
