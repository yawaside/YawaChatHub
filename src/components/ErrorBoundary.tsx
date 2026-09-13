import { Component } from "react";
import type { ErrorInfo, ReactNode } from "react";

interface Props {
  children: ReactNode;
  /** оверлей/виджет: не показывать экран ошибки, а тихо восстановиться */
  silent?: boolean;
}

interface State {
  error: Error | null;
  info: string;
}

/**
 * Страховка от «пропадания интерфейса»: любая ошибка рендера
 * раньше приводила к пустому белому окну. Теперь показывается
 * понятный экран с текстом ошибки и кнопкой восстановления.
 */
export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null, info: "" };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    this.setState({ info: info.componentStack ?? "" });
    // eslint-disable-next-line no-console
    console.error("[YawaChatHub] сбой интерфейса:", error, info);
    // поверх игры экран ошибки недопустим — перерисовываем содержимое
    if (this.props.silent) window.setTimeout(() => this.setState({ error: null, info: "" }), 400);
  }

  private reset = () => this.setState({ error: null, info: "" });

  private reload = () => {
    const hash = window.location.hash || "#/app";
    window.location.hash = hash;
    window.location.reload();
  };

  render() {
    const { error, info } = this.state;
    if (!error) return this.props.children;
    if (this.props.silent) return null;   // оверлей: пустой кадр до восстановления

    return (
      <div
        className="flex h-screen w-screen flex-col items-center justify-center gap-4 p-8"
        style={{ background: "#0a0b13", color: "#eceef6", fontFamily: "Inter, system-ui, sans-serif" }}
      >
        <div
          className="w-full max-w-[560px] rounded-2xl border p-5"
          style={{ background: "#10121d", borderColor: "rgba(255,255,255,0.1)" }}
        >
          <h1 className="pb-1 text-[15px] font-bold">Интерфейс дал сбой</h1>
          <p className="pb-3 text-[12.5px]" style={{ color: "#8b91a8" }}>
            Приложение продолжает работать: подключения к чатам активны. Нажмите «Продолжить»,
            чтобы вернуться к окну, или «Перезагрузить интерфейс», если проблема повторяется.
          </p>

          <pre
            className="mb-3 max-h-40 overflow-auto rounded-lg p-3 text-[11px] leading-snug whitespace-pre-wrap"
            style={{ background: "rgba(248,113,113,0.1)", color: "#fca5a5" }}
          >
            {error.message}
            {info ? `\n${info.split("\n").slice(0, 6).join("\n")}` : ""}
          </pre>

          <div className="flex gap-2">
            <button
              onClick={this.reset}
              className="flex-1 cursor-pointer rounded-xl py-2 text-[12.5px] font-bold text-white"
              style={{ background: "#8b5cf6" }}
            >
              Продолжить
            </button>
            <button
              onClick={this.reload}
              className="cursor-pointer rounded-xl px-4 py-2 text-[12.5px] font-medium"
              style={{ background: "rgba(255,255,255,0.06)", color: "#8b91a8" }}
            >
              Перезагрузить интерфейс
            </button>
          </div>
        </div>
      </div>
    );
  }
}
