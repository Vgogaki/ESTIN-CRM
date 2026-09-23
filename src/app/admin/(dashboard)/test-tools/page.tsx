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
        Phase 2 (order intake + payment) doesn&apos;t exist yet, so this is a stand-in for
        creating an account: it grants a real Account row, pinned to the exact challenge type
        version selected, and records a terms-acceptance entry — same as a real purchase will,
        once the order flow is built. Every grant is logged in the audit trail as a manual test
        grant, not a real purchase.
      </Alert>
      <div className="mt-5">
        <GrantAccountForm options={publishedOptions} />
      </div>
    </div>
  );
}
