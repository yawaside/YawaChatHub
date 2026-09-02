import { ListX, Mic, Pause, Play, SkipForward, Volume2 } from "lucide-react";
import type { SpeechEngine } from "../../lib/core";
import { Eq } from "../bits";
import { Btn } from "./ui";

/**
 * Компактная панель управления озвучкой.
 * Размещается в панели «Каналы» (вместо нижней планки под чатом).
 */
export default function SpeechPanel({
  speech, onSpeechEnabledChange, toast, compact = false,
}: {
  speech: SpeechEngine;
  onSpeechEnabledChange: (enabled: boolean) => void;
  toast: (t: string) => void;
  compact?: boolean;
}) {
  if (compact) {
    // свёрнутый вид: только кнопка включения и мини-статус
    return (
      <div
        className="flex flex-col items-center gap-2 border-t py-3"
        style={{ borderColor: "var(--dw-line)" }}
      >
        <Btn
          variant={speech.enabled ? "primary" : "outline"}
          onClick={() => {
            onSpeechEnabledChange(!speech.enabled);
            toast(speech.enabled ? "Озвучка выключена" : "Озвучка включена");
          }}
          className="!rounded-full"
          title={speech.enabled ? "Озвучка включена" : "Озвучка выключена"}
        >
          <Mic size={13} />
        </Btn>
        <span className="font-mono text-[9px] leading-none" style={{ color: "var(--dw-dim)" }}>
          {speech.enabled ? "вкл" : "выкл"}
        </span>
      </div>
    );
  }

  return (
    <div
      className="border-t px-3 py-2.5"
      style={{ borderColor: "var(--dw-line)", background: "var(--dw-panel)" }}
    >
      <div className="flex flex-wrap items-center gap-1.5">
        <Btn
          variant={speech.enabled ? "primary" : "outline"}
          onClick={() => {
            onSpeechEnabledChange(!speech.enabled);
            toast(speech.enabled ? "Озвучка выключена" : "Озвучка включена");
          }}
          className="!rounded-full shrink-0"
        >
          <Mic size={12} /> {speech.enabled ? "Озвучка вкл" : "Озвучка выкл"}
        </Btn>
        <Btn
          variant="ghost"
          disabled={!speech.enabled}
          title={speech.paused ? "Продолжить" : "Пауза"}
          onClick={() => speech.setPaused(!speech.paused)}
          className="!rounded-full !px-2.5"
        >
          {speech.paused ? <Play size={12} /> : <Pause size={12} />}
        </Btn>
        <Btn
          variant="ghost"
          disabled={!speech.enabled}
          title="Пропустить текущее"
          onClick={speech.skip}
          className="!rounded-full !px-2.5"
        >
          <SkipForward size={12} />
        </Btn>
        <Btn
          variant="ghost"
          disabled={!speech.queueSize}
          title="Очистить очередь"
          onClick={() => {
            speech.clearQueue();
            toast("Очередь очищена");
          }}
          className="!rounded-full !px-2.5"
        >
          <ListX size={12} />
        </Btn>
      </div>
      <div className="mt-2 flex min-h-[16px] items-center gap-2">
        {speech.now ? <Eq /> : <Volume2 size={12} style={{ color: "var(--dw-dim)" }} />}
        <span
          className="min-w-0 flex-1 truncate font-mono text-[10.5px]"
          style={{ color: speech.now ? "var(--dw-text)" : "var(--dw-dim)" }}
        >
          {speech.now
            ? speech.now.label
            : speech.enabled
            ? `слушаю чат · в очереди: ${speech.queueSize}`
            : "озвучка выключена"}
        </span>
        {(speech.queueSize > 0 || speech.skipped > 0) && (
          <span className="shrink-0 font-mono text-[9.5px]" style={{ color: "var(--dw-dim)" }}>
            очередь {speech.queueSize} · пропущено {speech.skipped}
          </span>
        )}
      </div>
    </div>
  );
}
