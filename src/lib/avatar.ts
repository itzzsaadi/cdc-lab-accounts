/** Pure helpers behind the initials-based Avatar (no external photos — approved decision, docs/UI_REQUIREMENTS.md §1/§22/§27). */

const PALETTE = [
  { bg: "var(--color-primary-container)", fg: "var(--color-on-primary-container)" },
  { bg: "var(--color-secondary-container)", fg: "var(--color-on-secondary-container)" },
  { bg: "var(--color-tertiary-container)", fg: "var(--color-on-tertiary-container)" },
] as const;

export function getInitials(fullName: string): string {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  const first = parts[0]!.charAt(0);
  const last = parts.length > 1 ? parts[parts.length - 1]!.charAt(0) : "";
  return (first + last).toUpperCase();
}

export function getAvatarColors(seed: string): { bg: string; fg: string } {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  }
  return PALETTE[hash % PALETTE.length]!;
}
