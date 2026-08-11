import Link from "next/link";
import { APP } from "@/config/app";
import { getDataset } from "@/server/data/source";
import { RegisterForm } from "./register-form";

export const dynamic = "force-dynamic";

export default async function RegisterPage() {
  const ds = await getDataset();

  // Подсказываем только тех, кто ещё не заводил вход: остальные уже с логином
  const names = [...new Set(ds.staff.map((s) => s.fullName))]
    .filter((name) => name && name !== ".")
    .sort((a, b) => a.localeCompare(b, "ru"));

  return (
    <main className="grid min-h-screen place-items-center bg-canvas p-4">
      <div className="rise w-full max-w-[420px]">
        <div className="mb-6 flex flex-col items-center text-center">
          <span className="grid size-12 place-items-center rounded-[15px] bg-accent text-[15px] font-extrabold text-accent-ink">
            {APP.shortName}
          </span>
          <h1 className="mt-4 text-[22px] font-extrabold tracking-[-0.035em]">
            Регистрация сотрудника
          </h1>
          <p className="mt-1 max-w-[34ch] text-xs text-ink-3">
            Найдите себя в списке и придумайте логин с паролем — после этого
            увидите свои результаты
          </p>
        </div>

        <RegisterForm names={names} />

        <p className="mt-4 text-center text-xs text-ink-3">
          Уже зарегистрировались?{" "}
          <Link href="/login" className="font-bold text-accent hover:underline">
            Войти
          </Link>
        </p>
      </div>
    </main>
  );
}
