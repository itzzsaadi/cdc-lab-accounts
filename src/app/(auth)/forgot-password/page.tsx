"use client";

import { useState } from "react";
import { AuthCard } from "../../../components/layout/AuthCard";
import { requestPasswordResetAction } from "../../../server/actions/auth";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [submitted, setSubmitted] = useState(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    await requestPasswordResetAction({ email });
    // Generic confirmation regardless of whether the email exists — no
    // enumeration signal (Better Auth's own requestPasswordReset endpoint
    // already responds identically either way; this page mirrors that).
    setSubmitted(true);
  }

  if (submitted) {
    return (
      <AuthCard title="Check your email">
        <p className="text-sm text-on-surface-variant">
          If an account exists for that email address, a password reset link has been sent. The link
          expires in 60 minutes and can only be used once.
        </p>
      </AuthCard>
    );
  }

  return (
    <AuthCard title="Forgot Password" subtitle="Enter your email to receive a reset link">
      <form className="space-y-6" onSubmit={handleSubmit}>
        <div className="space-y-2">
          <label htmlFor="email" className="block text-sm font-medium text-on-surface">
            Email Address
          </label>
          <input
            id="email"
            type="email"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            className="block w-full px-3 py-2.5 border border-outline-variant rounded-lg text-on-surface text-sm bg-surface-container-lowest focus:ring-2 focus:ring-primary focus:border-primary h-11"
          />
        </div>
        <button
          type="submit"
          className="w-full h-11 bg-primary text-on-primary text-sm font-medium rounded-lg"
        >
          Send reset link
        </button>
      </form>
    </AuthCard>
  );
}
