// lib/auth.ts
import type { NextAuthOptions } from "next-auth";
import GitHub from "next-auth/providers/github";
import { prisma } from "./db";

export const authOptions: NextAuthOptions = {
  secret: process.env.AUTH_SECRET,
  session: { strategy: "jwt" },

  providers: [
    GitHub({
      clientId: process.env.GITHUB_ID ?? "",
      clientSecret: process.env.GITHUB_SECRET ?? "",
      allowDangerousEmailAccountLinking: true,
    }),
  ],

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

        await prisma.user.upsert({
          where: { email },
          create: { email, role },
          update: { role },
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
        if (email) {
          const u = await prisma.user.findUnique({
            where: { email },
            select: { id: true, role: true },
          });
          if (u) {
            (session.user as any).id = u.id;
            (session.user as any).role = u.role;
          }
        }
      } catch (e) {
        console.error("NextAuth session callback error:", e);
      }
      return session;
    },
  },

  // optional, so redirects go here
  pages: { signIn: "/login" },
};
