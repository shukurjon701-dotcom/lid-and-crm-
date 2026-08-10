"use server";

import { redirect } from "next/navigation";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { APP } from "@/config/app";
import { ROLE_HOME } from "@/lib/rbac";
import { createSession, destroySession, getSession, type SessionUser } from "@/lib/session";
import { findLocalAccount } from "@/server/auth/accounts";
import { findDbUserByLogin, isDatabaseReady } from "@/server/data/source";
import type { Role } from "@/types/domain";

const LoginSchema = z.object({
  login: z.string().min(2, "Введите логин"),
  password: z.string().min(4, "Введите пароль"),
});

export type LoginState = { error?: string };

export async function login(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const parsed = LoginSchema.safeParse({
    login: formData.get("login"),
    password: formData.get("password"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const { login: rawLogin, password } = parsed.data;

  // 1) База данных, если она поднята
  let candidate:
    | { id: string; login: string; fullName: string; role: Role; passwordHash: string }
    | null = null;

  if (await isDatabaseReady()) {
    candidate = await findDbUserByLogin(rawLogin);
  }

  // 2) Локальные учётные записи администраторов
  if (!candidate) {
    const local = findLocalAccount(rawLogin);
    if (local) {
      candidate = {
        id: local.id,
        login: local.login,
        fullName: local.fullName,
        role: local.role,
        passwordHash: local.passwordHash,
      };
    }
  }

  // Одинаковый текст для «нет такого логина» и «неверный пароль»,
  // чтобы перебором нельзя было узнать существующие учётки.
  const invalid = { error: "Неверный логин или пароль" };
  if (!candidate) return invalid;

  const ok = await bcrypt.compare(password, candidate.passwordHash);
  if (!ok) return invalid;

  const user: SessionUser = {
    id: candidate.id,
    login: candidate.login,
    fullName: candidate.fullName,
    role: candidate.role,
    branchId: APP.branch.id,
  };

  await createSession(user);
  redirect(ROLE_HOME[user.role]);
}

export async function logout() {
  await getSession();
  await destroySession();
  redirect("/login");
}
