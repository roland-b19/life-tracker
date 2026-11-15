import { NextResponse } from "next/server";
import { logRequest } from "@/server/logger";

/** The one error body every API route returns: no detail about what went wrong, never cached. */
export function genericError(request: Request, route: string, status: number) {
  logRequest(request, route, status);
  const response = NextResponse.json({ error: "Request could not be completed." }, { status });
  response.headers.set("Cache-Control", "no-store");
  return response;
}

export function isUniqueViolation(error: unknown) {
  if (!error || typeof error !== "object") return false;
  const candidate = error as { code?: unknown; cause?: { code?: unknown } };
  return candidate.code === "23505" || candidate.cause?.code === "23505";
}
