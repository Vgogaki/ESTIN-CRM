import { AuthError } from "@/server/auth/errors";

/**
 * No real API-key management screen exists yet (spec §5.7, not built).
 * Until then the server-to-server endpoints are gated on a single shared
 * secret from the environment — good enough for a checkout integration
 * that also doesn't exist yet, but not what should still be here once real
 * integrations are being provisioned individually.
 */
export function checkApiKey(request: Request) {
  const configured = process.env.ORDERS_API_KEY;
  if (!configured) {
    throw new AuthError(
      "Orders API is not configured (ORDERS_API_KEY unset). Set it before enabling checkout.",
      503,
    );
  }
  const provided = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (provided !== configured) {
    throw new AuthError("Invalid or missing API key.", 401);
  }
}
