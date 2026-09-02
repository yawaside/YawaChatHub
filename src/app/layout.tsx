import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "YawaChatHub 3.0.0 — все чаты стрима в одной ленте с озвучкой",
  description:
    "YawaChatHub 3.0.0 — единая лента сообщений Twitch, YouTube Live, VK Video Live, Kick и TikTok Live с озвучкой голосом, OBS-виджетом и игровым оверлеем. Portable exe и установщик Windows.",
};

export const viewport = {
  themeColor: "#06060b",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ru">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        {/* eslint-disable-next-line @next/next/no-page-custom-font */}
        <link
          href="https://fonts.googleapis.com/css2?family=Unbounded:wght@400;600;700;800&family=Onest:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="antialiased">{children}</body>
    </html>
  );
}
