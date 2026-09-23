const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_DURATION_MS = 15 * 60 * 1000; // 15 minutes

export function isLockedOut(lockedUntil: Date | null): boolean {
  return lockedUntil !== null && lockedUntil.getTime() > Date.now();
}

/** Call after a failed password check. Returns the fields to persist. */
export function recordFailedAttempt(currentAttempts: number): {
  failedLoginAttempts: number;
  lockedUntil: Date | null;
} {
  const failedLoginAttempts = currentAttempts + 1;
  const lockedUntil =
    failedLoginAttempts >= MAX_FAILED_ATTEMPTS
      ? new Date(Date.now() + LOCKOUT_DURATION_MS)
      : null;
  return { failedLoginAttempts, lockedUntil };
}

/** Call after a successful login. */
export const resetLockout = { failedLoginAttempts: 0, lockedUntil: null } as const;
