import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser, UnauthorizedError } from "@/server/auth";
import { createWeightEntry, listWeightEntries } from "@/server/weight";
import { logRequest } from "@/server/logger";
import { isSameOrigin } from "@/server/same-origin";

export const runtime = "nodejs";

const weightInput = z
  .object({
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    kilograms: z
      .number()
      .finite()
      .min(20)
      .max(500)
      .refine((value) => Number.isInteger(value * 100), "Maximum two decimal places."),
  })
  .strict();

function noStore(response: NextResponse) {
  response.headers.set("Cache-Control", "no-store");
  return response;
}

function genericError(request: Request, status: number) {
  logRequest(request, "/api/weight", status);
  return noStore(NextResponse.json({ error: "Request could not be completed." }, { status }));
}

function isUniqueViolation(error: unknown) {
  if (!error || typeof error !== "object") return false;
  const candidate = error as { code?: unknown; cause?: { code?: unknown } };
  return candidate.code === "23505" || candidate.cause?.code === "23505";
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
    const body = weightInput.parse(await request.json());
    const entry = await createWeightEntry(userId, body.date, body.kilograms);
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
