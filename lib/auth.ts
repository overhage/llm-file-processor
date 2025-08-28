// lib/auth.ts
import NextAuth from "next-auth";
import GitHub from "next-auth/providers/github";
import { prisma } from "./db";

export const {
  handlers,  // { GET, POST }
  auth,      // get server session
  signIn,    // server action helpers
  signOut,
} = NextAuth({
  secret: process.env.AUTH_SECRET,
  providers: [
    GitHub({
      clientId: process.env.GITHUB_ID ?? "",
      clientSecret: process.env.GITHUB_SECRET ?? "",
      // helps if a user changes primary email on GitHub
      allowDangerousEmailAccountLinking: true,
    }),
  ],

  // We’ll use JWT sessions (default). Keep our own User table in sync:
  callbacks: {
    async signIn({ user }) {
      try {
        const email = user.email?.toLowerCase();
        if (!email) return false;

        const adminEmails = (process.env.ADMIN_EMAILS ?? "")
          .toLowerCase()
          .split(",")
          .map(s => s.trim())
          .filter(Boolean);

        const role = adminEmails.includes(email) ? "manager" : "user";

        // Ensure a row exists in your own User table:
        await prisma.user.upsert({
          where: { email },
          create: { email, role },
          update: { role }, // optional: keep role synced with ADMIN_EMAILS
        });

        return true;
      } catch (e) {
        console.error("NextAuth signIn upsert failed:", e);
        return false;
      }
    },

    async session({ session }) {
      try {
        const email = session.user?.email?.toLowerCase();
        if (!email) return session;

        const u = await prisma.user.findUnique({
          where: { email },
          select: { id: true, role: true },
        });

        if (u) {
          (session.user as any).id = u.id;
          (session.user as any).role = u.role;
        }
      } catch (e) {
        console.error("NextAuth session callback error:", e);
      }
      return session;
    },
  },
});
