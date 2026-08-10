/**
 * Подключение к CRM Sahab (https://arabicacademy.sahab.uz).
 *
 *   npm run import:sahab -- --explore   # войти и показать, какие данные отдаёт API
 *   npm run import:sahab                # перенести в базу (после --explore)
 *
 * Учётные данные служебного аккаунта берутся из .env и никуда больше не попадают:
 *   SAHAB_PHONE="+998901234567"
 *   SAHAB_PASSWORD="..."
 *
 * Аккаунт нужен отдельный, с правами только на чтение — не личный.
 */
/** Базовый адрес API Sahab. Вход: POST /accounts/login/ {phone_number, password} */
const API = "https://api.sahab.uz/api/v1";

/**
 * Sahab обслуживает много учебных центров на одном API: без заголовка
 * x-tenant-domain любой запрос возвращает 404.
 */
const TENANT = process.env.SAHAB_DOMAIN || "arabicacademy.sahab.uz";

const baseHeaders = {
  "Content-Type": "application/json",
  "x-tenant-domain": TENANT,
};

const EXPLORE = process.argv.includes("--explore");

/** Разделы, из которых берём данные. */
const ENDPOINTS = {
  profile: "/accounts/profile/",
  branches: "/accounts/branches/",
  dashboard: "/management/dashboard/",
  branchBreakdown: "/management/dashboard/branch-breakdown/",
  students: "/management/students/",
  groups: "/management/groups/",
  payments: "/finance/payments/",
  expenses: "/finance/expenses/",
} as const;

type Tokens = { access: string; refresh?: string };

async function login(): Promise<Tokens> {
  const phone = process.env.SAHAB_PHONE;
  const password = process.env.SAHAB_PASSWORD;

  if (!phone || !password) {
    console.error(
      "\nНе заданы SAHAB_PHONE и SAHAB_PASSWORD в .env.\n" +
        "Создайте в Sahab отдельного пользователя с правами только на чтение\n" +
        "и впишите его телефон и пароль.\n"
    );
    process.exit(1);
  }

  const response = await fetch(`${API}/accounts/login/`, {
    method: "POST",
    headers: baseHeaders,
    body: JSON.stringify({ phone_number: phone, password }),
  });

  if (!response.ok) {
    const text = await response.text();
    console.error(`\nSahab не пустил (${response.status}): ${text.slice(0, 300)}\n`);
    process.exit(1);
  }

  const body = (await response.json()) as Record<string, unknown>;
  // Ответы Sahab завёрнуты в { success, message, data, errors }
  const data = (body.data ?? body) as Record<string, unknown>;
  const access = data.access as string | undefined;

  if (!access) {
    console.error("\nВошли, но токен в ответе не найден. Ответ:\n", JSON.stringify(data).slice(0, 500));
    process.exit(1);
  }

  const tokens = { access, refresh: (data.refresh as string) ?? undefined };
  const profile = (data.profiles as { type: string; id: string; label?: string }[] | undefined)?.[0];
  console.log(`Вход выполнен: ${data.name ?? ""}${profile?.label ? ` (${profile.label})` : ""}`);

  // После входа Sahab требует выбрать профиль и филиал — иначе часть разделов закрыта
  if (profile) {
    await post("/accounts/set-profile-type/", tokens, {
      profile_type: profile.type,
      profile_id: profile.id,
    });
  }
  const branches = await get("/accounts/branches/", tokens);
  if (branches.ok) {
    const first = asList(branches.data)[0] as { id?: string } | undefined;
    if (first?.id) {
      await post("/accounts/set-current-branch/", tokens, { branch_id: first.id });
    }
  }

  return tokens;
}

async function post(path: string, tokens: Tokens, body: unknown) {
  return fetch(API + path, {
    method: "POST",
    headers: { ...baseHeaders, Authorization: `Bearer ${tokens.access}` },
    body: JSON.stringify(body),
  });
}

async function get(path: string, tokens: Tokens, params: Record<string, string> = {}) {
  const url = new URL(API + path);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);

  const response = await fetch(url, {
    headers: { ...baseHeaders, Authorization: `Bearer ${tokens.access}` },
  });
  if (!response.ok) {
    return { ok: false as const, status: response.status, body: await response.text() };
  }
  return { ok: true as const, status: response.status, data: await response.json() };
}

/** Достаёт список записей из ответа: API может отдавать массив или {results: []}. */
function asList(payload: unknown): unknown[] {
  let data = payload;
  // снимаем обёртку { success, message, data }
  if (data && typeof data === "object" && "data" in (data as object)) {
    data = (data as Record<string, unknown>).data;
  }
  if (Array.isArray(data)) return data;
  if (data && typeof data === "object") {
    for (const key of ["results", "data", "items"]) {
      const value = (data as Record<string, unknown>)[key];
      if (Array.isArray(value)) return value;
    }
  }
  return [];
}

/**
 * Разведка: показывает, что именно отдаёт каждый раздел и какие в нём поля.
 * По этому выводу настраивается перенос — гадать о структуре не нужно.
 */
async function explore(tokens: Tokens) {
  for (const [title, path] of Object.entries(ENDPOINTS)) {
    const result = await get(path, tokens, { page_size: "3" });

    if (!result.ok) {
      console.log(`\n${title.padEnd(10)} ${path}\n   ✗ ${result.status}: ${result.body.slice(0, 120)}`);
      continue;
    }

    const list = asList(result.data);
    const inner = ((result.data as Record<string, unknown>)?.data ?? result.data) as
      | Record<string, unknown>
      | undefined;
    const total = inner?.count ?? inner?.total ?? list.length;

    console.log(`\n${title.padEnd(10)} ${path}\n   ✓ записей: ${total}`);

    const first = list[0] ?? result.data;
    if (first && typeof first === "object") {
      const fields = Object.entries(first as Record<string, unknown>)
        .slice(0, 18)
        .map(([key, value]) => {
          const preview =
            value === null
              ? "null"
              : typeof value === "object"
                ? Array.isArray(value)
                  ? `[${value.length}]`
                  : "{…}"
                : String(value).slice(0, 22);
          return `${key}=${preview}`;
        });
      console.log(`   поля: ${fields.join(", ")}`);
    }
  }
}

async function main() {
  const tokens = await login();

  if (EXPLORE) {
    console.log("\nСмотрю, что отдаёт Sahab...");
    await explore(tokens);
    console.log(
      "\nПо этим полям настраивается перенос в базу: платежи и расходы → «Финансы»,\n" +
        "заморозки → «Администратор», посещаемость → воронка удержания.\n"
    );
    return;
  }

  console.log(
    "\nПеренос ещё не настроен: сначала запустите с --explore, чтобы увидеть структуру данных.\n"
  );
}

main().catch((e) => {
  console.error("\nОшибка:", e instanceof Error ? e.message : e);
  process.exit(1);
});

export {};
