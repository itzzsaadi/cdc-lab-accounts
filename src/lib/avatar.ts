/** Pure helpers behind the initials-based Avatar (no external photos — approved decision, docs/UI_REQUIREMENTS.md §1/§22/§27). */

// Palette uses filled-role colors (primary/secondary/tertiary) which all
// meet WCAG AA contrast (≥4.5:1) against white text (on-primary/
// on-secondary/on-tertiary = #ffffff). The original *-container pairs
// were replaced because on-secondary-container (#48637d on #c3e0fe ≈ 3.0:1)
// and on-primary-container (#a3faef on #0f766e ≈ 3.0:1) both fall below
// the AA threshold for normal-sized text.
const PALETTE = [
  { bg: "var(--color-primary)", fg: "var(--color-on-primary)" },
  { bg: "var(--color-secondary)", fg: "var(--color-on-secondary)" },
  { bg: "var(--color-tertiary)", fg: "var(--color-on-tertiary)" },
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
