"use server";

import { requireUser } from "@/server/auth";
import { buildExport } from "@/lib/export";

/** All the signed-in user's data as one text file; never another user's, never secrets (see lib/export). */
export async function exportDataAction() {
  return { success: true as const, ...(await buildExport(await requireUser())) };
}
