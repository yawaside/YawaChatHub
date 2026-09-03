import { ExternalLink } from "lucide-react";
import DesktopApp from "./DesktopApp";
import { Reveal, Section } from "./bits";

export default function DemoSection() {
  return (
    <Section
      id="demo"
      index="01"
      kicker="live demo"
      title={
        <>
          Это не картинка — это{" "}
          <span className="text-viol">самое настоящее окно приложения</span>
        </>
      }
      desc="Сайт и desktop-сборка делят один код: ниже рендерится тот же интерфейс, что вы получите в exe. Данные — демо-поток, всё кликабельно."
    >
      <Reveal delay={0.05}>
        <div className="relative mt-12">
          <div className="absolute -inset-6 -z-10 rounded-[40px] bg-gradient-to-br from-viol/25 via-transparent to-cy/20 blur-2xl" />

          <div className="overflow-hidden rounded-[26px] border border-white/12 bg-[#0a0b13] shadow-[0_50px_140px_rgba(0,0,0,0.65)]">
            {/* шапка «окна» браузера */}
            <div className="flex items-center gap-2 border-b border-white/8 bg-white/[0.03] px-4 py-2.5">
              <span className="h-3 w-3 rounded-full bg-[#ff5f57]" />
              <span className="h-3 w-3 rounded-full bg-[#febc2e]" />
              <span className="h-3 w-3 rounded-full bg-[#28c840]" />
              <span className="ml-3 font-mono text-[11px] text-fog">YawaChatHub — единая лента</span>
              <a
                href="#/app"
                target="_blank"
                rel="noreferrer"
                className="ml-auto inline-flex items-center gap-1.5 font-mono text-[10.5px] text-fog transition-colors hover:text-viol"
                title="Открыть интерфейс приложения в отдельной вкладке"
              >
                развернуть <ExternalLink size={11} />
              </a>
            </div>

            {/* сам интерфейс приложения — скруглённая «карточка» как на референсе */}
            <div className="p-3 sm:p-4">
              <div className="h-[700px] overflow-hidden rounded-[22px] border border-white/8 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
                <DesktopApp />
              </div>
              <p className="mt-3 text-center font-mono text-[10.5px] text-fog">
                в браузере речь через Web Speech API · в приложении — голоса Windows (SAPI) без интернета
              </p>
            </div>
          </div>

        </div>
      </Reveal>
    </Section>
  );
}
