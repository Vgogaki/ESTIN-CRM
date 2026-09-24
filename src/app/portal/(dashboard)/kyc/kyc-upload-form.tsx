"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";

const DOC_TYPES = ["identity_front", "identity_back", "proof_of_address", "selfie"] as const;

export default function KycUploadForm({
  uploadedTypes,
  labels,
}: {
  uploadedTypes: string[];
  labels: Record<string, string>;
}) {
  const router = useRouter();
  const [uploading, setUploading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileInputs = useRef<Record<string, HTMLInputElement | null>>({});

  async function upload(type: string) {
    const input = fileInputs.current[type];
    const file = input?.files?.[0];
    if (!file) {
      setError("Choose a file first.");
      return;
    }
    setError(null);
    setUploading(type);
    try {
      const formData = new FormData();
      formData.append("type", type);
      formData.append("file", file);
      const res = await fetch("/api/portal/kyc/documents", { method: "POST", body: formData });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Upload failed.");
        return;
      }
      if (input) input.value = "";
      router.refresh();
    } finally {
      setUploading(null);
    }
  }

  return (
    <Card className="p-5">
      <div className="flex flex-col gap-4">
        {DOC_TYPES.map((type) => (
          <div key={type} className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm">{labels[type]}</p>
              {uploadedTypes.includes(type) && (
                <p className="text-xs text-sub">Uploaded — choose a file to replace it.</p>
              )}
            </div>
            <div className="flex items-center gap-2">
              <input
                ref={(el) => {
                  fileInputs.current[type] = el;
                }}
                type="file"
                accept="image/jpeg,image/png,application/pdf"
                className="text-xs text-sub file:mr-2 file:rounded-md file:border file:border-bd file:bg-bg file:px-2 file:py-1 file:text-xs file:text-ink"
              />
              <Button
                type="button"
                variant="ghost"
                disabled={uploading === type}
                onClick={() => upload(type)}
              >
                {uploading === type ? "Uploading…" : "Upload"}
              </Button>
            </div>
          </div>
        ))}
      </div>
      {error && (
        <div className="mt-4">
          <Alert tone="danger">{error}</Alert>
        </div>
      )}
      <p className="mt-4 text-xs text-sub">
        JPEG, PNG, or PDF, up to 10MB. Documents are encrypted before storage and only visible to
        compliance staff reviewing your submission.
      </p>
    </Card>
  );
}
