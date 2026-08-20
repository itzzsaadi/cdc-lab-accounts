"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { signInAction } from "../../../server/actions/auth";
import { Button } from "../../../components/ui/Button";
import { TextInput } from "../../../components/ui/TextInput";
import { Checkbox } from "../../../components/ui/Checkbox";
import { Alert } from "../../../components/ui/Alert";

/**
 * Reads the `?expired=1` query param set by `AuthenticatedShell`'s
 * redirect (src/components/layout/AuthenticatedShell.tsx). Isolated in its
 * own component so `useSearchParams()` doesn't force the whole Sign In
 * page to opt out of static prerendering — Next.js requires any
 * `useSearchParams()` consumer to sit inside a `<Suspense>` boundary.
 */
function ExpiredBanner() {
  const searchParams = useSearchParams();
  if (searchParams.get("expired") !== "1") return null;
  return <Alert variant="info">Your session expired — please sign in again.</Alert>;
}

/**
 * Reproduces the approved Stitch Sign In screen
 * (docs/ui/stitch-export/sign_in_cdc_laboratories_code.html) as real React
 * components — the CDN Tailwind script, inline `tailwind.config`, and
 * inline demo JavaScript are never copied (docs/UI_REQUIREMENTS.md §27).
 * Card shell, email/password fields with icons, and the footer status row
 * all reproduce that screen's layout; the error state and the
 * non-interactive "Remember me" checkbox are this project's own additions
 * per docs/adr/0003-phase-2-authentication.md.
 */
export default function SignInPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const result = await signInAction({ email, password });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.push("/home");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main
      id="main-content"
      className="bg-surface flex min-h-screen flex-col items-center justify-center p-4"
    >
      <div className="bg-surface-container-lowest border-outline-variant/30 w-full max-w-[440px] overflow-hidden rounded-xl border shadow-md">
        <div className="border-outline-variant/20 border-b p-8 pb-6 text-center">
          <div className="bg-surface-container-low mb-4 inline-flex h-12 w-12 items-center justify-center rounded-lg">
            <span className="text-primary text-2xl" aria-hidden>
              🧪
            </span>
          </div>
          <h1 className="text-on-surface mb-2 text-2xl font-semibold">CDC Laboratories</h1>
          <p className="text-on-surface-variant text-sm">Secure Access Gateway</p>
        </div>

        <form className="space-y-6 p-8" onSubmit={handleSubmit} noValidate>
          <Suspense fallback={null}>
            <ExpiredBanner />
          </Suspense>
          {error ? <Alert variant="error">{error}</Alert> : null}

          <TextInput
            id="email"
            label="Email Address"
            name="email"
            type="email"
            required
            autoComplete="username"
            placeholder="user@cdclabs.com"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label htmlFor="password" className="text-on-surface block text-sm font-medium">
                Password
              </label>
              <a href="/forgot-password" className="text-primary text-sm hover:underline">
                Forgot Password?
              </a>
            </div>
            <div className="relative">
              <input
                id="password"
                name="password"
                type={showPassword ? "text" : "password"}
                required
                autoComplete="current-password"
                placeholder="Enter your password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className="border-outline-variant text-on-surface bg-surface-container-lowest focus:ring-primary focus:border-primary h-11 block w-full rounded-lg border px-3 py-2.5 pr-10 text-sm transition-colors focus:ring-2"
              />
              <button
                type="button"
                onClick={() => setShowPassword((value) => !value)}
                className="text-on-surface-variant absolute inset-y-0 right-0 flex items-center pr-3"
                aria-label={showPassword ? "Hide password" : "Show password"}
              >
                {showPassword ? "🙈" : "👁"}
              </button>
            </div>
          </div>

          <div className="space-y-6 pt-2">
            {/*
              Sessions always last 30 days (FR-AUTH-05) — there is no
              shorter, user-selectable session. This checkbox is rendered
              checked and non-interactive so it never implies a second
              session duration exists (approved correction, Phase 2 plan
              §11/§19 decision 18).
            */}
            <Checkbox
              id="remember-me"
              label="Sessions stay signed in for 30 days"
              checked
              disabled
              readOnly
            />
            <Button type="submit" disabled={submitting} className="w-full">
              {submitting ? "Signing in…" : "Sign In"}
            </Button>
          </div>
        </form>

        <div className="bg-surface-container-low border-outline-variant/20 flex items-center justify-center gap-2 border-t px-8 py-4">
          <span className="relative flex h-2 w-2">
            <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
          </span>
          <span className="text-on-surface-variant text-xs tracking-wider uppercase">
            System Status: Online
          </span>
        </div>
      </div>
    </main>
  );
}
