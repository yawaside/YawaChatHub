"use client";

import { useEffect } from "react";
import dynamic from "next/dynamic";
import ErrorBoundary from "@/components/ErrorBoundary";

/** Рендерер живёт только в браузере (hash-маршрутизация, мост WebView2). */
const App = dynamic(() => import("@/App"), { ssr: false });

/**
 * Защита окна приложения от «пропадания интерфейса».
 * В WebView2 страница живёт по file:// — любая случайная навигация
 * (submit формы, drag&drop файла, клик по внешней ссылке) уводит
 * рендерер на несуществующий адрес и окно становится пустым.
 */
function hardenShell(): () => void {
  const onSubmit = (e: Event) => {
    e.preventDefault();
  };
  document.addEventListener("submit", onSubmit, true);

  // Enter в текстовом поле вне формы не должен инициировать навигацию
  const onKeyDown = (e: KeyboardEvent) => {
    const el = e.target as HTMLElement | null;
    if (e.key === "Enter" && el?.tagName === "INPUT" && (el as HTMLInputElement).type !== "submit") {
      const form = (el as HTMLInputElement).form;
      if (form) e.preventDefault();
    }
  };
  document.addEventListener("keydown", onKeyDown);

  // внешние ссылки открываем в браузере, не внутри окна
  const onClick = (e: MouseEvent) => {
    const a = (e.target as HTMLElement | null)?.closest?.("a");
    if (!a) return;
    const href = a.getAttribute("href") ?? "";
    if (!href || href.startsWith("#")) return;
    e.preventDefault();
    if (/^https?:/i.test(href)) window.open(href, "_blank", "noopener");
  };
  document.addEventListener("click", onClick);

  // перетаскивание файлов в окно не подменяет страницу
  const onDrag = (e: Event) => e.preventDefault();
  window.addEventListener("dragover", onDrag, false);
  window.addEventListener("drop", onDrag, false);

  // страховка: если hash затёрли, возвращаем маршрут приложения
  const onHashChange = () => {
    const path = location.hash.replace(/^#/, "").split("?")[0];
    if (!path) location.hash = "#/app";
  };
  window.addEventListener("hashchange", onHashChange);

  return () => {
    document.removeEventListener("submit", onSubmit, true);
    document.removeEventListener("keydown", onKeyDown);
    document.removeEventListener("click", onClick);
    window.removeEventListener("dragover", onDrag, false);
    window.removeEventListener("drop", onDrag, false);
    window.removeEventListener("hashchange", onHashChange);
  };
}

export default function YawaShell() {
  useEffect(() => {
    const dispose = hardenShell();
    // интерфейс отрисован — убираем стартовую заставку
    const raf = requestAnimationFrame(() => {
      document.body.classList.add("ready");
      window.setTimeout(() => document.getElementById("boot")?.remove(), 250);
    });
    return () => {
      cancelAnimationFrame(raf);
      dispose();
    };
  }, []);

  return (
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  );
}
