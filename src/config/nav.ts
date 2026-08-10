import type { Permission } from "@/lib/rbac";

export type NavItem = {
  label: string;
  hint?: string; // подпись на узбекском, как в ТЗ
  href: string;
  icon: string; // имя иконки lucide-react
  permission: Permission;
};

export type NavSection = { title: string; items: NavItem[] };

export const NAV: NavSection[] = [
  {
    title: "Дашборды",
    items: [
      { label: "Обзор", hint: "Shtab", href: "/shtab", icon: "LayoutDashboard", permission: "dashboard.shtab" },
      { label: "Администратор", hint: "Admin", href: "/admin", icon: "ClipboardList", permission: "dashboard.admin" },
      { label: "Call-центр", hint: "Call Centr", href: "/call-center", icon: "PhoneCall", permission: "dashboard.callcenter" },
      { label: "Финансы", hint: "Moliya", href: "/moliya", icon: "Wallet", permission: "dashboard.moliya" },
    ],
  },
  {
    title: "Клиенты",
    items: [
      { label: "Лиды", hint: "Lidlar", href: "/leads", icon: "Target", permission: "leads.read" },
      { label: "Визиты", hint: "Tashriflar", href: "/visits", icon: "DoorOpen", permission: "leads.read" },
      { label: "Ученики", hint: "O'quvchilar", href: "/students", icon: "Users", permission: "students.read" },
      { label: "Группы", hint: "Guruhlar", href: "/groups", icon: "GraduationCap", permission: "groups.read" },
      { label: "Посещаемость", hint: "Davomat", href: "/attendance", icon: "CalendarCheck", permission: "attendance.read" },
    ],
  },
  {
    title: "Деньги",
    items: [
      { label: "Платежи", hint: "To'lovlar", href: "/payments", icon: "Banknote", permission: "payments.read" },
      { label: "Расходы", hint: "Rasxod", href: "/expenses", icon: "Receipt", permission: "expenses.read" },
      { label: "Должники", hint: "Qarzdorlar", href: "/debtors", icon: "AlertTriangle", permission: "debtors.read" },
    ],
  },
  {
    title: "Управление",
    items: [
      { label: "Сотрудники", hint: "Xodimlar", href: "/users", icon: "UserCog", permission: "users.read" },
      { label: "История изменений", hint: "Audit", href: "/audit", icon: "History", permission: "audit.read" },
    ],
  },
];
