import { redirect } from "next/navigation";
import { getCurrentAdmin } from "@/server/auth/guard";
import AdminAccount from "./admin-account";

export default async function AdminAccountPage() {
  const admin = await getCurrentAdmin();
  if (!admin) redirect("/admin/login");

  return (
    <AdminAccount
      admin={{
        name: admin.name,
        email: admin.email,
        roleName: admin.role.name,
        permissions: admin.role.permissions,
      }}
    />
  );
}
