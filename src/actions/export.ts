"use server";

import { requireUser } from "@/server/auth";
import { buildExport } from "@/lib/export";
import { respond } from "@/lib/validations/result";

/** All the signed-in user's data as one text file; never another user's, never secrets (see lib/export). */
export async function exportDataAction() {
  const userId = await requireUser();
  return respond(() => buildExport(userId));
}
