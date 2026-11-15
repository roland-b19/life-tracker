import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser, UnauthorizedError } from "@/server/auth";
import { createWeightEntry, listWeightEntries } from "@/server/weight";
import { logRequest } from "@/server/logger";
import { genericError as apiError, isUniqueViolation } from "@/server/api-errors";
import { isSameOrigin } from "@/server/same-origin";
import { weightCreateInput } from "@/lib/validations/weight";

export const runtime = "nodejs";

const genericError = (request: Request, status: number) => apiError(request, "/api/weight", status);

function noStore(response: NextResponse) {
  response.headers.set("Cache-Control", "no-store");
  return response;
}

export async function GET(request: Request) {
  try {
    const userId = await requireUser();
    const entries = await listWeightEntries(userId);
    logRequest(request, "/api/weight", 200);
    return noStore(NextResponse.json({ entries }));
  } catch (error) {
    if (error instanceof UnauthorizedError) return genericError(request, 401);
    console.error("weight_list_failed", { status: 500 });
    return genericError(request, 500);
  }
}

export async function POST(request: Request) {
  if (request.headers.get("content-type")?.split(";")[0] !== "application/json") {
    return genericError(request, 415);
  }
  if (!isSameOrigin(request)) return genericError(request, 403);

  try {
    const userId = await requireUser();
    const body = weightCreateInput.parse(await request.json());
    const entry = await createWeightEntry(userId, body.date, body.kilograms, body.id);
    if (!entry) return genericError(request, 409);
    logRequest(request, "/api/weight", 201);
    return noStore(NextResponse.json({ entry }, { status: 201 }));
  } catch (error) {
    if (error instanceof UnauthorizedError) return genericError(request, 401);
    if (error instanceof z.ZodError) return genericError(request, 400);
    if (isUniqueViolation(error)) {
      return genericError(request, 409);
    }
    console.error("weight_create_failed", { status: 500 });
    return genericError(request, 500);
  }
}
