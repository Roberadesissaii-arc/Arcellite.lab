import { NextResponse, type NextRequest } from "next/server"

/*
 * Security headers for every response, and a per-request nonce Content Security Policy for
 * pages. Pages render dynamically (the root layout awaits `connection()`), so Next.js applies
 * the nonce from the request's CSP header to its own scripts; the theme boot script reads it
 * from `x-nonce`. Session checks do not happen here: the dashboard layout verifies the
 * session against the database.
 */

function httpsOnly(): boolean {
  try {
    return new URL(process.env.ARCELLITE_APP_URL ?? "").protocol === "https:"
  } catch {
    return false
  }
}

export function contentSecurityPolicy(nonce: string, options: { dev: boolean; https: boolean }): string {
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${options.dev ? " 'unsafe-eval'" : ""}`,
    // React and motion write style attributes; styles cannot run code.
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' blob: data:",
    "font-src 'self'",
    "connect-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    ...(options.https ? ["upgrade-insecure-requests"] : []),
  ].join("; ")
}

function baseHeaders(headers: Headers, https: boolean) {
  headers.set("X-Content-Type-Options", "nosniff")
  headers.set("Referrer-Policy", "strict-origin-when-cross-origin")
  headers.set("X-Frame-Options", "DENY")
  headers.set("Cross-Origin-Opener-Policy", "same-origin")
  headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=(), payment=(), usb=()")
  if (https) headers.set("Strict-Transport-Security", "max-age=31536000")
}

export function proxy(request: NextRequest) {
  const https = httpsOnly()
  if (request.nextUrl.pathname.startsWith("/api/")) {
    const response = NextResponse.next()
    baseHeaders(response.headers, https)
    return response
  }
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64")
  const csp = contentSecurityPolicy(nonce, { dev: process.env.NODE_ENV === "development", https })
  const requestHeaders = new Headers(request.headers)
  requestHeaders.set("x-nonce", nonce)
  requestHeaders.set("Content-Security-Policy", csp)
  const response = NextResponse.next({ request: { headers: requestHeaders } })
  response.headers.set("Content-Security-Policy", csp)
  baseHeaders(response.headers, https)
  return response
}

export const config = {
  matcher: [{ source: "/((?!_next/static|_next/image|favicon.svg|brand/).*)" }],
}
