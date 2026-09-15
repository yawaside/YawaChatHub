import { HandCoins, Play, Volume2 } from "lucide-react";
import type { Channel, DonateConfig } from "../../lib/types";
import { isDonatePlatform } from "../../lib/types";
import { DONATE_SOUNDS, donateSoundName, playDonateSound } from "../../lib/donateSounds";
import type { DonateSoundId } from "../../lib/donateSounds";
import { PlatformIcon, platformMeta } from "../../lib/platforms";
import { Box, Slider, ToggleRow } from "./ui";

interface Props {
  cfg: DonateConfig;
  patch: (p: Partial<DonateConfig>) => void;
  channels: Channel[];
  /** сменить звук конкретной площадки донатов */
  onChannelSound: (channelId: string, sound: string) => void;
}

/**
 * «Донаты» — отдельный раздел настроек.
 * Здесь собрано всё про донаты: звук оповещения, его громкость и озвучка
 * голосом, которая работает независимо от озвучки обычных сообщений.
 */
export default function DonatePanel({ cfg, patch, channels, onChannelSound }: Props) {
  const donateChannels = channels.filter((c) => isDonatePlatform(c.platform));

  const SoundSelect = ({
    value,
    onChange,
  }: {
    value: string;
    onChange: (v: string) => void;
  }) => (
    <div className="flex items-center gap-1.5">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="min-w-0 flex-1 cursor-pointer rounded-lg border border-transparent px-2.5 py-1.5 text-[12.5px] outline-none"
        style={{ background: "var(--dw-input)", color: "var(--dw-text)" }}
      >
        {DONATE_SOUNDS.map((s) => (
          <option key={s.id} value={s.id} style={{ color: "#000" }}>
            {s.name} — {s.hint}
          </option>
        ))}
      </select>
      <button
        onClick={() => playDonateSound(value as DonateSoundId, cfg.soundVolume)}
        title="Прослушать"
        className="flex h-[30px] w-[30px] shrink-0 cursor-pointer items-center justify-center rounded-lg transition-all hover:brightness-125"
        style={{ background: "var(--dw-input)", color: "var(--dw-accent-2)" }}
      >
        <Play size={13} />
      </button>
    </div>
  );

  return (
    <div className="flex flex-col gap-2">
      {/* ---------- звук оповещения ---------- */}
      <Box
        title="Звук оповещения о донате"
        icon={<HandCoins size={14} style={{ color: "var(--dw-dim)" }} />}
        hint={cfg.soundEnabled ? donateSoundName(cfg.sound) : "звук выключен"}
      >
        <div className="flex flex-col gap-2.5">
          <ToggleRow
            label="Проигрывать звук при донате"
            hint="сигнал звучит до озвучки сообщения"
            checked={cfg.soundEnabled}
            onChange={(v) => patch({ soundEnabled: v })}
          />

          {cfg.soundEnabled && (
            <>
              <div>
                <label className="mb-1 block text-[11px]" style={{ color: "var(--dw-dim)" }}>
                  Звук по умолчанию
                </label>
                <SoundSelect value={cfg.sound} onChange={(v) => patch({ sound: v })} />
              </div>

              <div>
                <label className="mb-1 block text-[11px]" style={{ color: "var(--dw-dim)" }}>
                  Громкость сигнала
                </label>
                <Slider
                  value={cfg.soundVolume}
                  min={0}
                  max={1}
                  onChange={(v) => patch({ soundVolume: v })}
                  format={(v) => `${Math.round(v * 100)}%`}
                />
              </div>

              {/* свой звук для каждой подключённой площадки донатов */}
              {donateChannels.length > 0 && (
                <div className="border-t pt-2" style={{ borderColor: "var(--dw-line)" }}>
                  <p className="mb-1.5 text-[11px]" style={{ color: "var(--dw-dim)" }}>
                    Свой звук для площадки
                  </p>
                  <div className="flex flex-col gap-2">
                    {donateChannels.map((c) => (
                      <div key={c.id} className="flex flex-col gap-1">
                        <span className="flex items-center gap-1.5 text-[11.5px]" style={{ color: "var(--dw-text)" }}>
                          <PlatformIcon id={c.platform} size={13} />
                          {platformMeta(c.platform).name}
                        </span>
                        <SoundSelect
                          value={c.donateSound ?? cfg.sound}
                          onChange={(v) => onChannelSound(c.id, v)}
                        />
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </Box>

      {/* ---------- озвучка донатов ---------- */}
      <Box
        title="Озвучка донатов"
        icon={<Volume2 size={14} style={{ color: "var(--dw-dim)" }} />}
        hint={cfg.speak ? "донаты читаются голосом" : "донаты не читаются"}
      >
        <div className="flex flex-col gap-2.5">
          <ToggleRow
            label="Озвучивать донаты голосом"
            hint="работает, даже если озвучка чата выключена"
            checked={cfg.speak}
            onChange={(v) => patch({ speak: v })}
          />

          {cfg.speak && (
            <>
              <div className="flex flex-col">
                <ToggleRow
                  label="Называть отправителя"
                  hint="«Аноним», если имя не указано"
                  checked={cfg.speakAuthor}
                  onChange={(v) => patch({ speakAuthor: v })}
                />
                <ToggleRow
                  label="Называть сумму"
                  checked={cfg.speakAmount}
                  onChange={(v) => patch({ speakAmount: v })}
                />
                <ToggleRow
                  label="Читать сообщение доната"
                  checked={cfg.speakMessage}
                  onChange={(v) => patch({ speakMessage: v })}
                />
              </div>

              <div className="border-t pt-2" style={{ borderColor: "var(--dw-line)" }}>
                <label className="mb-1 block text-[11px]" style={{ color: "var(--dw-dim)" }}>
                  Озвучивать от суммы
                </label>
                <Slider
                  value={cfg.minAmount}
                  min={0}
                  max={1000}
                  step={10}
                  onChange={(v) => patch({ minAmount: v })}
                  format={(v) => (v === 0 ? "любые донаты" : `от ${v}`)}
                />
              </div>
            </>
          )}

          <p className="text-[10.5px] leading-snug" style={{ color: "var(--dw-dim)" }}>
            Голос, скорость и громкость речи настраиваются в разделе «Озвучка» —
            донаты читаются тем же голосом.
          </p>
        </div>
      </Box>
    </div>
  );
}
