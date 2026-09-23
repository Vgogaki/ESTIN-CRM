import { getCurrentAdmin } from "@/server/auth/guard";
import { AdminShell } from "@/components/admin-shell";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const admin = await getCurrentAdmin();

  // Not logged in: render bare (the login page itself), no sidebar chrome.
  // The actual auth requirement is still enforced by each protected page.
  if (!admin) return children;

  return <AdminShell admin={{ name: admin.name, roleName: admin.role.name }}>{children}</AdminShell>;
}
