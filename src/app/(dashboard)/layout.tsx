import { redirect } from "next/navigation";
import { AppShell } from "@/components/layout/app-shell";
import { NAV } from "@/config/nav";
import { can, ROLE_LABELS } from "@/lib/rbac";
import { getSession } from "@/lib/session";
import { getDataset } from "@/server/data/source";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSession();
  if (!session) redirect("/login");

  // Меню собирается из прав роли — недоступные пункты не рендерятся вовсе.
  const ds = await getDataset();

  const nav = NAV.map((section) => ({
    ...section,
    items: section.items.filter((item) => can(session.role, item.permission)),
  })).filter((section) => section.items.length > 0);

  return (
    <AppShell
      user={{
        fullName: session.fullName,
        login: session.login,
        roleLabel: ROLE_LABELS[session.role],
      }}
      nav={nav}
      isDemo={ds.isDemo}
      lastCallAt={ds.lastCallAt ? ds.lastCallAt.toISOString() : null}
      canRefresh={can(session.role, "dashboard.callcenter")}
    >
      {children}
    </AppShell>
  );
}
