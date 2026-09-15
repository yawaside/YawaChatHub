"use client";

/**
 * Неблокирующая загрузка веб-шрифтов (зеркало такого же <link> в index.html
 * Vite-сборки): media="print" не тормозит первую отрисовку, по готовности
 * стили включаются ("all"). Без сети запуск приложения не ждёт сетевого
 * таймаута — интерфейс сразу рисуется системным шрифтом.
 */
export default function FontLoader() {
  return (
    <>
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      <link
        rel="stylesheet"
        href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500;600;700;800&family=Nunito:wght@400;600;700;800&family=Oswald:wght@400;500;600;700&display=swap"
        media="print"
        onLoad={(e) => {
          (e.target as HTMLLinkElement).media = "all";
        }}
      />
    </>
  );
}
