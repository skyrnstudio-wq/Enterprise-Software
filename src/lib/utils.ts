/**
 * Merge conditional class names. Kept dependency-free until the component
 * layer grows; swap the implementation without touching call sites if a
 * richer merger (clsx + tailwind-merge) becomes warranted.
 */
export function cn(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}
