// app/login/page.tsx
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;

import Image from 'next/image';
import LoginButton from '@/components/LoginButton';

export default function LoginPage() {
  return (
    <main style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: 24 }}>
      <div style={{ width: 420, maxWidth: '90vw', border: '1px solid #eee', borderRadius: 12, padding: 24, textAlign: 'center' }}>

        <h1 style={{ margin: '8px 0 16px' }}>Sign in</h1>
        <p style={{ color: '#666', marginBottom: 16 }}>
          Use your GitHub account to continue.
        </p>
        <LoginButton />
      </div>
    </main>
  );
}
