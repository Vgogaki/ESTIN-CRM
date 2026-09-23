import { redirect } from "next/navigation";
import Link from "next/link";
import { getCurrentAdmin } from "@/server/auth/guard";
import { hasPermission } from "@/server/permissions";
import { listChallengeTypeFamilies } from "@/server/challenge-types";

export default async function ChallengeTypesListPage() {
  const admin = await getCurrentAdmin();
  if (!admin) redirect("/admin/login");
  if (!hasPermission(admin.role.permissions, "challengeTypes.view")) {
    return <main className="p-10">You don&apos;t have permission to view this.</main>;
  }

  const families = await listChallengeTypeFamilies();

  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-xl font-semibold">Challenge types</h1>
        <Link href="/admin/challenge-types/new" className="rounded bg-slate-900 px-3 py-2 text-sm text-white">
          New challenge type
        </Link>
      </div>

      {families.length === 0 && <p className="text-sm text-slate-600">No challenge types yet.</p>}

      <div className="flex flex-col gap-2">
        {families.map(({ latest, versionCount, active }) => (
          <Link
            key={latest.familyId}
            href={`/admin/challenge-types/${latest.familyId}`}
            className="flex items-center justify-between rounded border p-4 hover:bg-slate-50"
          >
            <div>
              <p className="font-medium">{latest.name}</p>
              <p className="text-sm text-slate-600">
                {latest.currency} {latest.accountSize.toString()} · {versionCount} version
                {versionCount === 1 ? "" : "s"}
              </p>
            </div>
            <span
              className={`rounded px-2 py-1 text-xs ${
                active ? "bg-green-100 text-green-800" : "bg-slate-100 text-slate-600"
              }`}
            >
              {active ? `Live (v${active.version})` : "No published version"}
            </span>
          </Link>
        ))}
      </div>
    </main>
  );
}
