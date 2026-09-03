import { useMemo } from "react";
import Nav from "./components/Nav";
import Hero from "./components/Hero";
import DemoSection from "./components/DemoSection";
import DesktopApp from "./components/DesktopApp";
import OverlayApp from "./components/OverlayApp";
import WidgetSection from "./components/WidgetSection";
import GameModeSection from "./components/GameModeSection";
import { DownloadSection, Features, Footer, Hotkeys } from "./components/sections";
import { getUiMode } from "./lib/bridge";

export default function App() {
  const mode = useMemo(getUiMode, []);

  /* Один код — три режима: сайт / окно приложения / игровой оверлей (Electron) */
  if (mode === "overlay") {
    return <OverlayApp />;
  }
  if (mode === "app") {
    return (
      <div className="h-screen overflow-hidden bg-void text-white">
        <DesktopApp />
      </div>
    );
  }
  return (
    <div className="relative min-h-screen bg-void text-white">
      <Nav />
      <main>
        <Hero />
        <DemoSection />
        <Features />
        <WidgetSection />
        <GameModeSection />
        <Hotkeys />
        <DownloadSection />
      </main>
      <Footer />
    </div>
  );
}
