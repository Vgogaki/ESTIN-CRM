"use client";

import { useRouter } from "next/navigation";
import ChallengeTypeForm from "../challenge-type-form";

export default function NewChallengeTypePage() {
  const router = useRouter();

  return (
    <main className="mx-auto max-w-2xl px-6 py-10">
      <h1 className="mb-6 text-xl font-semibold">New challenge type</h1>
      <ChallengeTypeForm
        submitUrl="/api/admin/challenge-types"
        submitMethod="POST"
        submitLabel="Create draft"
        onSaved={(result) => router.push(`/admin/challenge-types/${result.familyId}`)}
      />
    </main>
  );
}
