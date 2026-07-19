const HTML_CONTENT_TYPE = /(?:^|;)\s*text\/html(?:;|$)/i;

/**
 * The Sites application loads only its own code and artist-hosted media. An
 * owner-approved external video enters a sandboxed frame only after the
 * visitor's explicit consent, so frame navigation is the sole broad HTTPS
 * allowance.
 *
 * vinext currently emits inline framework bootstrap code. `unsafe-inline` is
 * therefore limited to script and style while every application-authored
 * content surface remains structured text with no HTML execution escape hatch.
 */
export const AOP_CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'none'",
  "form-action 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "font-src 'self'",
  "img-src 'self' data:",
  "media-src 'self'",
  "connect-src 'self'",
  "frame-src https:",
  "manifest-src 'self'",
  "worker-src 'none'",
].join("; ");

const PERMISSIONS_POLICY = [
  "accelerometer=()",
  "camera=()",
  "geolocation=()",
  "gyroscope=()",
  "magnetometer=()",
  "microphone=()",
  "payment=()",
  "usb=()",
].join(", ");

function isHtmlResponse(response: Response): boolean {
  return HTML_CONTENT_TYPE.test(response.headers.get("content-type") ?? "");
}

/** Applies the repository-owned edge policy without replacing route headers. */
export function applyResponseSecurityHeaders(
  request: Request,
  response: Response,
): Response {
  const secured = new Response(response.body, {
    headers: response.headers,
    status: response.status,
    statusText: response.statusText,
  });

  secured.headers.set("x-content-type-options", "nosniff");
  secured.headers.set("x-frame-options", "DENY");
  secured.headers.set("referrer-policy", "strict-origin-when-cross-origin");
  secured.headers.set("permissions-policy", PERMISSIONS_POLICY);
  secured.headers.set("cross-origin-resource-policy", "same-origin");
  secured.headers.set("x-dns-prefetch-control", "off");

  if (isHtmlResponse(secured)) {
    secured.headers.set("content-security-policy", AOP_CONTENT_SECURITY_POLICY);
    // The root layout is identity-aware even on public routes. Prevent an
    // authenticated shell or account navigation from entering a shared cache.
    secured.headers.set("cache-control", "private, no-store");
  }

  if (new URL(request.url).protocol === "https:") {
    secured.headers.set(
      "strict-transport-security",
      "max-age=31536000; includeSubDomains",
    );
  }

  return secured;
}
