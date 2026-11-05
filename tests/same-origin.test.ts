import { describe, expect, it } from "vitest";
import { isSameOrigin } from "@/server/same-origin";

function req(headers: Record<string, string>) {
  // The URL is the bind address on purpose: it must not decide the outcome.
  return new Request("http://0.0.0.0:3000/api/weight", { method: "POST", headers });
}

describe("isSameOrigin", () => {
  it("accepts an Origin that matches the Host header", () => {
    expect(isSameOrigin(req({ origin: "http://192.168.1.144:3000", host: "192.168.1.144:3000" }))).toBe(true);
  });

  it("prefers the forwarded host behind a proxy", () => {
    expect(isSameOrigin(req({ origin: "https://app.example.com", host: "0.0.0.0:3000", "x-forwarded-host": "app.example.com" }))).toBe(true);
  });

  it("rejects a foreign, missing or malformed Origin", () => {
    expect(isSameOrigin(req({ origin: "https://evil.example", host: "app.example.com" }))).toBe(false);
    expect(isSameOrigin(req({ host: "app.example.com" }))).toBe(false);
    expect(isSameOrigin(req({ origin: "not a url", host: "app.example.com" }))).toBe(false);
  });
});
