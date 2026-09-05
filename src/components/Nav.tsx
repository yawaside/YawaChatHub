import { useEffect, useState } from "react";
import { Download, Menu, X } from "lucide-react";
import { Logo } from "./bits";
import { GithubIcon } from "./brands";
import { APP_TAG, APP_VERSION } from "../version";

const LINKS = [
  { href: "#demo", label: "Демо" },
  { href: "#features", label: "Возможности" },
  { href: "#widget", label: "Виджет OBS" },
  { href: "#game", label: "Оверлей" },
  { href: "#hotkeys", label: "Горячие клавиши" },
  { href: "#download", label: "Скачать" },
];

export default function Nav() {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener("scroll", onScroll);
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header
      className={`fixed inset-x-0 top-0 z-50 transition-all duration-300 ${
        scrolled ? "border-b border-white/10 bg-void/80 backdrop-blur-xl" : ""
      }`}
    >
      <div className="mx-auto flex h-16 w-full max-w-6xl items-center gap-6 px-5 sm:px-8">
        <Logo />

        <nav className="ml-auto hidden items-center gap-7 lg:flex">
          {LINKS.map((l) => (
            <a
              key={l.href}
              href={l.href}
              className="text-[13px] text-fog transition-colors hover:text-white"
            >
              {l.label}
            </a>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-2 lg:ml-0">
          <span className="hidden font-mono text-[10.5px] text-fog sm:inline">v{APP_VERSION}</span>
          <a
            href="https://github.com/yawaside/Yawachat.test"
            target="_blank"
            rel="noreferrer"
            className="grid h-9 w-9 place-items-center rounded-xl border border-white/10 text-fog transition-colors hover:border-viol hover:text-white"
            title="Репозиторий GitHub"
          >
            <GithubIcon size={15} />
          </a>
          <a
            href="#download"
            className="hidden items-center gap-2 rounded-xl bg-viol px-4 py-2 text-[13px] font-semibold text-white transition-transform hover:scale-[1.03] sm:inline-flex"
          >
            <Download size={14} /> Скачать {APP_TAG}
          </a>
          <button
            onClick={() => setOpen((v) => !v)}
            className="grid h-9 w-9 place-items-center rounded-xl border border-white/10 text-fog lg:hidden"
            title="Меню"
          >
            {open ? <X size={15} /> : <Menu size={15} />}
          </button>
        </div>
      </div>

      {open && (
        <div className="border-t border-white/10 bg-void/95 px-5 py-4 backdrop-blur-xl lg:hidden">
          <div className="mx-auto flex max-w-6xl flex-col gap-3">
            {LINKS.map((l) => (
              <a
                key={l.href}
                href={l.href}
                onClick={() => setOpen(false)}
                className="text-[14px] text-fog transition-colors hover:text-white"
              >
                {l.label}
              </a>
            ))}
          </div>
        </div>
      )}
    </header>
  );
}
