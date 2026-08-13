import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/layout/app-shell";
import { CollapsedProvider } from "@/components/ui/collapsible";
import { NAV, type NavSectionView } from "@/config/nav";
import { COLLAPSED_COOKIE, parseCollapsed } from "@/lib/collapsed";
import { translator } from "@/lib/i18n";
import { getLang } from "@/lib/i18n-server";
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

  const lang = await getLang();
  const t = translator(lang);
  const ds = await getDataset();

  // Какие блоки сотрудник свернул — знаем до отрисовки, поэтому свёрнутое
  // не мелькает на экране при каждой загрузке страницы.
  const collapsed = parseCollapsed((await cookies()).get(COLLAPSED_COOKIE)?.value);

  // Меню собирается из прав роли — недоступные пункты не рендерятся вовсе,
  // и здесь же подписи переводятся на выбранный язык.
  const nav: NavSectionView[] = NAV.map((section) => ({
    title: t(section.title),
    items: section.items
      .filter((item) => can(session.role, item.permission))
      .map((item) => ({ label: t(item.label), href: item.href, icon: item.icon })),
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
      lang={lang}
      labels={{
        demo: t("header.demo"),
        refresh: t("header.refresh"),
        refreshing: t("header.refreshing"),
        checkIn: t("header.checkIn"),
        checkOut: t("header.checkOut"),
        logout: t("header.logout"),
        themeLight: t("header.themeLight"),
        themeDark: t("header.themeDark"),
      }}
    >
      <CollapsedProvider initial={collapsed}>{children}</CollapsedProvider>
    </AppShell>
  );
}
