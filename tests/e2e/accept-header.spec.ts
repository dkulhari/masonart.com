/**
 * Accept-header content negotiation (#268)
 *
 * TanStack Start's handler returns a JSON 500 when the Accept header lacks
 * text/html or a wildcard — our server entry converts that case to a 406.
 * Uses request fixtures (no browser) since browsers always send text/html.
 */
import { test, expect } from "@playwright/test";

test.describe("Accept header negotiation", () => {
  test("non-HTML Accept gets 406, not 500", async ({ request }) => {
    for (const accept of ["application/xml", "application/json"]) {
      const res = await request.get("/", {
        headers: { Accept: accept },
        maxRedirects: 0,
      });
      expect(res.status(), `Accept: ${accept}`).toBe(406);
    }
  });

  test("browser-style and wildcard Accepts still serve HTML", async ({
    request,
  }) => {
    for (const accept of [
      "*/*",
      "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    ]) {
      const res = await request.get("/", { headers: { Accept: accept } });
      expect(res.status(), `Accept: ${accept}`).toBe(200);
      expect(res.headers()["content-type"]).toContain("text/html");
    }
  });
});
