import { toNextJsHandler } from "better-auth/next-js";
import { auth } from "../../../../server/auth";

/**
 * Better Auth's generic HTTP surface (session reads, etc.). Deliberately
 * NOT paired with the `nextCookies()` plugin: that plugin auto-forwards
 * `Set-Cookie` for every `auth.api.*` call made from a Server Action
 * context, which would defeat the sign-in containment logic in
 * `src/lib/auth/lockout.ts` (a locked/inactive account's session must
 * never reach the browser — see docs/adr/0003-phase-2-authentication.md).
 * Sign-in specifically goes through `signInAction`
 * (`src/server/actions/auth.ts`), never through this route.
 */
export const { GET, POST } = toNextJsHandler(auth);
