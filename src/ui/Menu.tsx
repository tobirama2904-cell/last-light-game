import { useState } from "react";
import { ART, CHAPTERS } from "../game/story";
import { Mark } from "./Mark";

type Tab = "story" | "free" | "chapters" | "controls";

const CONTROLS: [string, string][] = [
  ["W A S D", "Движение · SHIFT — бег · CTRL — присесть · Z — лечь"],
  ["ПРОБЕЛ", "Прыжок и запрыгивание в укрытие"],
  ["МЫШЬ", "Обзор · ПКМ — прицел · ЛКМ — огонь / удар"],
  ["R / F", "Перезарядка · Ближний бой и тихое устранение"],
  ["E / G / Q", "Взаимодействие · Бросок отвлечения · Быстрый приём"],
  ["1 — 7 / КОЛЕСО", "Слоты оружия · L — фонарь"],
  ["H", "ЭХОЛОКАЦИЯ: зажать в темноте (задержка дыхания)"],
  ["T", "Команды напарнику: идти · стоять · атаковать"],
  ["TAB / M", "Инвентарь, крафт, карта, дневник · ESC — пауза"],
];

export default function Menu({
  onStart,
  onContinue,
  hasSave,
}: {
  onStart: (mode: "story" | "free" | "realism", chapter: number) => void;
  onContinue: () => void;
  hasSave: boolean;
}) {
  const [tab, setTab] = useState<Tab>("story");
  const [hover, setHover] = useState<string | null>(null);

  return (
    <div className="relative h-full w-full overflow-hidden bg-ink grain">
      {/* фон — ключевой кадр */}
      <img
        src={ART.keyart}
        alt=""
        className="absolute inset-0 h-full w-full object-cover"
        style={{ filter: "saturate(0.72) contrast(1.08) brightness(0.72)", objectPosition: "60% 50%" }}
      />
      <div className="absolute inset-0 bg-gradient-to-r from-ink via-ink/88 to-ink/25" />
      <div className="absolute inset-0 bg-gradient-to-t from-ink via-transparent to-ink/70" />

      {/* левый вертикальный рельс */}
      <div className="absolute left-0 top-0 z-20 flex h-full w-14 flex-col items-center justify-between border-r border-bone/15 bg-ink/70 py-5">
        <Mark size={30} className="text-rust" />
        <div className="stamped-thin rotate-180 text-[11px] text-neutral-warm" style={{ writingMode: "vertical-rl" }}>
          LAST LIGHT · ВЫЖИВАНИЕ · 2033 · cordyceps
        </div>
        <div className="tabular text-[11px] text-bone/40">v1.0</div>
      </div>

      <div className="relative z-10 ml-14 flex h-full flex-col justify-between px-[6vw] py-8">
        {/* шапка */}
        <div className="flex items-start justify-between">
          <div className="stamped text-[11px] text-neutral-warm">
            CORDEPS STUDIO · ПОЛНАЯ ВЕРСИЯ · ОТКРЫТЫЙ МИР
          </div>
          <div className="stamped text-[11px] text-neutral-warm/70">8 ГЛАВ · 3 КОНЦОВКИ · СВОБОДА</div>
        </div>

        {/* заголовок */}
        <div className="max-w-[1100px]">
          <div className="flex items-baseline gap-5">
            <h1 className="font-display text-[clamp(3rem,9.5vw,8.5rem)] leading-[0.8] font-bold tracking-[-0.02em] text-bone">
              LAST
            </h1>
            <span className="hidden h-[3px] w-[22vw] bg-rust sm:block" />
          </div>
          <div className="flex items-baseline gap-5">
            <span className="font-display text-[clamp(3rem,9.5vw,8.5rem)] leading-[0.8] font-bold tracking-[-0.02em] text-rust">
              LIGHT
            </span>
            <p className="voice hidden max-w-[360px] text-[15px] leading-snug text-bone/75 sm:block">
              Двадцать лет спустя один контрабандист везёт девочку, за которой охотятся все.
              Он не герой. Он просто поехал.
            </p>
          </div>
          <p className="voice mt-3 max-w-[540px] text-[15px] leading-snug text-bone/70 sm:hidden">
            Двадцать лет спустя один контрабандист везёт девочку, за которой охотятся все.
          </p>
        </div>

        {/* вкладки */}
        <div className="flex flex-wrap gap-2">
          {(
            [
              ["story", "ИСТОРИЯ"],
              ["free", "СВОБОДНЫЙ МИР"],
              ["chapters", "ГЛАВЫ"],
              ["controls", "УПРАВЛЕНИЕ"],
            ] as [Tab, string][]
          ).map(([id, label]) => (
            <button
              key={id}
              onMouseEnter={() => audio_ui()}
              onClick={() => setTab(id)}
              className={`stamped border px-4 py-2 text-[12px] transition-all duration-200 ${
                tab === id
                  ? "border-rust bg-rust text-bone"
                  : "border-bone/25 text-bone/70 hover:border-bone/60 hover:text-bone"
              }`}
            >
              {label}
            </button>
          ))}
          {hasSave && (
            <button
              onClick={onContinue}
              className="stamped ml-auto border border-moss px-4 py-2 text-[12px] text-moss transition hover:bg-moss hover:text-ink"
            >
              ПРОДОЛЖИТЬ
            </button>
          )}
        </div>

        {/* панели */}
        <div className="enamel max-h-[32vh] min-h-0 overflow-auto thin-scroll bg-ink/78 p-5">
          {tab === "story" && (
            <div className="grid gap-5 md:grid-cols-[1.1fr_1fr]">
              <div>
                <div className="stamped text-[11px] text-rust-bright">РЕЖИМ · ИСТОРИЯ</div>
                <p className="voice mt-2 text-[16px] leading-relaxed text-bone/85">
                  Восемь глав, катсцены с режиссурой камеры, выборы без подсказок и три финала.
                  Длина — около 12–14 часов вместе со сторонними quest'ами, радиодневниками и записками.
                </p>
                <ul className="mt-3 space-y-1 text-[13px] text-neutral-warm">
                  <li>· Контрабандист МАРК ХОЛЛ · девочка ЭПИ МАРТИН · напарник ДЕЙЛ БУРК</li>
                  <li>· Антагонист: «Проповедник» ДЖОНАС КРЕЙН и фракция «Новый Завет»</li>
                  <li>· Мораль без надписей: жестокость меняет реплики и финал</li>
                </ul>
                <div className="mt-4 flex flex-wrap gap-3">
                  <SignButton onClick={() => onStart("story", 1)} big>
                    НОВАЯ ИГРА · ГЛАВА 01
                  </SignButton>
                  <SignButton onClick={() => onStart("realism", 1)}>РЕЖИМ «РЕАЛИЗМ» — БЕЗ HUD</SignButton>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-2">
                {[ART.ch1, ART.ch2, ART.ch3, ART.ch4].map((src, i) => (
                  <figure key={i} className="relative col-span-1 overflow-hidden border border-bone/15">
                    <img src={src} alt="" className="h-24 w-full object-cover opacity-80 transition duration-500 hover:opacity-100" />
                    <figcaption className="absolute bottom-1 left-1 text-[9px] stamped text-bone/80">
                      0{i + 1}
                    </figcaption>
                  </figure>
                ))}
                <div className="col-span-3 border border-bone/15 p-3">
                  <div className="stamped text-[10px] text-neutral-warm">СЕКТОРЫ КАРТЫ</div>
                  <div className="mt-1 text-[12px] text-bone/75">
                    Блокпост «Элм-стрит» · Лагерь Харлоу-Милл · Плотина Кейнс-Рок · Медицинский корпус ·
                    Долина Купера · Тюрьма Санта-Ана · Церковь Святого Марка
                  </div>
                </div>
              </div>
            </div>
          )}

          {tab === "free" && (
            <div className="grid gap-5 md:grid-cols-2">
              <div>
                <div className="stamped text-[11px] text-rust-bright">РЕЖИМ · СВОБОДА</div>
                <p className="voice mt-2 text-[16px] leading-relaxed text-bone/85">
                  Открытая карта 460×460 м без сюжетных ограничений: погода и время суток меняются сами,
                  фракции воюют, караваны и засады появляются по расписанию, лут respавнится.
                </p>
                <ul className="mt-3 space-y-1 text-[13px] text-neutral-warm">
                  <li>· Побочные задачи: караван Розы, радио с крыши, белый олень, генератор</li>
                  <li>· Дневники и радиодневники (12 штук) с собственной историей</li>
                  <li>· Смерть напарника — навсегда; репутация фракций помнит</li>
                </ul>
                <div className="mt-4">
                  <SignButton onClick={() => onStart("free", 2)} big>
                    ВОЙТИ В СВОБОДНЫЙ МИР
                  </SignButton>
                </div>
              </div>
              <div className="border border-bone/15 p-4">
                <div className="stamped text-[10px] text-neutral-warm">ЧТО ЖИВЁТ В МИРЕ</div>
                <div className="mt-2 grid grid-cols-2 gap-2 text-[12px] text-bone/80">
                  {[
                    "Смена дня и ночи",
                    "Дождь, туман, гроза, снег",
                    "Распорядок NPC",
                    "Олени, волки, собаки, вороны",
                    "Фракции и бартер",
                    "Случайные засады",
                    "Пожар распространяется",
                    "Свет и шум как механика",
                    "Следы и запах",
                    "Разрушаемые укрытия",
                    "База и укрытие",
                    "Транспорт и ремонт",
                  ].map((t) => (
                    <div key={t} className="border-l border-moss/60 pl-2 leading-tight">{t}</div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {tab === "chapters" && (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {CHAPTERS.map((c) => (
                <button
                  key={c.id}
                  onMouseEnter={() => setHover(c.id + "")}
                  onClick={() => onStart("story", c.id)}
                  className="group relative overflow-hidden border border-bone/20 text-left transition hover:border-rust"
                >
                  <img src={c.art} alt="" className="h-24 w-full object-cover opacity-60 transition duration-500 group-hover:opacity-90" />
                  <div className="absolute inset-0 bg-gradient-to-t from-ink to-transparent" />
                  <div className="absolute left-2 top-1 text-[34px] font-bold leading-none text-bone/25 group-hover:text-rust/70">
                    {c.num}
                  </div>
                  <div className="relative p-2">
                    <div className="stamped text-[12px] text-bone">{c.title}</div>
                    <div className="text-[11px] text-neutral-warm">{c.place}</div>
                    <div className="voice mt-1 text-[11px] leading-tight text-bone/60">
                      {hover === c.id + "" ? c.synopsis : c.time}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}

          {tab === "controls" && (
            <div className="grid gap-2 sm:grid-cols-2">
              {CONTROLS.map(([k, v]) => (
                <div key={k} className="flex items-center gap-3 border-b border-bone/10 pb-2">
                  <kbd className="min-w-[128px] border border-bone/35 bg-ink px-2 py-1 text-center text-[11px] stamped text-bone">
                    {k}
                  </kbd>
                  <span className="text-[13px] text-neutral-warm">{v}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="flex items-center justify-between text-[10px] stamped text-neutral-warm/70">
          <span>WebGL · процедурный саундтрек · без внешних файлов</span>
          <span>клик по экрану захватывает курсор · ESC — пауза</span>
        </div>
      </div>
    </div>
  );
}

function SignButton({
  children,
  onClick,
  big,
}: {
  children: React.ReactNode;
  onClick: () => void;
  big?: boolean;
}) {
  return (
    <button
      onMouseEnter={() => audio_ui()}
      onClick={onClick}
      className={`enamel-rust group relative bg-ink/85 text-left transition-all duration-200 hover:bg-rust hover:text-bone ${
        big ? "px-6 py-4" : "px-4 py-3"
      }`}
    >
      <span className={`stamped ${big ? "text-[15px]" : "text-[12px]"} text-bone`}>{children}</span>
      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-rust-bright transition group-hover:translate-x-1">
        →
      </span>
    </button>
  );
}

function audio_ui() {
  // лёгкий тик без обязательной инициализации аудио
  try {
    import("../game/audio").then((m) => m.audio.ui("hover"));
  } catch {
    /* ignore */
  }
}
