"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { KeyRound, User, UserCheck } from "lucide-react";
import { register, type RegisterState } from "@/server/actions/auth";

const initialState: RegisterState = {};

const field =
  "w-full rounded-[var(--radius-control)] bg-surface-3 py-3 pr-3 pl-10 text-sm font-medium outline-none transition placeholder:text-ink-3 focus:bg-surface focus:shadow-[0_0_0_2px_var(--accent)]";

export function RegisterForm({ names }: { names: string[] }) {
  const [state, formAction, pending] = useActionState(register, initialState);
  const [name, setName] = useState("");

  // Пока человек печатает — показываем совпадения, чтобы имя совпало точь-в-точь
  const query = name.trim().toLowerCase();
  const matches =
    query.length >= 2
      ? names.filter((n) => n.toLowerCase().includes(query)).slice(0, 6)
      : [];
  const exact = names.some((n) => n.toLowerCase() === query);

  if (state.ok) {
    return (
      <div className="card-shadow rounded-[var(--radius-card)] bg-surface p-7 text-center">
        <span className="mx-auto grid size-12 place-items-center rounded-full bg-fresh-bg text-fresh">
          <UserCheck className="size-6" strokeWidth={2.2} />
        </span>
        <p className="mt-4 text-[15px] font-bold">{state.ok}</p>
        <Link
          href="/login"
          className="btn-primary mt-5 inline-block rounded-[var(--radius-control)] px-5 py-2.5 text-sm font-bold"
        >
          Войти
        </Link>
      </div>
    );
  }

  return (
    <form action={formAction} className="card-shadow rounded-[var(--radius-card)] bg-surface p-7">
      <label className="mb-1 block">
        <span className="mb-1.5 block text-xs font-bold text-ink-2">Ваше имя</span>
        <span className="relative block">
          <User
            className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-ink-3"
            strokeWidth={1.75}
          />
          <input
            name="fullName"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoComplete="off"
            placeholder="Начните печатать фамилию"
            className={field}
          />
        </span>
      </label>

      {/* Подсказка: имя должно совпасть с тем, что пришло из Sahab или Bitrix */}
      <div className="mb-4 min-h-[24px]">
        {matches.length > 0 && !exact && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {matches.map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => setName(n)}
                className="rounded-full bg-accent-soft px-2.5 py-1 text-[11px] font-bold text-accent transition hover:brightness-95"
              >
                {n}
              </button>
            ))}
          </div>
        )}
        {exact && (
          <p className="mt-2 text-[11px] font-bold text-fresh">Нашли вас в системе</p>
        )}
        {query.length >= 2 && matches.length === 0 && (
          <p className="mt-2 text-[11px] text-ink-3">
            Не нашли такого сотрудника — проверьте написание или обратитесь к администратору
          </p>
        )}
      </div>

      <label className="mb-3 block">
        <span className="mb-1.5 block text-xs font-bold text-ink-2">Придумайте логин</span>
        <span className="relative block">
          <User
            className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-ink-3"
            strokeWidth={1.75}
          />
          <input name="login" autoComplete="username" placeholder="nodira" className={field} />
        </span>
      </label>

      <label className="mb-3 block">
        <span className="mb-1.5 block text-xs font-bold text-ink-2">Пароль</span>
        <span className="relative block">
          <KeyRound
            className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-ink-3"
            strokeWidth={1.75}
          />
          <input
            name="password"
            type="password"
            autoComplete="new-password"
            placeholder="минимум 6 символов"
            className={field}
          />
        </span>
      </label>

      <label className="mb-4 block">
        <span className="mb-1.5 block text-xs font-bold text-ink-2">Пароль ещё раз</span>
        <span className="relative block">
          <KeyRound
            className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-ink-3"
            strokeWidth={1.75}
          />
          <input name="password2" type="password" autoComplete="new-password" className={field} />
        </span>
      </label>

      {state.error && (
        <p className="mb-3 rounded-[var(--radius-control)] bg-hot-bg px-3 py-2.5 text-xs font-medium text-hot">
          {state.error}
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="btn-primary w-full rounded-[var(--radius-control)] py-3 text-sm font-bold transition disabled:opacity-60"
      >
        {pending ? "Создаём…" : "Зарегистрироваться"}
      </button>
    </form>
  );
}
