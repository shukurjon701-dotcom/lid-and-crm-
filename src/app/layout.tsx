import type { Metadata } from "next";
import { Manrope, JetBrains_Mono } from "next/font/google";
import "./globals.css";

/**
 * Manrope — геометричный гротеск с характером: он и держит крупные цифры,
 * и не выглядит «офисным» в мелком тексте. JetBrains Mono — только для колонок
 * с числами, где важно, чтобы разряды стояли ровно.
 */
const sans = Manrope({
  subsets: ["latin", "cyrillic"],
  variable: "--font-sans",
  display: "swap",
});

const mono = JetBrains_Mono({
  subsets: ["latin", "cyrillic"],
  variable: "--font-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "LID CRM — Arabic Academy",
  description: "Управление учебным центром: ученики, деньги, звонки, отчёты",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="ru"
      data-theme="light"
      className={`${sans.variable} ${mono.variable}`}
      suppressHydrationWarning
    >
      <head>
        {/*
          Тему ставим до первой отрисовки, иначе на долю секунды мелькает
          не тот фон. Светлая — по умолчанию, тёмная — только если её выбрали
          кнопкой; системная настройка на это не влияет.
        */}
        <script
          dangerouslySetInnerHTML={{
            __html:
              "try{var t=localStorage.getItem('lid_theme');" +
              "document.documentElement.dataset.theme=t==='dark'?'dark':'light'}catch(e){}",
          }}
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
