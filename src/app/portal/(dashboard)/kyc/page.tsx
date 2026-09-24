import { redirect } from "next/navigation";
import { getCurrentTrader } from "@/server/auth/guard";
import { listKycDocuments } from "@/server/kyc";
import { PageHeader } from "@/components/ui/page-header";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import KycUploadForm from "./kyc-upload-form";

const DOC_LABELS: Record<string, string> = {
  identity_front: "Identity document (front)",
  identity_back: "Identity document (back)",
  proof_of_address: "Proof of address",
  selfie: "Selfie",
};

export default async function KycPage() {
  const trader = await getCurrentTrader();
  if (!trader) redirect("/portal/login");

  const documents = await listKycDocuments(trader.id);
  const uploadedTypes = new Set(documents.map((d) => d.type));

  return (
    <div>
      <PageHeader
        title="Identity verification"
        subtitle="Required before your account can be funded (timing depends on the challenge you bought)."
        backHref="/portal"
        backLabel="Your account"
      />

      <div className="mb-5 flex items-center gap-2">
        <span className="text-sm text-sub">Status:</span>
        <Badge
          tone={
            trader.kycStatus === "verified"
              ? "success"
              : trader.kycStatus === "rejected"
                ? "danger"
                : "neutral"
          }
        >
          {trader.kycStatus.replace("_", " ")}
        </Badge>
      </div>

      {trader.kycStatus === "rejected" && trader.kycRejectionReason && (
        <div className="mb-5">
          <Alert tone="danger">
            Your submission was rejected: {trader.kycRejectionReason}. Upload new documents below
            to resubmit.
          </Alert>
        </div>
      )}

      {trader.kycStatus === "verified" ? (
        <Alert tone="success">Your identity has been verified. No action needed.</Alert>
      ) : (
        <KycUploadForm uploadedTypes={Array.from(uploadedTypes)} labels={DOC_LABELS} />
      )}

      {documents.length > 0 && (
        <div className="mt-6">
          <h2 className="mb-2 font-display text-sm font-semibold">Uploaded</h2>
          <div className="flex flex-col gap-1.5 text-sm">
            {documents.map((d) => (
              <div key={d.id} className="flex justify-between text-sub">
                <span>{DOC_LABELS[d.type] ?? d.type}</span>
                <span>{new Date(d.uploadedAt).toLocaleString()}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
