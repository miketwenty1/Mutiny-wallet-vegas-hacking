/** API prefix: `/api` in production (nginx proxy), `/api` in dev (Vite proxy). */
export function apiBase(): string {
  const b = import.meta.env.VITE_API_BASE;
  if (b && b.length > 0) return b.replace(/\/$/, "");
  return "/api";
}
