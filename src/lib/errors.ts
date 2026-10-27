export class AppError extends Error {
  constructor(message: string, public status = 400, public retryAfter?: number) { super(message); }
}
