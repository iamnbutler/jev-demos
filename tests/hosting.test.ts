import { describe, expect, test } from "bun:test";
import { isAllowedRequest } from "../server/validation";

describe("private gateway hosting", () => {
  const publicOrigin = "https://demos.githubnext.com";
  const request = (method: string, origin?: string) =>
    new Request("http://jev-private:3213/api/evaluate", {
      method,
      headers: origin ? { origin } : {},
    });

  test("allows same-origin browser writes through the private gateway", () => {
    expect(isAllowedRequest(request("POST", publicOrigin), publicOrigin)).toBe(true);
  });

  test("rejects other origins, sibling domains, and writes without an origin", () => {
    for (const origin of [
      undefined,
      "null",
      "https://next-cloud.githubnext.com",
      "https://example.com",
      `${publicOrigin}.example.com`,
    ]) {
      expect(isAllowedRequest(request("POST", origin), publicOrigin)).toBe(false);
    }
  });

  test("allows health reads and same-origin GETs that omit Origin", () => {
    expect(isAllowedRequest(request("GET"), publicOrigin)).toBe(true);
    expect(isAllowedRequest(request("HEAD"), publicOrigin)).toBe(true);
  });

  test("keeps the localhost-only default when hosted mode is unset", () => {
    expect(isAllowedRequest(request("GET"))).toBe(false);
    expect(isAllowedRequest(new Request("http://localhost:4317/api/health"))).toBe(true);
  });
});
