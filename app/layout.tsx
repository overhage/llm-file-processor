// app/layout.tsx
import './globals.css'

import AppHeader from '@/components/AppHeader'

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-white">
        <AppHeader />
        {/* If header is fixed, add top padding so content isn't hidden */}
        <main className="pt-16">{children}</main>
      </body>
    </html>
  )
}
