import Link from "next/link";
import { Card } from "@/components/ui/card";

export default function Home() {
  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center px-6">
      <div className="mb-8 text-center">
        <div className="font-display text-lg font-semibold tracking-[0.14em]">ESTIN</div>
        <div className="mt-1 text-xs tracking-wide text-sub">PROP TRADING EVALUATIONS</div>
      </div>
      <div className="flex flex-col gap-3">
        <Link href="/portal/login">
          <Card className="p-4 transition-colors hover:border-acc">
            <p className="font-medium">Trader portal</p>
            <p className="text-sm text-sub">Sign in to your evaluation account</p>
          </Card>
        </Link>
        <Link href="/admin/login">
          <Card className="p-4 transition-colors hover:border-acc">
            <p className="font-medium">Back office</p>
            <p className="text-sm text-sub">Staff sign-in</p>
          </Card>
        </Link>
      </div>
    </main>
  );
}
