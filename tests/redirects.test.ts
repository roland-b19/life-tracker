import { describe, expect, it } from "vitest";
import nextConfig from "../next.config";

describe("redirects", () => {
  it("sends the old /food page, and anything under it, to /health for good", async () => {
    const rules = (await nextConfig.redirects?.()) ?? [];
    expect(rules).toEqual([{ source: "/food/:path*", destination: "/health/:path*", permanent: true }]);
  });
});
