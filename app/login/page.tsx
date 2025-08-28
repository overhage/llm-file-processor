export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;

import { signIn } from '@/lib/auth';

export default function LoginPage() {
  async function doLogin() {
    'use server';
    await signIn('github');
  }

  return (
    <main style={{ padding: 24 }}>
      <h1>Sign in</h1>
      <form action={doLogin}>
        <button type="submit">Sign in with GitHub</button>
      </form>
    </main>
  );
}

