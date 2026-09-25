import { db } from "@/server/db";

export async function getTraderAccounts(personId: string) {
  return db.account.findMany({
    where: { personId, voidedAt: null },
    include: {
      challengeType: true,
      currentPhase: true,
      withdrawals: { orderBy: { requestedAt: "desc" } },
    },
    orderBy: { createdAt: "desc" },
  });
}
