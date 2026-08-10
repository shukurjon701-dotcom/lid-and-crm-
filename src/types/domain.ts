/**
 * Доменные типы приложения.
 * Дублируют enum-ы из prisma/schema.prisma намеренно: UI не должен зависеть
 * от сгенерированного Prisma-клиента, чтобы приложение запускалось без БД.
 */

export type Role = "OWNER" | "BRANCH_ADMIN" | "OPERATOR" | "ACCOUNTANT" | "TEACHER";

export type LeadStatus =
  | "NEW"
  | "IN_PROGRESS"
  | "NO_ANSWER"
  | "VISIT_PLANNED"
  | "VISITED"
  | "CONVERTED"
  | "REJECTED"
  | "LOST";

export type LeadSource =
  | "INSTAGRAM"
  | "TELEGRAM"
  | "FACEBOOK"
  | "TIKTOK"
  | "WEBSITE"
  | "REFERRAL"
  | "WALK_IN"
  | "INBOUND_CALL"
  | "OTHER";

export type StudentStatus = "ACTIVE" | "FROZEN" | "LEFT" | "GRADUATED";
export type SaleChannel = "ONLINE" | "OFFLINE";
export type PaymentMethod = "CASH" | "CARD" | "TERMINAL" | "TRANSFER";
export type AttendanceStatus = "PRESENT" | "ABSENT" | "LATE" | "EXCUSED";

export type AuditAction =
  | "CREATE"
  | "UPDATE"
  | "DELETE"
  | "STATUS_CHANGE"
  | "LOGIN"
  | "LOGOUT"
  | "CHECK_IN"
  | "CHECK_OUT"
  | "CONVERT"
  | "PAYMENT_CREATE"
  | "PAYMENT_DELETE"
  | "EXPENSE_CREATE"
  | "EXPENSE_DELETE"
  | "FREEZE"
  | "UNFREEZE"
  | "DEBT_OPENED"
  | "DEBT_CLOSED"
  | "EXPORT"
  | "PERMISSION_CHANGE";

export const LEAD_STATUS_LABELS: Record<LeadStatus, string> = {
  NEW: "Новый",
  IN_PROGRESS: "В работе",
  NO_ANSWER: "Не дозвонились",
  VISIT_PLANNED: "Записан на визит",
  VISITED: "Пришёл в офис",
  CONVERTED: "Стал учеником",
  REJECTED: "Отказ",
  LOST: "Потерян",
};

export const SOURCE_LABELS: Record<LeadSource, string> = {
  INSTAGRAM: "Instagram",
  TELEGRAM: "Telegram",
  FACEBOOK: "Facebook",
  TIKTOK: "TikTok",
  WEBSITE: "Сайт",
  REFERRAL: "Сарафан",
  WALK_IN: "Пришёл сам",
  INBOUND_CALL: "Входящий звонок",
  OTHER: "Другое",
};

export const METHOD_LABELS: Record<PaymentMethod, { ru: string; uz: string }> = {
  CASH: { ru: "Наличные", uz: "Naqd" },
  TERMINAL: { ru: "Терминал", uz: "Terminal" },
  CARD: { ru: "Карта", uz: "Kart" },
  TRANSFER: { ru: "Перевод", uz: "O'tkazma" },
};
