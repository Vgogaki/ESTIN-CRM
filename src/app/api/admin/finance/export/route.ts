import { z } from "zod";
import { feesCsv, loadFinanceData, payoutsCsv } from "@/server/finance-report";
import { writeAuditLog } from "@/server/audit";
import { requireAdminPermission, requestIp } from "@/server/auth/guard";
import { errorResponse } from "@/server/http";

const schema = z.object({
  type: z.enum(["fees", "payouts"]),
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  includeTest: z.enum(["0", "1"]).default("0"),
});

/** Every export is logged — financial data leaving the system is exactly what an audit asks about. */
export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const q = schema.parse(Object.fromEntries(url.searchParams));
    const admin = await requireAdminPermission(q.type === "payouts" ? "payouts.view" : "reports.view");

    const data = await loadFinanceData({ from: q.from, to: q.to, includeTest: q.includeTest === "1" });
    const csv = q.type === "fees" ? feesCsv(data.paymentRows) : payoutsCsv(data.payouts);
    const rows = q.type === "fees" ? data.paymentRows.length : data.payouts.length;

    await writeAuditLog({
      actorType: "admin",
      actorId: admin.id,
      action: "finance.exported",
      entityType: "Report",
      entityId: `${q.type}:${q.from}:${q.to}`,
      after: { type: q.type, from: q.from, to: q.to, rows, includeTest: q.includeTest === "1" },
      ipAddress: await requestIp(),
    });

    return new Response(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${q.type}_${q.from}_${q.to}.csv"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    return errorResponse(err);
  }
}
