import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { AuthError } from "./auth/errors";
import { PermissionDeniedError } from "./permissions";
import { ValidationError } from "./errors";

export function errorResponse(err: unknown) {
  if (err instanceof ZodError) {
    return NextResponse.json(
      { error: "Invalid request.", issues: err.issues },
      { status: 400 },
    );
  }
  if (err instanceof PermissionDeniedError) {
    return NextResponse.json({ error: err.message }, { status: 403 });
  }
  if (err instanceof ValidationError) {
    // A refused trade carries a stable `code` the screen can act on (e.g. "market_closed").
    const code = (err as { code?: unknown }).code;
    return NextResponse.json({ error: err.message, ...(typeof code === "string" ? { code } : {}) }, { status: err.status });
  }
  if (err instanceof AuthError) {
    return NextResponse.json(
      { error: err.message, name: err.name },
      { status: err.status },
    );
  }
  console.error(err);
  return NextResponse.json({ error: "Unexpected error." }, { status: 500 });
}
