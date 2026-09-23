import { redirect } from "next/navigation";
import { getCurrentAdmin } from "@/server/auth/guard";
import AdminDashboard from "./admin-dashboard";

export default async function AdminPage() {
  const admin = await getCurrentAdmin();
  if (!admin) redirect("/admin/login");

  return (
    <AdminDashboard
      admin={{
        name: admin.name,
        email: admin.email,
        roleName: admin.role.name,
        permissions: admin.role.permissions,
      }}
    />
  );
}
