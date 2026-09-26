import { NextResponse } from "next/server";
import { z } from "zod";
import { getAction } from "@/server/countries";
import { checkApiKey } from "@/server/auth/api-key";
import { errorResponse } from "@/server/http";

const schema = z.object({
  country: z.string().length(2),
  stage: z.enum(["registration", "purchase", "trading", "payout"]).default("purchase"),
});

/**
 * For checkout to ask BEFORE taking payment. POST /api/v1/orders refuses a
 * blocked country too, but by then the money has moved.
 */
export async function GET(request: Request) {
  try {
    checkApiKey(request);
    const url = new URL(request.url);
    const { country, stage } = schema.parse({
      country: url.searchParams.get("country"),
      stage: url.searchParams.get("stage") ?? undefined,
    });
    return NextResponse.json({ country: country.toUpperCase(), stage, action: await getAction(country, stage) });
  } catch (err) {
    return errorResponse(err);
  }
}
