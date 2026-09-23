export class AuthError extends Error {
  status: number;
  constructor(message: string, status = 401) {
    super(message);
    this.name = "AuthError";
    this.status = status;
  }
}

export class LockedOutError extends AuthError {
  constructor() {
    super("Too many failed attempts. Try again later.", 423);
    this.name = "LockedOutError";
  }
}

export class TwoFactorRequiredError extends AuthError {
  constructor() {
    super("Two-factor code required.", 428);
    this.name = "TwoFactorRequiredError";
  }
}
