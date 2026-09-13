import { useEffect, useState } from "react";
import DesktopApp from "./components/DesktopApp";
import OverlayApp from "./components/OverlayApp";
import WidgetApp from "./components/WidgetApp";
import ErrorBoundary from "./components/ErrorBoundary";

function useHashRoute(): string {
  const [hash, setHash] = useState(() => window.location.hash);
  useEffect(() => {
    const onChange = () => setHash(window.location.hash);
    window.addEventListener("hashchange", onChange);
    return () => window.removeEventListener("hashchange", onChange);
  }, []);
  const path = hash.replace(/^#/, "").split("?")[0];
  return path || "/app";
}

export default function App() {
  const route = useHashRoute();
  // оверлей и виджет живут поверх игры/трансляции: изолируем их так,
  // чтобы сбой одного сообщения не гасил окно целиком
  if (route === "/overlay")
    return (
      <ErrorBoundary silent>
        <OverlayApp />
      </ErrorBoundary>
    );
  if (route === "/widget")
    return (
      <ErrorBoundary silent>
        <WidgetApp />
      </ErrorBoundary>
    );
  // по умолчанию — окно приложения: «демо = настоящее окно программы»
  return <DesktopApp />;
}
