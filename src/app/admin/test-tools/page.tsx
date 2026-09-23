import { redirect } from "next/navigation";
import { getCurrentAdmin } from "@/server/auth/guard";
import { hasPermission } from "@/server/permissions";
import { listChallengeTypeFamilies } from "@/server/challenge-types";
import GrantAccountForm from "./grant-account-form";

export default async function TestToolsPage() {
  const admin = await getCurrentAdmin();
  if (!admin) redirect("/admin/login");
  if (!hasPermission(admin.role.permissions, "challengeTypes.edit")) {
    return <main className="p-10">You don&apos;t have permission to view this.</main>;
  }

  const families = await listChallengeTypeFamilies();
  const publishedOptions = families
    .filter((f) => f.active)
    .map((f) => ({ id: f.active!.id, name: f.active!.name, version: f.active!.version }));

  return (
    <main className="mx-auto max-w-lg px-6 py-10">
      <h1 className="text-xl font-semibold">Test tools</h1>
      <p className="mb-6 text-sm text-slate-600">
        Phase 2 (order intake + payment) doesn&apos;t exist yet, so this is a stand-in for
        creating an account: it grants a real Account row, pinned to the exact challenge type
        version selected, and records a terms-acceptance entry — same as a real purchase will,
        once the order flow is built. Every grant is logged in the audit trail as a manual test
        grant, not a real purchase.
      </p>
      <GrantAccountForm options={publishedOptions} />
    </main>
  );
}
