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

// ============================================================== РЕГИСТРАЦИЯ
const RegisterSchema = z
  .object({
    fullName: z.string().min(3, "Выберите своё имя из списка"),
    login: z
      .string()
      .min(3, "Логин — минимум 3 символа")
      .regex(/^[a-z0-9._-]+$/i, "Логин: только латиница, цифры, точка и дефис"),
    password: z.string().min(6, "Пароль — минимум 6 символов"),
    password2: z.string(),
  })
  .refine((v) => v.password === v.password2, {
    message: "Пароли не совпадают",
    path: ["password2"],
  });

export type RegisterState = { error?: string; ok?: string };

/**
 * Сотрудник не создаёт новую запись, а забирает свою — ту, что уже пришла
 * из Sahab или Bitrix. Поэтому регистрация возможна только для человека,
 * который есть в системе и ещё не заводил себе вход.
 */
export async function register(
  _prev: RegisterState,
  formData: FormData
): Promise<RegisterState> {
  const parsed = RegisterSchema.safeParse({
    fullName: formData.get("fullName"),
    login: formData.get("login"),
    password: formData.get("password"),
    password2: formData.get("password2"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const { fullName, login, password } = parsed.data;
  const cleanLogin = login.trim().toLowerCase();

  const prisma = await getPrismaOrNull();
  if (!prisma) return { error: "База недоступна, попробуйте позже" };

  const staff = await prisma.user.findFirst({
    where: { fullName: { equals: fullName.trim(), mode: "insensitive" } },
  });

  if (!staff) {
    return {
      error: "Такого сотрудника нет в системе. Выберите имя из подсказки или обратитесь к администратору",
    };
  }

  // «!» вместо хеша ставится при загрузке из Bitrix — вход ещё не заводили
  if (staff.passwordHash !== "!") {
    return { error: "Для этого сотрудника вход уже создан. Если это вы — просто войдите" };
  }

  const taken = await prisma.user.findUnique({ where: { login: cleanLogin } });
  if (taken) return { error: "Такой логин уже занят, придумайте другой" };

  await prisma.user.update({
    where: { id: staff.id },
    data: {
      login: cleanLogin,
      passwordHash: await bcrypt.hash(password, 10),
      isActive: true,
    },
  });

  await prisma.auditLog.create({
    data: {
      branchId: staff.branchId,
      actorId: staff.id,
      actorRole: staff.role,
      actorName: staff.fullName,
      action: "CREATE",
      entity: "User",
      entityId: staff.id,
      entityLabel: `${staff.fullName} — создан вход «${cleanLogin}»`,
      reason: "Сотрудник зарегистрировался сам",
    },
  });

  return { ok: `Готово. Теперь входите: логин ${cleanLogin}` };
}

/** Prisma нужна только здесь и только если база поднята. */
async function getPrismaOrNull() {
  try {
    if (!(await isDatabaseReady())) return null;
    const mod = await import("@/lib/prisma");
    return mod.prisma;
  } catch {
    return null;
  }
}
