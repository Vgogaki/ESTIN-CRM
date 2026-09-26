/**
 * Permission strings are "module.action". This list is the single source of
 * truth for what actions exist — role definitions below must only reference
 * permissions from this list. See docs/modules-to-design.md §1.3.
 */
export const PERMISSIONS = [
  "traders.view",
  "traders.edit",
  "traders.void",
  "notes.create",
  "kyc.view",
  "kyc.decide",
  "kyc.override",
  "payouts.view",
  "payouts.approve",
  "refunds.create",
  "challengeTypes.view",
  "challengeTypes.edit",
  "offers.manage",
  "competitions.manage",
  "countries.manage",
  "risk.review",
  "reports.view",
  "integrations.manage",
  "admins.manage",
  "auditLog.view",
] as const;

export type Permission = (typeof PERMISSIONS)[number];

/**
 * Starting role set from docs/modules-to-design.md §1.3. Roles themselves
 * are configurable data (the AdminRole table) — this is only the seed data
 * for a fresh database, not a hardcoded ceiling. An admin with
 * "admins.manage" can create new roles later with any subset of
 * PERMISSIONS.
 */
export const DEFAULT_ROLES: Record<string, readonly Permission[]> = {
  super_admin: [...PERMISSIONS],
  operations: [
    "traders.view",
    "traders.edit",
    "notes.create",
    "kyc.view",
    "offers.manage",
    "competitions.manage",
    "reports.view",
  ],
  compliance: [
    "traders.view",
    "notes.create",
    "kyc.view",
    "kyc.decide",
    "kyc.override",
    "countries.manage",
    "risk.review",
    "auditLog.view",
  ],
  finance: [
    "traders.view",
    "payouts.view",
    "payouts.approve",
    "refunds.create",
    "reports.view",
  ],
  support: ["traders.view", "notes.create"],
  read_only: ["traders.view", "kyc.view", "payouts.view", "reports.view"],
};

export function hasPermission(
  grantedPermissions: readonly string[],
  required: Permission,
): boolean {
  return grantedPermissions.includes(required);
}

export class PermissionDeniedError extends Error {
  constructor(required: Permission) {
    super(`Missing permission: ${required}`);
    this.name = "PermissionDeniedError";
  }
}
