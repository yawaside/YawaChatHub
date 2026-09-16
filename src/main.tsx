import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App";
import ErrorBoundary from "./components/ErrorBoundary";

/**
 * Защита окна приложения от «пропадания интерфейса».
 * В WebView2 страница живёт по file:// — любая случайная навигация
 * (submit формы, drag&drop файла, клик по внешней ссылке) уводит
 * рендерер на несуществующий адрес и окно становится пустым.
 */
function hardenShell() {
  // 1) submit любой формы не должен перезагружать страницу
  document.addEventListener(
    "submit",
    (e) => {
      e.preventDefault();
    },
    true
  );

  // 2) Enter в текстовом поле вне формы не должен инициировать навигацию
  document.addEventListener("keydown", (e) => {
    const el = e.target as HTMLElement | null;
    if (e.key === "Enter" && el?.tagName === "INPUT" && (el as HTMLInputElement).type !== "submit") {
      const form = (el as HTMLInputElement).form;
      if (form) e.preventDefault();
    }
  });

  // 3) внешние ссылки открываем в браузере, не внутри окна
  document.addEventListener("click", (e) => {
    const a = (e.target as HTMLElement | null)?.closest?.("a");
    if (!a) return;
    const href = a.getAttribute("href") ?? "";
    if (!href || href.startsWith("#")) return;
    e.preventDefault();
    if (/^https?:/i.test(href)) window.open(href, "_blank", "noopener");
  });

  // 4) перетаскивание файлов в окно не подменяет страницу
  ["dragover", "drop"].forEach((type) =>
    window.addEventListener(type, (e) => e.preventDefault(), false)
  );

  // 5) страховка: если hash затёрли, возвращаем маршрут приложения
  window.addEventListener("hashchange", () => {
    const path = location.hash.replace(/^#/, "").split("?")[0];
    if (!path) location.hash = "#/app";
  });
}

hardenShell();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>
);
