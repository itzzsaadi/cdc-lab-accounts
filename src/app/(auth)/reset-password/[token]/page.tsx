"use client";

import { use, useState } from "react";
import { useRouter } from "next/navigation";
import { AuthCard } from "../../../../components/layout/AuthCard";
import { resetPasswordAction } from "../../../../server/actions/auth";

export default function ResetPasswordPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params);
  const router = useRouter();
  const [newPassword, setNewPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    const result = await resetPasswordAction({ token, newPassword });
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setDone(true);
  }

  if (done) {
    return (
      <AuthCard title="Password updated">
        <p className="text-sm text-on-surface-variant mb-4">
          Your password has been changed. Please sign in with your new password.
        </p>
        <button
          onClick={() => router.push("/sign-in")}
          className="w-full h-11 bg-primary text-on-primary text-sm font-medium rounded-lg"
        >
          Go to Sign In
        </button>
      </AuthCard>
    );
  }

  return (
    <AuthCard title="Reset Password">
      <form className="space-y-6" onSubmit={handleSubmit}>
        {error ? (
          <p role="alert" className="text-sm text-error bg-error-container/40 rounded-lg px-3 py-2">
            {error}
          </p>
        ) : null}
        <div className="space-y-2">
          <label htmlFor="newPassword" className="block text-sm font-medium text-on-surface">
            New Password
          </label>
          <input
            id="newPassword"
            type="password"
            required
            minLength={12}
            value={newPassword}
            onChange={(event) => setNewPassword(event.target.value)}
            className="block w-full px-3 py-2.5 border border-outline-variant rounded-lg text-on-surface text-sm bg-surface-container-lowest focus:ring-2 focus:ring-primary focus:border-primary h-11"
          />
        </div>
        <button
          type="submit"
          className="w-full h-11 bg-primary text-on-primary text-sm font-medium rounded-lg"
        >
          Set new password
        </button>
      </form>
    </AuthCard>
  );
}
