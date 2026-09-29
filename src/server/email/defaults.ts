/**
 * Built-in wording for every email the system sends. Staff can override any of
 * these from the back office (a row in EmailTemplate); this file is what applies
 * until they do. Wording here is a starting point for the founder to review,
 * not approved copy.
 */

export type EmailTemplateDef = {
  key: string;
  label: string;
  subject: string;
  body: string;
  /** Variables the template may use, shown to staff while editing. */
  variables: readonly string[];
  /** Marketing emails are only sent to traders who opted in, and carry an unsubscribe link. */
  marketing: boolean;
  /** Variables that must appear in the body, or the email would be useless (e.g. the sign-in link). */
  required?: readonly string[];
};

const NOTIFY_VARS = ["name", "title", "body", "link"] as const;
const notifyBody = "Hi {{name}},\n\n{{body}}\n\nView it in your portal: {{link}}";

function notify(key: string, label: string, marketing = false): EmailTemplateDef {
  return { key, label, subject: "{{title}}", body: notifyBody, variables: NOTIFY_VARS, marketing };
}

export const EMAIL_TEMPLATES: readonly EmailTemplateDef[] = [
  {
    key: "verify_email",
    label: "Verify your email address",
    subject: "Verify your ESTIN email address",
    body: "Hi {{name}},\n\nPlease confirm your email address to activate your ESTIN account:\n\n{{link}}\n\nThe link expires in 24 hours. If you didn't create an account, you can ignore this message.",
    variables: ["name", "link"],
    marketing: false,
    required: ["link"],
  },
  {
    key: "password_reset",
    label: "Reset your password",
    subject: "Reset your ESTIN password",
    body: "Hi {{name}},\n\nWe received a request to reset your password. Use this link to choose a new one:\n\n{{link}}\n\nThe link expires in 1 hour. If you didn't ask for this, you can ignore this message — your password won't change.",
    variables: ["name", "link"],
    marketing: false,
    required: ["link"],
  },
  notify("account_created", "Purchase confirmed / account created"),
  notify("phase_passed", "Phase passed / pass under review / funded"),
  notify("breach", "Account breached"),
  notify("account_expired", "Account expired"),
  notify("kyc_submitted", "Verification documents received"),
  notify("kyc_verified", "Verification approved"),
  notify("kyc_rejected", "Verification rejected"),
  notify("payout_requested", "Payout requested"),
  notify("payout_approved", "Payout approved"),
  notify("payout_declined", "Payout declined"),
  notify("offer_received", "Offer received (marketing)", true),
  notify("competition_results", "Competition results"),
  notify("support_reply", "Support replied to your message"),
  notify("affiliate_added", "Set up as an affiliate"),
  {
    key: "affiliate_invite",
    label: "Affiliate portal invite",
    subject: "You're set up as an ESTIN affiliate",
    body: "Hi {{name}},\n\nYou've been added as an ESTIN affiliate. Set a password to see your referrals and commissions:\n\n{{link}}\n\nThe link expires in 24 hours.",
    variables: ["name", "link"],
    marketing: false,
    required: ["link"],
  },
  {
    key: "affiliate_password_reset",
    label: "Affiliate password reset",
    subject: "Reset your ESTIN affiliate password",
    body: "Hi {{name}},\n\nUse this link to set a new password for your affiliate account:\n\n{{link}}\n\nThe link expires in 24 hours. If you didn't ask for this, you can ignore this message.",
    variables: ["name", "link"],
    marketing: false,
    required: ["link"],
  },
  {
    key: "system_test",
    label: "Test email (sent from the Email page)",
    subject: "ESTIN test email",
    body: "This is a test email from the ESTIN back office. If you can read it, email delivery is working.",
    variables: [],
    marketing: false,
  },
];

export function getDefaultTemplate(key: string): EmailTemplateDef | undefined {
  return EMAIL_TEMPLATES.find((t) => t.key === key);
}
