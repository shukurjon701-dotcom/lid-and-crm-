import type { Permission } from "@/lib/rbac";
import type { Key } from "@/lib/i18n";

export type NavItem = {
  /** Ключ словаря — подпись подставляется на языке пользователя */
  label: Key;
  href: string;
  icon: string; // имя иконки lucide-react
  permission: Permission;
};

export type NavSection = { title: Key; items: NavItem[] };

/** То же меню, но уже переведённое — в таком виде уходит в интерфейс */
export type NavSectionView = {
  title: string;
  items: { label: string; href: string; icon: string }[];
};

export const NAV: NavSection[] = [
  {
    title: "nav.mine",
    items: [{ label: "nav.myResults", href: "/me", icon: "Award", permission: "dashboard.me" }],
  },
  {
    title: "nav.dashboards",
    items: [
      { label: "nav.overview", href: "/shtab", icon: "LayoutDashboard", permission: "dashboard.shtab" },
      { label: "nav.admin", href: "/admin", icon: "ClipboardList", permission: "dashboard.admin" },
      { label: "nav.callcenter", href: "/call-center", icon: "PhoneCall", permission: "dashboard.callcenter" },
      { label: "nav.finance", href: "/moliya", icon: "Wallet", permission: "dashboard.moliya" },
    ],
  },
  {
    title: "nav.clients",
    items: [
      { label: "nav.leads", href: "/leads", icon: "Target", permission: "leads.read" },
      { label: "nav.visits", href: "/visits", icon: "DoorOpen", permission: "leads.read" },
      { label: "nav.students", href: "/students", icon: "Users", permission: "students.read" },
      { label: "nav.groups", href: "/groups", icon: "GraduationCap", permission: "groups.read" },
      { label: "nav.attendance", href: "/attendance", icon: "CalendarCheck", permission: "attendance.read" },
    ],
  },
  {
    title: "nav.money",
    items: [
      { label: "nav.payments", href: "/payments", icon: "Banknote", permission: "payments.read" },
      { label: "nav.expenses", href: "/expenses", icon: "Receipt", permission: "expenses.read" },
      { label: "nav.debtors", href: "/debtors", icon: "AlertTriangle", permission: "debtors.read" },
      { label: "nav.books", href: "/books", icon: "BookOpen", permission: "books.read" },
    ],
  },
  {
    title: "nav.manage",
    items: [
      { label: "nav.staff", href: "/users", icon: "UserCog", permission: "users.read" },
      { label: "nav.audit", href: "/audit", icon: "History", permission: "audit.read" },
    ],
  },
];
