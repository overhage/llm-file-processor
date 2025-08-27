// lib/env.ts
export function requiredEnv(name: string): string {
  const v = process.env[name as keyof NodeJS.ProcessEnv];
  if (!v || !String(v).trim()) throw new Error(`Missing required env var: ${name}`);
  return String(v).trim();
}
