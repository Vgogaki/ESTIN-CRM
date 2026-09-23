/** A business-rule violation that should surface as a 4xx to the client, not a 500. */
export class ValidationError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.name = "ValidationError";
    this.status = status;
  }
}
