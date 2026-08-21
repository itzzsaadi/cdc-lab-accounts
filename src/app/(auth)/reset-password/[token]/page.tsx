"use client";

import { use, useState } from "react";
import { useRouter } from "next/navigation";
import { AuthCard } from "../../../../components/layout/AuthCard";
import { Button } from "../../../../components/ui/Button";
import { TextInput } from "../../../../components/ui/TextInput";
import { Alert } from "../../../../components/ui/Alert";
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
        <p className="text-on-surface-variant mb-4 text-sm">
          Your password has been changed. Please sign in with your new password.
        </p>
        <Button onClick={() => router.push("/sign-in")} className="w-full">
          Go to Sign In
        </Button>
      </AuthCard>
    );
  }

  return (
    <AuthCard title="Reset Password">
      <form className="space-y-6" onSubmit={handleSubmit}>
        {error ? <Alert variant="error">{error}</Alert> : null}
        <TextInput
          id="newPassword"
          label="New Password"
          type="password"
          required
          minLength={12}
          value={newPassword}
          onChange={(event) => setNewPassword(event.target.value)}
        />
        <Button type="submit" className="w-full">
          Set new password
        </Button>
      </form>
    </AuthCard>
  );
}
