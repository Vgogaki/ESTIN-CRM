import { cookies } from "next/headers";
import type { NextResponse } from "next/server";
import { DEVICE_COOKIE, DEVICE_COOKIE_MAX_AGE_S, recordDevice, resolveDeviceId } from "@/server/devices";
import { requestIp, requestUserAgent } from "./guard";

/** Route-handler helper: records this browser against the person and (re)sets the device cookie on the response. */
export async function trackDevice(response: NextResponse, personId: string) {
  const { id } = resolveDeviceId((await cookies()).get(DEVICE_COOKIE)?.value);
  await recordDevice({ personId, deviceId: id, ipAddress: await requestIp(), userAgent: await requestUserAgent() });
  response.cookies.set(DEVICE_COOKIE, id, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: DEVICE_COOKIE_MAX_AGE_S,
  });
}
