"use client";

import {
  AlertTriangle,
  Banknote,
  Building2,
  CalendarCheck,
  ClipboardList,
  DoorOpen,
  GraduationCap,
  History,
  LayoutDashboard,
  PhoneCall,
  Receipt,
  Target,
  UserCog,
  Users,
  Wallet,
  type LucideIcon,
} from "lucide-react";

/** Явная карта вместо динамического импорта — так иконки попадают в бандл предсказуемо. */
const ICONS: Record<string, LucideIcon> = {
  AlertTriangle,
  Banknote,
  Building2,
  CalendarCheck,
  ClipboardList,
  DoorOpen,
  GraduationCap,
  History,
  LayoutDashboard,
  PhoneCall,
  Receipt,
  Target,
  UserCog,
  Users,
  Wallet,
};

export function NavIcon({
  name,
  className,
}: {
  name: string;
  className?: string;
}) {
  const Component = ICONS[name] ?? LayoutDashboard;
  return <Component className={className} strokeWidth={1.75} />;
}
