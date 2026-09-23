import { redirect } from "next/navigation";
import { getCurrentAdmin } from "@/server/auth/guard";
import { hasPermission } from "@/server/permissions";
import { listChallengeTypeFamilies } from "@/server/challenge-types";
import { PageHeader } from "@/components/ui/page-header";
import { Alert } from "@/components/ui/alert";
import GrantAccountForm from "./grant-account-form";

export default async function TestToolsPage() {
  const admin = await getCurrentAdmin();
  if (!admin) redirect("/admin/login");
  if (!hasPermission(admin.role.permissions, "challengeTypes.edit")) {
    return <Alert tone="danger">You don&apos;t have permission to view this.</Alert>;
  }

  const families = await listChallengeTypeFamilies();
  const publishedOptions = families
    .filter((f) => f.active)
    .map((f) => ({ id: f.active!.id, name: f.active!.name, version: f.active!.version }));

  return (
    <div>
      <PageHeader title="Test tools" />
      <Alert tone="warning">
        There is no real checkout yet — no payment provider is connected (decisions.md #5, still
        open). This runs the exact same order-intake path checkout will (spec §8.1: creates the
        Payment record, pins the account to the exact challenge type version, records terms
        acceptance) using a synthetic order reference instead of a real payment webhook. Every
        grant is logged in the audit trail as an admin-triggered test, not a real purchase.
      </Alert>
      <div className="mt-5">
        <GrantAccountForm options={publishedOptions} />
      </div>
    </div>
  );
}
