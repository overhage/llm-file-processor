// app/(site)/layout.tsx
import type { ReactNode } from 'react';
import AppHeader from '../../components/AppHeader'; // use relative path if you don’t have "@/"

export default function SiteLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <AppHeader />
      {children}
    </>
  );
}
