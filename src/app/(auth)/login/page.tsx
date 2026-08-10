"use client";

import { useActionState } from "react";
import { KeyRound, User } from "lucide-react";
import { APP } from "@/config/app";
import { login, type LoginState } from "@/server/actions/auth";

const initialState: LoginState = {};

export default function LoginPage() {
  const [state, formAction, pending] = useActionState(login, initialState);

  return (
    <main className="grid min-h-screen place-items-center bg-canvas p-4">
      <div className="rise w-full max-w-[380px]">
        <div className="mb-6 flex flex-col items-center text-center">
          <span className="grid size-12 place-items-center rounded-[15px] bg-accent text-[15px] font-extrabold text-accent-ink shadow-[var(--shadow-md)]">
            {APP.shortName}
          </span>
          <h1 className="mt-4 text-[22px] font-extrabold tracking-[-0.035em]">{APP.name}</h1>
          <p className="text-xs text-ink-3">
            {APP.branch.name} · управление учебным центром
          </p>
        </div>

        <form
          action={formAction}
          className="rounded-[var(--radius-card)] bg-surface p-7 shadow-[var(--shadow-lg)]"
        >
          <label className="mb-3 block">
            <span className="mb-1.5 block text-xs font-bold text-ink-2">Логин</span>
            <span className="relative block">
              <User
                className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-ink-3"
                strokeWidth={1.75}
              />
              <input
                name="login"
                autoComplete="username"
                autoFocus
                placeholder="admin1"
                className="w-full rounded-[var(--radius-control)] bg-surface-3 py-3 pr-3 pl-10 text-sm font-medium outline-none transition placeholder:text-ink-3 focus:bg-surface focus:shadow-[0_0_0_2px_var(--accent)]"
              />
            </span>
          </label>

          <label className="mb-4 block">
            <span className="mb-1.5 block text-xs font-bold text-ink-2">Пароль</span>
            <span className="relative block">
              <KeyRound
                className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-ink-3"
                strokeWidth={1.75}
              />
              <input
                name="password"
                type="password"
                autoComplete="current-password"
                placeholder="••••••••"
                className="w-full rounded-[var(--radius-control)] bg-surface-3 py-3 pr-3 pl-10 text-sm font-medium outline-none transition placeholder:text-ink-3 focus:bg-surface focus:shadow-[0_0_0_2px_var(--accent)]"
              />
            </span>
          </label>

          {state.error && (
            <p className="mb-3 rounded-[var(--radius-control)] bg-critical-wash px-3 py-2.5 text-xs font-medium text-critical-text">
              {state.error}
            </p>
          )}

          <button
            type="submit"
            disabled={pending}
            className="btn-primary w-full rounded-[var(--radius-control)] py-3 text-sm font-bold transition disabled:opacity-60"
          >
            {pending ? "Вход…" : "Войти"}
          </button>
        </form>

        <p className="mt-4 text-center text-[11px] leading-relaxed text-ink-3">
          Учётные записи администраторов: <b className="text-ink-2">admin1</b>,{" "}
          <b className="text-ink-2">admin2</b>, <b className="text-ink-2">admin3</b>
          <br />
          пароль — логин с суффиксом <b className="text-ink-2">-2026</b>
        </p>
      </div>
    </main>
  );
}
