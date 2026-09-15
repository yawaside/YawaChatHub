/**
 * Звуки оповещения о донате.
 *
 * Звуки синтезируются на лету, без внешних файлов: приложение остаётся одним
 * exe, а набор сигналов не зависит от наличия аудиофайлов на компьютере.
 */

export type DonateSoundId =
  | "none"
  | "chime"
  | "coins"
  | "fanfare"
  | "bell"
  | "arcade"
  | "pop";

export interface DonateSound {
  id: DonateSoundId;
  name: string;
  hint: string;
}

export const DONATE_SOUNDS: DonateSound[] = [
  { id: "chime", name: "Колокольчик", hint: "мягкий двойной сигнал" },
  { id: "coins", name: "Монетки", hint: "звон падающих монет" },
  { id: "fanfare", name: "Фанфары", hint: "торжественный аккорд" },
  { id: "bell", name: "Звонок", hint: "короткий чистый удар" },
  { id: "arcade", name: "Аркада", hint: "игровой сигнал вверх" },
  { id: "pop", name: "Пузырёк", hint: "лёгкий короткий хлопок" },
  { id: "none", name: "Без звука", hint: "оповещение отключено" },
];

export const DEFAULT_DONATE_SOUND: DonateSoundId = "chime";

export function donateSoundName(id: string | undefined): string {
  return DONATE_SOUNDS.find((s) => s.id === id)?.name ?? "Колокольчик";
}

/* ---------------- синтез ---------------- */

let ctx: AudioContext | null = null;

function audio(): AudioContext | null {
  try {
    ctx ??= new AudioContext();
    // Браузер/движок мог приостановить контекст до действия пользователя
    if (ctx.state === "suspended") void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

/** Одна нота с мягким затуханием. */
function tone(
  ac: AudioContext,
  opts: {
    freq: number;
    start: number;
    dur: number;
    gain: number;
    type?: OscillatorType;
    slideTo?: number;
  }
) {
  const osc = ac.createOscillator();
  const amp = ac.createGain();
  const t = ac.currentTime + opts.start;

  osc.type = opts.type ?? "sine";
  osc.frequency.setValueAtTime(opts.freq, t);
  if (opts.slideTo) osc.frequency.exponentialRampToValueAtTime(opts.slideTo, t + opts.dur);

  // короткая атака убирает щелчок в начале звука
  amp.gain.setValueAtTime(0.0001, t);
  amp.gain.exponentialRampToValueAtTime(Math.max(0.0002, opts.gain), t + 0.012);
  amp.gain.exponentialRampToValueAtTime(0.0001, t + opts.dur);

  osc.connect(amp).connect(ac.destination);
  osc.start(t);
  osc.stop(t + opts.dur + 0.03);
}

/**
 * Проиграть сигнал доната.
 * @param id     вариант звука
 * @param volume громкость 0…1
 */
export function playDonateSound(id: DonateSoundId | string | undefined, volume = 1) {
  const sound = (id ?? DEFAULT_DONATE_SOUND) as DonateSoundId;
  if (sound === "none") return;

  const ac = audio();
  if (!ac) return;
  const v = Math.min(1, Math.max(0, volume));
  if (v <= 0) return;

  switch (sound) {
    case "coins":
      // частые высокие призвуки — «сыплются монеты»
      [0, 0.06, 0.12, 0.19, 0.26].forEach((s, i) =>
        tone(ac, { freq: 1750 + i * 180, start: s, dur: 0.16, gain: 0.1 * v, type: "triangle" })
      );
      break;

    case "fanfare":
      // восходящее трезвучие с удержанием последней ноты
      tone(ac, { freq: 523, start: 0, dur: 0.18, gain: 0.13 * v, type: "square" });
      tone(ac, { freq: 659, start: 0.14, dur: 0.18, gain: 0.13 * v, type: "square" });
      tone(ac, { freq: 784, start: 0.28, dur: 0.42, gain: 0.15 * v, type: "square" });
      break;

    case "bell":
      // основной тон + обертон, как у настоящего звонка
      tone(ac, { freq: 1046, start: 0, dur: 0.75, gain: 0.16 * v });
      tone(ac, { freq: 2637, start: 0, dur: 0.45, gain: 0.05 * v });
      break;

    case "arcade":
      tone(ac, { freq: 440, start: 0, dur: 0.1, gain: 0.12 * v, type: "square", slideTo: 880 });
      tone(ac, { freq: 880, start: 0.1, dur: 0.16, gain: 0.12 * v, type: "square", slideTo: 1320 });
      break;

    case "pop":
      tone(ac, { freq: 620, start: 0, dur: 0.14, gain: 0.16 * v, type: "sine", slideTo: 1180 });
      break;

    case "chime":
    default:
      tone(ac, { freq: 880, start: 0, dur: 0.22, gain: 0.14 * v });
      tone(ac, { freq: 1320, start: 0.13, dur: 0.38, gain: 0.13 * v });
      break;
  }
}
