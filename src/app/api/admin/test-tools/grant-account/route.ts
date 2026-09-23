import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { createOrder } from "@/server/orders";
import { db } from "@/server/db";
import { writeAuditLog } from "@/server/audit";
import { requireAdminPermission, requestIp } from "@/server/auth/guard";
import { ValidationError } from "@/server/errors";
import { errorResponse } from "@/server/http";

const schema = z.object({
  personEmail: z.string().email(),
  challengeTypeId: z.string().min(1),
});

/**
 * Runs the exact same order-intake path a real checkout will (spec §8.1)
 * instead of a bespoke shortcut — so this also exercises Payment record
 * creation and identity-mismatch detection, not just Account creation.
 * The only thing "test" about it is the order_ref prefix and the fact
 * that an admin triggers it instead of a payment webhook.
 */
export async function POST(request: Request) {
  try {
    const admin = await requireAdminPermission("challengeTypes.edit");
    const body = schema.parse(await request.json());

    const person = await db.person.findUnique({ where: { email: body.personEmail.trim().toLowerCase() } });
    if (!person) throw new ValidationError("No trader with that email. They need to register first.");

    const challengeType = await db.challengeType.findUnique({ where: { id: body.challengeTypeId } });
    if (!challengeType) throw new ValidationError("Challenge type not found.");

    const ipAddress = await requestIp();
    const { account } = await createOrder({
      orderRef: `TEST-${randomUUID()}`,
      fullName: person.fullName,
      email: person.email,
      country: person.country,
      challengeTypeId: body.challengeTypeId,
      amountPaid: Number(challengeType.fee),
      currency: challengeType.currency,
      paymentProvider: "manual-test",
      ipAddress,
    });

    // createOrder logs "order.created" as actorType "integration" (matching
    // what a real checkout webhook would produce) — this second entry
    // records the actual human behind it, since an admin manually
    // triggering an order intake is not the same event as a real purchase.
    await writeAuditLog({
      actorType: "admin",
      actorId: admin.id,
      action: "account.granted_for_testing",
      entityType: "Account",
      entityId: account.id,
      reason: "Manually granted via the admin test tool — no real checkout involved.",
      ipAddress,
    });

    return NextResponse.json(account, { status: 201 });
  } catch (err) {
    return errorResponse(err);
  }
}
