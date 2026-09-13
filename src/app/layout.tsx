import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "YawaChatHub — чат всех стримов в одном окне",
  description: "Чат Twitch, YouTube Live, VK Play Live, Kick, TikTok Live и DonationAlerts в одном окне.",
};

const bootStyles = `
/* Фон и заставка рисуются ДО загрузки скрипта, поэтому окно
   никогда не мигает белым при запуске. */
html, body { margin: 0; height: 100%; background: #0a0b13; }
#boot {
  position: fixed;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  background: #0a0b13;
  font-family: "Segoe UI", system-ui, sans-serif;
  color: #8b91a8;
  font-size: 13px;
  transition: opacity 0.18s ease;
  z-index: 9999;
}
#boot .mark {
  width: 26px;
  height: 26px;
  border-radius: 8px;
  background: linear-gradient(135deg, #8b5cf6, #6366f1);
  animation: boot-pulse 1.1s ease-in-out infinite;
}
@keyframes boot-pulse {
  0%, 100% { transform: scale(1); opacity: 1; }
  50% { transform: scale(0.88); opacity: 0.65; }
}
body.ready #boot { opacity: 0; pointer-events: none; }
`;

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ru">
      <head>
        <meta name="color-scheme" content="dark light" />
        <style dangerouslySetInnerHTML={{ __html: bootStyles }} />
      </head>
      <body>
        <div id="boot">
          <span className="mark" />
          YawaChatHub
        </div>
        <div id="root">{children}</div>
      </body>
    </html>
  );
}
