import { randomUUID } from "node:crypto";

export function logRequest(request: Request, route: string, status: number) {
  console.info("request_complete", {
    requestId: request.headers.get("x-request-id") ?? randomUUID(),
    method: request.method,
    route,
    status,
  });
}
