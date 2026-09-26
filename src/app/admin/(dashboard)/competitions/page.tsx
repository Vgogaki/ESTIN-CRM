import { redirect } from "next/navigation";
import { getCurrentAdmin } from "@/server/auth/guard";
import { hasPermission } from "@/server/permissions";
import { listCompetitions } from "@/server/competitions";
import { PageHeader } from "@/components/ui/page-header";
import { Alert } from "@/components/ui/alert";
import CompetitionsList from "./competitions-list";

export default async function CompetitionsPage() {
  const admin = await getCurrentAdmin();
  if (!admin) redirect("/admin/login");
  if (!hasPermission(admin.role.permissions, "competitions.manage")) {
    return <Alert tone="danger">You don&apos;t have permission to view this.</Alert>;
  }

  const competitions = await listCompetitions();

  return (
    <div>
      <PageHeader
        title="Competitions"
        subtitle="Contests on demo accounts, used primarily as an acquisition channel — entrants who later buy a challenge are the actual return."
      />
      <Alert tone="warning">
        No prototype exists for this module — only crm-specification.md §7&apos;s design notes. Paid-entry
        prize competitions can fall under gaming or lottery regulation in Cyprus; a competition with a
        non-zero entry fee cannot go active until legal sign-off is confirmed on it. Free-entry
        competitions need no such gate.
      </Alert>
      <div className="mt-5">
        <CompetitionsList
          competitions={competitions.map((c) => ({
            id: c.id,
            name: c.name,
            status: c.status,
            entryFee: c.entryFee.toString(),
            currency: c.currency,
            startDate: c.startDate.toISOString(),
            endDate: c.endDate.toISOString(),
            entrantCount: c.entries.length,
            entrantCap: c.entrantCap,
            legalSignOffConfirmed: c.legalSignOffConfirmed,
          }))}
        />
      </div>
    </div>
  );
}
