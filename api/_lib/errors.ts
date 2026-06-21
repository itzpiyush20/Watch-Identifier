import type { VercelResponse } from "@vercel/node";
import type { ApiError } from "../../src/types/index.js";

/** Stable, client-facing error codes. */
export const ErrorCode = {
  METHOD_NOT_ALLOWED: "METHOD_NOT_ALLOWED",
  INVALID_PAYLOAD: "INVALID_PAYLOAD",
  PAYLOAD_TOO_LARGE: "PAYLOAD_TOO_LARGE",
  UNAUTHORIZED: "UNAUTHORIZED",
  QUOTA_EXCEEDED: "QUOTA_EXCEEDED",
  IDENTIFICATION_FAILED: "IDENTIFICATION_FAILED",
  UPSTREAM_UNAVAILABLE: "UPSTREAM_UNAVAILABLE",
  INTERNAL: "INTERNAL",
} as const;
export type ErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode];

const STATUS: Record<ErrorCode, number> = {
  METHOD_NOT_ALLOWED: 405,
  INVALID_PAYLOAD: 400,
  PAYLOAD_TOO_LARGE: 413,
  UNAUTHORIZED: 401,
  QUOTA_EXCEEDED: 429,
  IDENTIFICATION_FAILED: 422,
  UPSTREAM_UNAVAILABLE: 503,
  INTERNAL: 500,
};

const RETRYABLE: Record<ErrorCode, boolean> = {
  METHOD_NOT_ALLOWED: false,
  INVALID_PAYLOAD: false,
  PAYLOAD_TOO_LARGE: false,
  UNAUTHORIZED: false,
  QUOTA_EXCEEDED: false,
  IDENTIFICATION_FAILED: true,
  UPSTREAM_UNAVAILABLE: true,
  INTERNAL: true,
};

export class ApiException extends Error {
  constructor(
    readonly code: ErrorCode,
    message: string,
    readonly extra?: Record<string, unknown>
  ) {
    super(message);
  }
}

export function sendError(res: VercelResponse, code: ErrorCode, message: string): void {
  const body: ApiError = {
    error: { code, message, retryable: RETRYABLE[code] },
  };
  res.status(STATUS[code]).json(body);
}
