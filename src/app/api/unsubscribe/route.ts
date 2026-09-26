import { setMarketingConsent, verifyUnsubscribeToken } from "@/server/email/outbox";
import { requestIp } from "@/server/auth/guard";

/** One-click unsubscribe from the link in every marketing email. Signed, so it works without logging in. */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const personId = url.searchParams.get("p") ?? "";
  const token = url.searchParams.get("t") ?? "";
  if (!personId || !token || !verifyUnsubscribeToken(personId, token)) {
    return new Response("This unsubscribe link is not valid.", { status: 400 });
  }
  await setMarketingConsent(personId, false, { type: "system" }, await requestIp());
  return new Response(
    "<!doctype html><meta charset=utf-8><title>Unsubscribed</title><body style=\"font-family:sans-serif;max-width:32rem;margin:4rem auto\"><h1>You're unsubscribed</h1><p>You will no longer receive offers or promotions from ESTIN. Account and security emails will still be sent.</p></body>",
    { headers: { "Content-Type": "text/html; charset=utf-8" } },
  );
}
