"use client";

import { use, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AuthCard } from "../../../../components/layout/AuthCard";
import { Button } from "../../../../components/ui/Button";
import { TextInput } from "../../../../components/ui/TextInput";
import { Alert } from "../../../../components/ui/Alert";
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
        <p className="text-on-surface-variant mb-4 text-sm">
          Your password has been set. Please sign in to continue.
        </p>
        <Button onClick={() => router.push("/sign-in")} className="w-full">
          Go to Sign In
        </Button>
      </AuthCard>
    );
  }

  return (
    <AuthCard title="Set your password" subtitle="Complete your CDC Lab Accounts System invitation">
      <form className="space-y-6" onSubmit={handleSubmit}>
        {error ? <Alert variant="error">{error}</Alert> : null}
        <TextInput
          id="newPassword"
          label="Choose a password"
          type="password"
          required
          minLength={12}
          value={newPassword}
          onChange={(event) => setNewPassword(event.target.value)}
        />
        <Button type="submit" className="w-full">
          Set password
        </Button>
      </form>
    </AuthCard>
  );
}
