import { getInitials, getAvatarColors } from "../../lib/avatar";

/** Neutral initials-based avatar — no external photo of any kind (approved decision, docs/UI_REQUIREMENTS.md §1/§22/§27). */
export function Avatar({ fullName, size = 32 }: { fullName: string; size?: number }) {
  const initials = getInitials(fullName);
  const { bg, fg } = getAvatarColors(fullName);
  return (
    <span
      role="img"
      aria-label={`${fullName} avatar`}
      className="rounded-pill inline-flex shrink-0 items-center justify-center font-semibold"
      style={{ width: size, height: size, backgroundColor: bg, color: fg, fontSize: size * 0.4 }}
    >
      {initials}
    </span>
  );
}
