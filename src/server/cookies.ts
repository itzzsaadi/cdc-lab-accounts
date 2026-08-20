import { cookies } from "next/headers";

/**
 * Forwards every `Set-Cookie` header from a Better Auth response onto the
 * real outgoing Next.js response, via `next/headers`'s `cookies()` API
 * (which only accepts structured name/value/options, not a raw
 * `Set-Cookie` string — this is a small, deliberately narrow parser for
 * exactly the attribute set Better Auth itself generates, not a general
 * RFC 6265 parser).
 *
 * Callers control *whether* this is ever invoked — see
 * `src/lib/auth/lockout.ts`'s `signInWithLockout`, which returns headers to
 * its caller only on a genuine success, specifically so a locked/inactive
 * account's session never reaches this function at all.
 */
export async function forwardSetCookieHeaders(headers: Headers): Promise<void> {
  const store = await cookies();
  for (const setCookie of headers.getSetCookie()) {
    const [pair, ...attrParts] = setCookie.split(";").map((part) => part.trim());
    const eqIndex = pair.indexOf("=");
    const name = pair.slice(0, eqIndex);
    // Better Auth's raw Set-Cookie value is already percent-encoded.
    // Next's `cookies().set()` percent-encodes the value it's given
    // (via the `cookie` package's `serialize`, `encode: encodeURIComponent`
    // by default) — passing the already-encoded string through unchanged
    // would double-encode it, producing a cookie Better Auth can no longer
    // decode back to the real session token. Decode once here so Next's
    // own encoding step reproduces the original value exactly.
    const value = decodeURIComponent(pair.slice(eqIndex + 1));

    const options: {
      path?: string;
      httpOnly?: boolean;
      secure?: boolean;
      sameSite?: "lax" | "strict" | "none";
      maxAge?: number;
      domain?: string;
    } = {};

    for (const attr of attrParts) {
      const [rawKey, rawValue] = attr.split("=");
      const key = rawKey.toLowerCase();
      if (key === "path") options.path = rawValue;
      else if (key === "httponly") options.httpOnly = true;
      else if (key === "secure") options.secure = true;
      else if (key === "samesite")
        options.sameSite = rawValue?.toLowerCase() as "lax" | "strict" | "none";
      else if (key === "max-age") options.maxAge = Number(rawValue);
      else if (key === "domain") options.domain = rawValue;
    }

    store.set(name, value, options);
  }
}
