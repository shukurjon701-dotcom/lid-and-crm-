import "server-only";
import type { Role } from "@/types/domain";

/**
 * Локальные учётные записи администраторов.
 *
 * Работают без базы данных — чтобы система была доступна сразу.
 * Ровно те же логины и пароли создаёт `prisma/seed.ts`, поэтому после
 * подключения Postgres вход не изменится: сначала ищем пользователя в БД,
 * при её отсутствии — здесь.
 *
 * Сменить пароль: сгенерировать хеш и заменить строку ниже —
 *   node -e "console.log(require('bcryptjs').hashSync('новый-пароль',10))"
 */
export type LocalAccount = {
  id: string;
  login: string;
  fullName: string;
  role: Role;
  passwordHash: string;
  /** Открытый пароль хранится только для подсказки на странице входа в demo-режиме */
  demoPassword: string;
};

export const LOCAL_ACCOUNTS: LocalAccount[] = [
  {
    id: "user-admin-1",
    login: "admin1",
    fullName: "Администратор 1",
    role: "BRANCH_ADMIN",
    passwordHash: "$2a$10$DlTDzHxuRXLdNIMV4QF2Q..jsiWyZwdQWJRYZ8eHKDLuJ39Wkwv7y",
    demoPassword: "admin1-2026",
  },
  {
    id: "user-admin-2",
    login: "admin2",
    fullName: "Администратор 2",
    role: "BRANCH_ADMIN",
    passwordHash: "$2a$10$bkH9Xse8Q/AHTw6wxBLMQug8SScPVQcmr9YiCiA.kfhKyVj.Gz9VO",
    demoPassword: "admin2-2026",
  },
  {
    id: "user-admin-3",
    login: "admin3",
    fullName: "Администратор 3",
    role: "BRANCH_ADMIN",
    passwordHash: "$2a$10$rPIR6rnr38sPLuX1tgBQ3eam5IReE.hLJkQEsOUaT3efdcpmOPjIq",
    demoPassword: "admin3-2026",
  },
];

export function findLocalAccount(login: string): LocalAccount | undefined {
  const normalized = login.trim().toLowerCase();
  return LOCAL_ACCOUNTS.find((a) => a.login === normalized);
}
