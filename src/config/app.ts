/**
 * Настройки центра. Один филиал — но branchId остаётся в схеме БД,
 * поэтому добавить второй филиал позже можно без миграции данных:
 * достаточно поставить singleBranch: false и вернуть переключатель в шапку.
 */
export const APP = {
  name: "LID CRM",
  shortName: "LC",
  singleBranch: true,
  branch: {
    id: "branch-main",
    name: "Asosiy filial",
    code: "MAIN",
    city: "Toshkent",
  },
  currency: "сум",
  locale: "ru-RU",
  /** Рабочий день сотрудника, часов — база для прогресса смены */
  workDayHours: 8,
} as const;
