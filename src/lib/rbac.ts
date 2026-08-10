import type { Role } from "@/types/domain";

/**
 * Матрица доступа. Один источник правды и для сайдбара, и для guard-ов
 * в server actions.
 *
 * BRANCH_ADMIN присутствует во всех правах: по требованию администратор
 * центра может делать всё. Ограниченные роли (оператор, бухгалтер,
 * преподаватель) остаются — они пригодятся, когда появятся сотрудники.
 */
export const PERMISSIONS = {
  // Дашборды
  "dashboard.shtab": ["OWNER", "BRANCH_ADMIN"],
  "dashboard.admin": ["OWNER", "BRANCH_ADMIN"],
  "dashboard.callcenter": ["OWNER", "BRANCH_ADMIN", "OPERATOR"],
  "dashboard.moliya": ["OWNER", "BRANCH_ADMIN", "ACCOUNTANT"],

  // Клиенты
  "leads.read": ["OWNER", "BRANCH_ADMIN", "OPERATOR"],
  "leads.write": ["OWNER", "BRANCH_ADMIN", "OPERATOR"],
  "leads.convert": ["OWNER", "BRANCH_ADMIN"],

  "students.read": ["OWNER", "BRANCH_ADMIN", "ACCOUNTANT", "TEACHER"],
  "students.write": ["OWNER", "BRANCH_ADMIN"],
  "students.freeze": ["OWNER", "BRANCH_ADMIN"],

  "groups.read": ["OWNER", "BRANCH_ADMIN", "TEACHER", "ACCOUNTANT"],
  "groups.write": ["OWNER", "BRANCH_ADMIN"],

  "attendance.read": ["OWNER", "BRANCH_ADMIN", "TEACHER"],
  "attendance.write": ["OWNER", "BRANCH_ADMIN", "TEACHER"],

  // Деньги
  "payments.read": ["OWNER", "BRANCH_ADMIN", "ACCOUNTANT"],
  "payments.write": ["OWNER", "BRANCH_ADMIN", "ACCOUNTANT"],
  "payments.void": ["OWNER", "BRANCH_ADMIN", "ACCOUNTANT"],

  "expenses.read": ["OWNER", "BRANCH_ADMIN", "ACCOUNTANT"],
  "expenses.write": ["OWNER", "BRANCH_ADMIN", "ACCOUNTANT"],
  "expenses.approve": ["OWNER", "BRANCH_ADMIN"],

  "debtors.read": ["OWNER", "BRANCH_ADMIN", "ACCOUNTANT"],

  // Администрирование
  "audit.read": ["OWNER", "BRANCH_ADMIN", "ACCOUNTANT"],
  "users.read": ["OWNER", "BRANCH_ADMIN"],
  "users.write": ["OWNER", "BRANCH_ADMIN"],
  "branches.read": ["OWNER", "BRANCH_ADMIN"],
  "branches.write": ["OWNER", "BRANCH_ADMIN"],

  // Мульти-филиальность (выключена, пока филиал один)
  "branch.switch": ["OWNER", "BRANCH_ADMIN"],
  "branch.viewAll": ["OWNER", "BRANCH_ADMIN"],
} as const satisfies Record<string, readonly Role[]>;

export type Permission = keyof typeof PERMISSIONS;

export function can(role: Role, permission: Permission): boolean {
  return (PERMISSIONS[permission] as readonly Role[]).includes(role);
}

export function assertCan(role: Role, permission: Permission): void {
  if (!can(role, permission)) {
    throw new Error(`FORBIDDEN: роль ${role} не имеет права "${permission}"`);
  }
}

export const ROLE_LABELS: Record<Role, string> = {
  OWNER: "Руководитель",
  BRANCH_ADMIN: "Администратор",
  OPERATOR: "Оператор Call-центра",
  ACCOUNTANT: "Бухгалтер",
  TEACHER: "Преподаватель",
};

export const ROLE_HOME: Record<Role, string> = {
  OWNER: "/shtab",
  BRANCH_ADMIN: "/shtab",
  OPERATOR: "/call-center",
  ACCOUNTANT: "/moliya",
  TEACHER: "/groups",
};
