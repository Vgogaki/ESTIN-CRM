import { redirect } from "next/navigation";
import { getCurrentAdmin } from "@/server/auth/guard";
import AdminLoginForm from "./login-form";

export default async function AdminLoginPage() {
  const admin = await getCurrentAdmin();
  if (admin) redirect("/admin");
  return <AdminLoginForm />;
}
