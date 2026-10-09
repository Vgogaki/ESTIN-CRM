import { redirect } from "next/navigation";
import { getCurrentAdmin } from "@/server/auth/guard";
import { getTwoFactorStatus } from "@/server/auth/admin-2fa";
import AdminAccount from "./admin-account";
import TwoFactorCard from "./two-factor-card";

export default async function AdminAccountPage() {
  const admin = await getCurrentAdmin();
  if (!admin) redirect("/admin/login");
  const twoFactor = await getTwoFactorStatus(admin.id);

  return (
    <>
      <AdminAccount
        admin={{
          name: admin.name,
          email: admin.email,
          roleName: admin.role.name,
          permissions: admin.role.permissions,
        }}
      />
      <div className="mt-5">
        <TwoFactorCard email={admin.email} enabled={twoFactor.enabled} recoveryCodesRemaining={twoFactor.recoveryCodesRemaining} />
      </div>
    </>
  );
}
