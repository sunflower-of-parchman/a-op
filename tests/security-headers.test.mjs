import assert from "node:assert/strict";
import { register } from "node:module";
import test from "node:test";

register(
  new URL("./helpers/typescript-alias-loader.mjs", import.meta.url),
  import.meta.url,
);

const { AOP_CONTENT_SECURITY_POLICY, applyResponseSecurityHeaders } =
  await import("../lib/security/response-headers.ts");

test("HTML responses receive the complete edge security policy", async () => {
  const response = applyResponseSecurityHeaders(
    new Request("https://artist.example/"),
    new Response("<!doctype html>", {
      headers: { "content-type": "text/html; charset=utf-8" },
    }),
  );

  assert.equal(
    response.headers.get("content-security-policy"),
    AOP_CONTENT_SECURITY_POLICY,
  );
  assert.match(AOP_CONTENT_SECURITY_POLICY, /default-src 'self'/);
  assert.match(AOP_CONTENT_SECURITY_POLICY, /object-src 'none'/);
  assert.match(AOP_CONTENT_SECURITY_POLICY, /frame-ancestors 'none'/);
  assert.match(AOP_CONTENT_SECURITY_POLICY, /form-action 'self'/);
  assert.match(AOP_CONTENT_SECURITY_POLICY, /frame-src https:/);
  assert.equal(response.headers.get("x-content-type-options"), "nosniff");
  assert.equal(response.headers.get("x-frame-options"), "DENY");
  assert.equal(
    response.headers.get("referrer-policy"),
    "strict-origin-when-cross-origin",
  );
  assert.match(
    response.headers.get("permissions-policy") ?? "",
    /payment=\(\)/,
  );
  assert.equal(
    response.headers.get("strict-transport-security"),
    "max-age=31536000; includeSubDomains",
  );
  assert.equal(response.headers.get("cache-control"), "private, no-store");
  assert.equal(await response.text(), "<!doctype html>");
});

test("non-HTML and local HTTP responses retain route headers without an HTML CSP or HSTS", () => {
  const response = applyResponseSecurityHeaders(
    new Request("http://localhost:3000/api/health"),
    Response.json(
      { ok: true },
      {
        headers: { "cache-control": "no-store", "x-request-id": "request_123" },
      },
    ),
  );

  assert.equal(response.headers.get("content-security-policy"), null);
  assert.equal(response.headers.get("strict-transport-security"), null);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.equal(response.headers.get("x-request-id"), "request_123");
  assert.equal(response.headers.get("x-content-type-options"), "nosniff");
});
