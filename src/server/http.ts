/** An error whose message is safe to show to the client, with an HTTP status. */
export class HttpError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export const str = (v: unknown): string => (typeof v === "string" ? v : "");
export const int = (v: unknown): number => Number.parseInt(str(v), 10) || 0;
