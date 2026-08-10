import { cookies } from "next/headers";
import { jwtVerify, SignJWT } from "jose";
import { APP } from "@/config/app";
import type { Role } from "@/types/domain";

export const SESSION_COOKIE = "lid_session";
const MAX_AGE_SECONDS = 60 * 60 * 12; // рабочая смена

export type SessionUser = {
  id: string;
  login: string;
  fullName: string;
  role: Role;
  branchId: string;
};

function secret() {
  const value = process.env.AUTH_SECRET || "lid-crm-dev-secret-change-me";
  return new TextEncoder().encode(value);
}

export async function createSession(user: SessionUser) {
  const token = await new SignJWT({ ...user })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${MAX_AGE_SECONDS}s`)
    .sign(secret());

  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: MAX_AGE_SECONDS,
  });
}

export async function destroySession() {
  (await cookies()).delete(SESSION_COOKIE);
}

export async function getSession(): Promise<SessionUser | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;

  try {
    const { payload } = await jwtVerify(token, secret());
    return {
      id: payload.id as string,
      login: payload.login as string,
      fullName: payload.fullName as string,
      role: payload.role as Role,
      branchId: (payload.branchId as string) ?? APP.branch.id,
    };
  } catch {
    return null; // просроченный или подделанный токен
  }
}

export async function requireSession(): Promise<SessionUser> {
  const session = await getSession();
  if (!session) throw new Error("UNAUTHORIZED");
  return session;
}
