'use client';

import Image from 'next/image';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { signOut } from 'next-auth/react';

function NavLink({
  href,
  children,
}: {
  href: string;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const isActive =
    pathname === href || (href !== '/' && pathname?.startsWith(href));
  return (
    <Link
      href={href}
      style={{
        textDecoration: isActive ? 'underline' : 'none',
        color: '#111',
        padding: '6px 8px',
        borderRadius: 6,
      }}
    >
      {children}
    </Link>
  );
}

export default function AppHeader() {
  return (
    <header
      style={{
        position: 'sticky',
        top: 0,
        zIndex: 10,
        background: '#fff',
        borderBottom: '1px solid #eee',
      }}
    >
      <div
        style={{
          maxWidth: 1200,
          margin: '0 auto',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 16,
          padding: '10px 16px',
        }}
      >
        {/* Left: logo + brand */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Image
            src="/taxis_owl_logo_800px.png"
            alt="TAXIS"
            width={36}
            height={36}
            priority
          />
          <strong style={{ fontSize: 18 }}>TAXIS</strong>
        </div>

        {/* Center: nav */}
        <nav
          aria-label="main"
          style={{ display: 'flex', alignItems: 'center', gap: 6 }}
        >
          <NavLink href="/jobs">Jobs</NavLink>
          <NavLink href="/upload">Upload</NavLink>
        </nav>

        {/* Right: logout */}
        <div>
          <button
            onClick={() => signOut({ callbackUrl: '/login' })}
            style={{
              border: '1px solid #ddd',
              padding: '6px 10px',
              borderRadius: 8,
              background: '#fff',
              cursor: 'pointer',
            }}
            aria-label="Log out"
            title="Log out"
          >
            Log out
          </button>
        </div>
      </div>
    </header>
  );
}
