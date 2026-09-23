"use client";

import { useRouter } from "next/navigation";
import { PageHeader } from "@/components/ui/page-header";
import ChallengeTypeForm from "../challenge-type-form";

export default function NewChallengeTypePage() {
  const router = useRouter();

  return (
    <div>
      <PageHeader
        title="New challenge type"
        backHref="/admin/challenge-types"
        backLabel="Challenge types"
      />
      <ChallengeTypeForm
        submitUrl="/api/admin/challenge-types"
        submitMethod="POST"
        submitLabel="Create draft"
        onSaved={(result) => router.push(`/admin/challenge-types/${result.familyId}`)}
      />
    </div>
  );
}
