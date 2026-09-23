import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { AuthError } from "./auth/errors";
import { PermissionDeniedError } from "./permissions";

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
  if (err instanceof AuthError) {
    return NextResponse.json(
      { error: err.message, name: err.name },
      { status: err.status },
    );
  }
  console.error(err);
  return NextResponse.json({ error: "Unexpected error." }, { status: 500 });
}
