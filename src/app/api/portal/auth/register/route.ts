import { NextResponse } from "next/server";
import { z } from "zod";
import { registerTrader } from "@/server/auth/trader";
import { requestIp } from "@/server/auth/guard";
import { errorResponse } from "@/server/http";
import { trackDevice } from "@/server/auth/device-cookie";

const schema = z.object({
  fullName: z.string().min(1).max(200),
  email: z.string().email(),
  country: z.string().length(2),
  password: z.string().min(10),
  marketingConsent: z.boolean().optional(),
});

export async function POST(request: Request) {
  try {
    const body = schema.parse(await request.json());
    const ipAddress = await requestIp();
    const { person } = await registerTrader({ ...body, ipAddress });
    const response = NextResponse.json(
      { id: person.id, email: person.email, message: "Check your email to verify your account." },
      { status: 201 },
    );
    await trackDevice(response, person.id);
    return response;
  } catch (err) {
    return errorResponse(err);
  }
}
