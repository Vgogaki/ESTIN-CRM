import { redirect } from "next/navigation";

/** The page moved to /admin/tasks; this keeps old bookmarks and links working. */
export default function PendingTasksRedirect() {
  redirect("/admin/tasks");
}
