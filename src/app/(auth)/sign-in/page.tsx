"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { signInAction } from "../../../server/actions/auth";

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
    <div className="bg-surface min-h-screen flex flex-col justify-center items-center p-4">
      <div className="w-full max-w-[440px] bg-surface-container-lowest border border-outline-variant/30 rounded-xl shadow-md overflow-hidden">
        <div className="p-8 pb-6 text-center border-b border-outline-variant/20">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-lg bg-surface-container-low mb-4">
            <span className="text-primary text-2xl" aria-hidden>
              🧪
            </span>
          </div>
          <h1 className="text-2xl font-semibold text-on-surface mb-2">CDC Laboratories</h1>
          <p className="text-sm text-on-surface-variant">Secure Access Gateway</p>
        </div>

        <form className="p-8 space-y-6" onSubmit={handleSubmit} noValidate>
          {error ? (
            <p
              role="alert"
              className="text-sm text-error bg-error-container/40 rounded-lg px-3 py-2"
            >
              {error}
            </p>
          ) : null}

          <div className="space-y-2">
            <label htmlFor="email" className="block text-sm font-medium text-on-surface">
              Email Address
            </label>
            <input
              id="email"
              name="email"
              type="email"
              required
              autoComplete="username"
              placeholder="user@cdclabs.com"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="block w-full px-3 py-2.5 border border-outline-variant rounded-lg text-on-surface text-sm bg-surface-container-lowest focus:ring-2 focus:ring-primary focus:border-primary transition-colors h-11"
            />
          </div>

          <div className="space-y-2">
            <div className="flex justify-between items-center">
              <label htmlFor="password" className="block text-sm font-medium text-on-surface">
                Password
              </label>
              <a href="/forgot-password" className="text-sm text-primary hover:underline">
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
                className="block w-full px-3 pr-10 py-2.5 border border-outline-variant rounded-lg text-on-surface text-sm bg-surface-container-lowest focus:ring-2 focus:ring-primary focus:border-primary transition-colors h-11"
              />
              <button
                type="button"
                onClick={() => setShowPassword((value) => !value)}
                className="absolute inset-y-0 right-0 pr-3 flex items-center text-on-surface-variant"
                aria-label={showPassword ? "Hide password" : "Show password"}
              >
                {showPassword ? "🙈" : "👁"}
              </button>
            </div>
          </div>

          <div className="pt-2 space-y-6">
            <div className="flex items-center">
              {/*
                Sessions always last 30 days (FR-AUTH-05) — there is no
                shorter, user-selectable session. This checkbox is rendered
                checked and non-interactive so it never implies a second
                session duration exists (approved correction, Phase 2 plan
                §11/§19 decision 18).
              */}
              <input
                id="remember-me"
                type="checkbox"
                checked
                disabled
                readOnly
                className="h-4 w-4 text-primary border-outline-variant rounded"
              />
              <label htmlFor="remember-me" className="ml-2 block text-sm text-on-surface-variant">
                Sessions stay signed in for 30 days
              </label>
            </div>
            <button
              type="submit"
              disabled={submitting}
              className="w-full flex justify-center items-center h-11 bg-primary hover:bg-primary-container text-on-primary text-sm font-medium rounded-lg transition-colors disabled:opacity-60"
            >
              {submitting ? "Signing in…" : "Sign In"}
            </button>
          </div>
        </form>

        <div className="bg-surface-container-low px-8 py-4 border-t border-outline-variant/20 flex justify-center items-center gap-2">
          <span className="relative flex h-2 w-2">
            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
          </span>
          <span className="text-xs text-on-surface-variant uppercase tracking-wider">
            System Status: Online
          </span>
        </div>
      </div>
    </div>
  );
}
