import { sendEmail } from "./transport";

/** Templates never include the raw token in log-visible text — only the caller's `sendEmail` call carries it, straight into the transport (SMTP wire or the git-ignored dev file sink). */

export async function sendInvitationEmail(to: string, url: string): Promise<void> {
  await sendEmail({
    to,
    subject: "You've been invited to CDC Lab Accounts System",
    text: `You've been invited to join CDC Lab Accounts System.\n\nSet your password to accept the invitation:\n${url}\n\nThis link expires in 72 hours and can only be used once.\n\nIf you weren't expecting this invitation, you can ignore this email.`,
  });
}

export async function sendPasswordResetEmail(to: string, url: string): Promise<void> {
  await sendEmail({
    to,
    subject: "Reset your CDC Lab Accounts System password",
    text: `A password reset was requested for this account.\n\nReset your password:\n${url}\n\nThis link expires in 60 minutes and can only be used once.\n\nIf you didn't request this, you can ignore this email — your password will not be changed.`,
  });
}
