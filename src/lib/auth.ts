import NextAuth, { type DefaultSession } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "@/lib/db";
import type { Role } from "@prisma/client";
import {
  clearLoginFailures,
  isLoginLocked,
  recordLoginFailure,
} from "@/lib/login-throttle";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      role: Role;
      department: string;
    } & DefaultSession["user"];
  }

  interface User {
    role: Role;
    department: string;
  }
}

type AppToken = {
  userId?: string;
  role?: Role;
  department?: string;
  [key: string]: unknown;
};

const credentialsSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export const { handlers, auth, signIn, signOut } = NextAuth({
  session: { strategy: "jwt" },
  pages: { signIn: "/login" },
  trustHost: true,
  providers: [
    Credentials({
      name: "Credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(raw) {
        const parsed = credentialsSchema.safeParse(raw);
        if (!parsed.success) return null;

        const email = parsed.data.email;

        // Cheap lockout check before bcrypt so attackers can't burn CPU.
        // The bucket clears after a successful login or window rollover.
        if (isLoginLocked(email)) {
          recordLoginFailure(email); // extend lockout while it's hot
          return null;
        }

        const user = await prisma.user.findUnique({ where: { email } });
        if (!user || !user.active || !user.passwordHash) {
          recordLoginFailure(email);
          return null;
        }

        const ok = await bcrypt.compare(parsed.data.password, user.passwordHash);
        if (!ok) {
          recordLoginFailure(email);
          return null;
        }

        clearLoginFailures(email);
        return {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
          department: user.department,
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      const t = token as AppToken;
      if (user) {
        t.userId = user.id;
        t.role = user.role;
        t.department = user.department;
      }
      return t;
    },
    async session({ session, token }) {
      const t = token as AppToken;
      if (t.userId && t.role && t.department) {
        session.user.id = t.userId;
        session.user.role = t.role;
        session.user.department = t.department;
      }
      return session;
    },
  },
});
