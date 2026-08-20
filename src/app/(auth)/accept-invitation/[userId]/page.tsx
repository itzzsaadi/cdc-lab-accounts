"use client";

import { use, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AuthCard } from "../../../../components/layout/AuthCard";
import { acceptInvitationAction } from "../../../../server/actions/auth";

export default function AcceptInvitationPage({ params }: { params: Promise<{ userId: string }> }) {
  const { userId } = use(params);
  const searchParams = useSearchParams();
  const token = searchParams.get("token") ?? "";
  const router = useRouter();
  const [newPassword, setNewPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    const result = await acceptInvitationAction({ userId, token, newPassword });
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setDone(true);
  }

  if (done) {
    return (
      <AuthCard title="Account ready">
        <p className="text-sm text-on-surface-variant mb-4">
          Your password has been set. Please sign in to continue.
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
    <AuthCard title="Set your password" subtitle="Complete your CDC Lab Accounts System invitation">
      <form className="space-y-6" onSubmit={handleSubmit}>
        {error ? (
          <p role="alert" className="text-sm text-error bg-error-container/40 rounded-lg px-3 py-2">
            {error}
          </p>
        ) : null}
        <div className="space-y-2">
          <label htmlFor="newPassword" className="block text-sm font-medium text-on-surface">
            Choose a password
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
          Set password
        </button>
      </form>
    </AuthCard>
  );
}
