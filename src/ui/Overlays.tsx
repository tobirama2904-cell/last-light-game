import { useEffect, useMemo, useState } from "react";
import { audio } from "../game/audio";

function voiceFor(who: string): [number, number] {
  if (/ЭПИ/.test(who)) return [1.4, 1.05];
  if (/РОЗА/.test(who)) return [1.15, 1];
  if (/ДЕЙЛ/.test(who)) return [0.7, 0.95];
  if (/КРЕЙН/.test(who)) return [0.6, 0.9];
  if (/запись/.test(who)) return [0.8, 0.92];
  return [0.9, 1];
}
import type { Chapter, Choice, Line } from "../game/story";
import { NOTES } from "../game/story";
import type { Game, HudState } from "../game/engine";
import { RECIPES, ITEM_NAMES, WEAPONS } from "../game/engine";
import { HUBS } from "../game/world";
import { Mark } from "./Mark";

/* ————————————————————— катсцена ————————————————————— */
export function Cutscene({
  chapter,
  phase,
  onDone,
  onChoose,
}: {
  chapter: Chapter;
  phase: "intro" | "outro";
  onDone: () => void;
  onChoose?: (i: number) => void;
}) {
  const lines: Line[] = phase === "intro" ? chapter.intro : (chapter.outro ?? []);
  const [li, setLi] = useState(0);
  const [chars, setChars] = useState(0);
  const [showChoice, setShowChoice] = useState(phase === "outro" && !chapter.outro);

  useEffect(() => {
    setLi(0);
    setChars(0);
    setShowChoice(phase === "outro" && !chapter.outro);
  }, [phase, chapter.id]);

  const line = lines[li];

  useEffect(() => {
    if (!line || showChoice) return;
    setChars(0);
    const [pitch, rate] = voiceFor(line.who);
    audio.speak(line.text, pitch, rate, 0.9);
    const text = line.text;
    let i = 0;
    const id = window.setInterval(() => {
      i += 2;
      setChars(i);
      if (i >= text.length + 14) window.clearInterval(id);
    }, 26);
    return () => window.clearInterval(id);
  }, [li, line, showChoice]);

  const advance = () => {
    if (showChoice) return;
    if (!line) {
      if (chapter.choice && phase === "intro") {
        // выбор показывается перед игрой? нет — после
      }
      onDone();
      return;
    }
    if (chars < line.text.length) {
      setChars(line.text.length + 20);
      return;
    }
    if (li + 1 < lines.length) setLi(li + 1);
    else if (chapter.choice && phase === "outro") setShowChoice(true);
    else onDone();
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code === "Space" || e.code === "Enter" || e.code === "KeyE") {
        e.preventDefault();
        advance();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  return (
    <div className="absolute inset-0 z-30 overflow-hidden bg-ink grain" onClick={advance}>
      <img
        src={chapter.art}
        alt=""
        className="absolute inset-0 h-full w-full object-cover"
        style={{
          filter: "saturate(0.7) contrast(1.1) brightness(0.6)",
          animation: "fade-up 1.6s ease both",
          transform: `scale(${1.06 + li * 0.012})`,
          transition: "transform 6s linear",
          objectPosition: phase === "intro" ? "50% 45%" : "50% 60%",
        }}
      />
      <div className="absolute inset-0 bg-gradient-to-t from-ink via-ink/45 to-ink/75" />
      <div className="absolute inset-0 bg-gradient-to-r from-ink/95 via-transparent to-transparent" />

      {/* вертикальный номер главы */}
      <div className="absolute left-0 top-0 flex h-full w-20 items-center justify-center border-r border-bone/15 bg-ink/60">
        <div
          className="font-display text-[clamp(3rem,9vh,6rem)] font-bold leading-none text-bone/12"
          style={{ writingMode: "vertical-rl", letterSpacing: "0.1em" }}
        >
          {chapter.num} · {phase === "intro" ? "НАЧАЛО" : "ФИНАЛ ГЛАВЫ"}
        </div>
      </div>

      <div className="absolute left-1/2 top-8 w-[min(1000px,86vw)] -translate-x-1/2 text-center">
        <div className="stamped text-[11px] text-rust-bright">
          ГЛАВА {chapter.num} · {chapter.place}
        </div>
        <h2 className="font-display mt-1 text-[clamp(2.2rem,6vw,4.4rem)] leading-none font-bold tracking-[0.02em] text-bone">
          {chapter.title}
        </h2>
        <div className="voice mt-1 text-[14px] text-neutral-warm">{chapter.time}</div>
        <div className="mx-auto mt-3 h-px w-40 bg-rust" />
        <p className="voice mx-auto mt-3 max-w-[640px] text-[15px] leading-snug text-bone/70">{chapter.synopsis}</p>
      </div>

      {/* реплики */}
      <div className="absolute bottom-0 left-0 right-0 px-[8vw] pb-16">
        <div className="mx-auto min-h-[130px] w-[min(980px,92vw)] border-l-2 border-rust pl-5">
          {line ? (
            <>
              <div className="stamped text-[12px] text-rust-bright">
                {line.who}
                {line.narration ? " · ЗАПИСЬ" : ""}
              </div>
              <div className="voice mt-2 text-[clamp(1.1rem,2.4vw,1.7rem)] leading-snug text-bone">
                {line.text.slice(0, chars)}
                {chars < line.text.length && <span className="ml-0.5 inline-block h-[1em] w-[2px] translate-y-[2px] bg-rust" />}
              </div>
            </>
          ) : (
            <div className="voice text-[18px] text-bone/80">Продолжение следует…</div>
          )}
          <div className="mt-4 flex items-center gap-3">
            <div className="flex gap-1">
              {lines.map((_, i) => (
                <span key={i} className={`h-[3px] w-6 ${i <= li ? "bg-rust" : "bg-bone/25"}`} />
              ))}
            </div>
            <span className="stamped text-[10px] text-neutral-warm">ПРОБЕЛ / КЛИК — далее</span>
          </div>
        </div>
      </div>

      {/* выбор с последствиями */}
      {showChoice && chapter.choice && (
        <ChoicePanel
          choice={chapter.choice}
          onPick={(i) => {
            setShowChoice(false);
            onChoose?.(i);
          }}
        />
      )}
    </div>
  );
}

function ChoicePanel({ choice, onPick }: { choice: Choice; onPick: (i: number) => void }) {
  const [picked, setPicked] = useState<number | null>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (picked !== null) return;
      if (e.code === "Digit1") pick(0);
      if (e.code === "Digit2") pick(1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });
  const pick = (i: number) => {
    setPicked(i);
    window.setTimeout(() => onPick(i), 2600);
  };
  return (
    <div className="absolute inset-0 z-40 flex items-center justify-center bg-ink/92 px-6">
      <div className="w-[min(820px,94vw)]">
        <div className="stamped text-[11px] text-rust-bright">РЕШЕНИЕ · БЕЗ ПОДСКАЗОК</div>
        <p className="voice mt-2 text-[clamp(1.2rem,3vw,2rem)] leading-snug text-bone">{choice.prompt}</p>
        <div className="mt-6 space-y-3">
          {choice.options.map((o, i) => (
            <button
              key={i}
              onClick={() => pick(i)}
              disabled={picked !== null}
              className={`enamel block w-full bg-ink/80 px-5 py-4 text-left transition ${
                picked === i ? "bg-rust" : "hover:bg-rust/25"
              } ${picked !== null && picked !== i ? "opacity-35" : ""}`}
            >
              <span className="stamped text-[13px] text-bone">
                {i + 1} · {o.label}
              </span>
            </button>
          ))}
        </div>
        {picked !== null && (
          <p className="voice mt-5 border-l-2 border-moss pl-4 text-[15px] leading-relaxed text-bone/85">
            {choice.options[picked].result}
          </p>
        )}
      </div>
    </div>
  );
}

/* ————————————————————— пауза: инвентарь / крафт / карта / дневник ————————————————————— */
type PauseTab = "inv" | "craft" | "map" | "journal" | "controls";

export function Pause({
  game,
  hud,
  onResume,
  onMenu,
}: {
  game: Game;
  hud: HudState;
  onResume: () => void;
  onMenu: () => void;
}) {
  const [tab, setTab] = useState<PauseTab>("inv");
  const shapes = useMemo(() => game.getMapShapes(), [game]);
  const markers = useMemo(() => game.getMarkers(), [game]);
  const notes = game.getNotes();

  return (
    <div className="absolute inset-0 z-30 flex flex-col bg-ink/95 grain">
      <header className="flex items-center justify-between border-b border-bone/15 px-6 py-4">
        <div className="flex items-center gap-4">
          <Mark size={30} className="text-rust" />
          <div>
            <div className="stamped text-[13px] text-bone">ПАУЗА · ДНЕВНИК ВЫЖИВАЮЩЕГО</div>
            <div className="stamped text-[10px] text-neutral-warm">
              ГЛАВА {String(hud.chapter).padStart(2, "0")} · {String(Math.round(hud.hour)).padStart(2, "0")}:00 ·
              МОРАЛЬ {hud.cruelty > 0 ? `+${hud.cruelty}` : hud.cruelty} · УБИТО {hud.kills}
            </div>
          </div>
        </div>
        <div className="flex gap-2">
          <button onClick={onResume} className="enamel-rust bg-ink px-5 py-2 stamped text-[12px] text-bone hover:bg-rust">
            ВЕРНУТЬСЯ (ESC)
          </button>
          <button onClick={onMenu} className="enamel border border-bone/30 px-4 py-2 stamped text-[12px] text-neutral-warm hover:text-bone">
            В ГЛАВНОЕ МЕНЮ
          </button>
        </div>
      </header>

      <nav className="flex gap-1 border-b border-bone/15 px-6">
        {(
          [
            ["inv", "ИНВЕНТАРЬ"],
            ["craft", "КРАФТ"],
            ["map", "КАРТА"],
            ["journal", "ДНЕВНИК"],
            ["controls", "УПРАВЛЕНИЕ"],
          ] as [PauseTab, string][]
        ).map(([id, label]) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={`stamped px-4 py-3 text-[12px] transition ${
              tab === id ? "border-b-2 border-rust text-bone" : "text-neutral-warm hover:text-bone"
            }`}
          >
            {label}
          </button>
        ))}
      </nav>

      <div className="thin-scroll flex-1 overflow-auto px-6 py-5">
        {tab === "inv" && (
          <div className="grid gap-6 lg:grid-cols-2">
            <section>
              <h3 className="stamped text-[12px] text-rust-bright">РЕСУРСЫ</h3>
              <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
                {Object.entries(hud.items)
                  .filter(([, v]) => v > 0 || ITEM_NAMES["x"])
                  .map(([k, v]) => (
                    <div key={k} className="border border-bone/15 bg-ink/60 px-3 py-2">
                      <div className="text-[12px] text-bone/85">{ITEM_NAMES[k] ?? k}</div>
                      <div className="tabular text-[20px] leading-none text-moss">{v}</div>
                    </div>
                  ))}
              </div>
              <h3 className="stamped mt-6 text-[12px] text-rust-bright">ЛУЧКАЯ АПТЕКА</h3>
              <div className="mt-2 flex flex-wrap gap-2">
                {(["bandage", "splint", "kit"] as const).map((h) => (
                  <button
                    key={h}
                    onClick={() => game.useHeal(h)}
                    className="enamel border border-moss/60 px-4 py-2 stamped text-[11px] text-bone hover:bg-moss hover:text-ink"
                  >
                    {h === "bandage" ? "ПЕРЕВЯЗКА" : h === "splint" ? "ШИНА" : "АПТЕЧКА"}
                  </button>
                ))}
              </div>
            </section>
            <section>
              <h3 className="stamped text-[12px] text-rust-bright">ОРУЖИЕ</h3>
              <div className="mt-3 space-y-2">
                {game.slots.map((s) => {
                  const w = WEAPONS[s];
                  return (
                    <button
                      key={s}
                      onClick={() => game.equip(s)}
                      className={`flex w-full items-center justify-between border px-4 py-2 text-left transition ${
                        hud.weaponId === s ? "border-rust bg-rust/20" : "border-bone/15 hover:border-bone/40"
                      }`}
                    >
                      <span className="stamped text-[12px] text-bone">{w.name}</span>
                      <span className="tabular text-[11px] text-neutral-warm">
                        {w.kind === "melee" ? `УРОН ${w.dmg}` : `${w.dmg} · ШУМ ${w.noise} · ${w.mag ?? "—"} патр.`}
                      </span>
                    </button>
                  );
                })}
              </div>
              <div className="mt-4 border border-bone/15 p-3 text-[12px] text-neutral-warm">
                Травмы: {hud.injuries.length ? hud.injuries.join(" · ") : "нет"} — лечатся перевязкой и шиной.
              </div>
            </section>
          </div>
        )}

        {tab === "craft" && (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {RECIPES.map((r) => {
              const can = Object.entries(r.need).every(([k, v]) => (hud.items[k] ?? 0) >= v);
              return (
                <div key={r.id} className={`border p-4 ${can ? "border-moss/70 bg-moss/8" : "border-bone/15 bg-ink/50"}`}>
                  <div className="stamped text-[12px] text-bone">{r.name}</div>
                  <div className="mt-2 space-y-1 text-[12px]">
                    {Object.entries(r.need).map(([k, v]) => {
                      const have = hud.items[k] ?? 0;
                      return (
                        <div key={k} className={have >= v ? "text-moss" : "text-rust-bright"}>
                          {ITEM_NAMES[k] ?? k} — {have}/{v}
                        </div>
                      );
                    })}
                  </div>
                  <button
                    disabled={!can}
                    onClick={() => game.craft(r.id)}
                    className={`mt-3 w-full px-3 py-2 stamped text-[11px] transition ${
                      can ? "bg-moss text-ink hover:bg-bone" : "cursor-not-allowed bg-bone/10 text-neutral-warm"
                    }`}
                  >
                    {can ? "СОБРАТЬ" : "НЕ ХВАТАЕТ"}
                  </button>
                </div>
              );
            })}
          </div>
        )}

        {tab === "map" && (
          <div className="mx-auto max-w-[900px]">
            <div className="enamel border border-bone/20 bg-ink/70 p-3">
              <svg viewBox="-240 -240 480 480" className="h-[62vh] w-full">
                <defs>
                  <pattern id="grid" width="24" height="24" patternUnits="userSpaceOnUse">
                    <path d="M24 0 H0 V24" fill="none" stroke="rgba(232,226,211,0.08)" strokeWidth="0.6" />
                  </pattern>
                </defs>
                <rect x="-240" y="-240" width="480" height="480" fill="url(#grid)" />
                {shapes.map((s, i) =>
                  s.kind === "road" ? (
                    <rect
                      key={i}
                      x={s.x - s.w / 2}
                      y={s.z - s.d / 2}
                      width={s.w}
                      height={s.d}
                      fill="rgba(140,138,126,0.35)"
                    />
                  ) : (
                    <rect
                      key={i}
                      x={s.x - s.w / 2}
                      y={s.z - s.d / 2}
                      width={s.w}
                      height={s.d}
                      fill={s.kind === "poi" ? "rgba(124,138,90,0.5)" : "rgba(232,226,211,0.22)"}
                      stroke="rgba(232,226,211,0.5)"
                      strokeWidth="0.7"
                    />
                  )
                )}
                {HUBS.map((h) => (
                  <g key={h.id}>
                    <circle cx={h.x} cy={h.z} r="4" fill="#B4442A" />
                    <text x={h.x + 7} y={h.z + 3} fill="#E8E2D3" fontSize="9" letterSpacing="1.4">
                      {h.label.toUpperCase()}
                    </text>
                  </g>
                ))}
                {markers
                  .filter((m) => !m.done && (m.kind === "objective" || m.kind === "quest" || m.kind === "note"))
                  .map((m, i) => (
                    <g key={i}>
                      <path d={`M${m.pos.x} ${m.pos.z - 6} l5 10 l-10 0 z`} fill="#D9613F" />
                      <text x={m.pos.x + 8} y={m.pos.z + 3} fill="#E8E2D3" fontSize="7.5" opacity="0.85">
                        {m.label}
                      </text>
                    </g>
                  ))}
                <g transform={`translate(${hud.px} ${hud.pz}) rotate(${(-hud.yaw * 180) / Math.PI})`}>
                  <path d="M0 -8 L5 7 L0 3 L-5 7 Z" fill="#E8E2D3" stroke="#0E1210" strokeWidth="0.8" />
                </g>
              </svg>
            </div>
            <p className="voice mt-3 text-center text-[13px] text-neutral-warm">
              Белый треугольник — вы. Красные метки — задачи и сторонние дела. Карта 460 × 460 метров.
            </p>
          </div>
        )}

        {tab === "journal" && (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {NOTES.map((n, i) => {
              const found = notes.includes(String(i));
              return (
                <article
                  key={n.id}
                  className="border p-4"
                  style={{
                    borderColor: found ? "rgba(180,68,42,0.55)" : "rgba(232,226,211,0.12)",
                    background: found ? "rgba(232,226,211,0.06)" : "rgba(14,18,16,0.5)",
                  }}
                >
                  <div className="stamped text-[11px] text-rust-bright">{found ? n.title : "— ЗАПИСКА НЕ НАЙДЕНА —"}</div>
                  <p className="voice mt-2 text-[13px] leading-relaxed text-bone/85">{found ? n.body : "······· ······ ····"}</p>
                </article>
              );
            })}
          </div>
        )}

        {tab === "controls" && (
          <div className="grid gap-2 sm:grid-cols-2">
            {[
              ["W A S D · SHIFT · CTRL · Z", "ходьба · бег · присед · лежа"],
              ["ПРОБЕЛ", "прыжок и запрыгивание в укрытие"],
              ["ЛКМ / ПКМ", "огонь или удар · прицел"],
              ["R · F · G", "перезарядка · ближний бой / тихое устранение · бросок"],
              ["H", "эхолокация в темноте (задержка дыхания)"],
              ["L · T · Q", "фонарь · команды напарнику · быстрый приём пищи"],
              ["1—7 · КОЛЕСО", "слоты оружия"],
              ["ESC · TAB · M", "пауза · инвентарь · карта"],
            ].map(([k, v]) => (
              <div key={k} className="flex gap-3 border-b border-bone/10 pb-2">
                <kbd className="min-w-[190px] border border-bone/35 px-2 py-1 text-center text-[11px] stamped text-bone">{k}</kbd>
                <span className="text-[13px] text-neutral-warm">{v}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/* ————————————————————— смерть ————————————————————— */
export function DeathScreen({ onRespawn, onMenu }: { onRespawn: () => void; onMenu: () => void }) {
  return (
    <div className="absolute inset-0 z-40 flex flex-col items-center justify-center bg-ink/95 grain">
      <div className="text-center">
        <div className="stamped text-[12px] text-rust-bright">ЦОКЦИПС ЗАВЕРШИЛ СВОЁ</div>
        <h2 className="font-display mt-2 text-[clamp(3rem,12vw,9rem)] leading-none font-bold text-rust">ВЫ УМЕРЛИ</h2>
        <p className="voice mx-auto mt-4 max-w-[560px] text-[16px] leading-relaxed text-bone/75">
          Никто не поднимет тревогу из-за вас. Труп найдут — и это уже будет их история.
        </p>
        <div className="mt-8 flex justify-center gap-3">
          <button onClick={onRespawn} className="enamel-rust bg-ink px-7 py-4 stamped text-[13px] text-bone hover:bg-rust">
            ОЧНУТЬСЯ У ПОСЛЕДНЕЙ ТОЧКИ
          </button>
          <button onClick={onMenu} className="enamel border border-bone/30 px-5 py-4 stamped text-[12px] text-neutral-warm hover:text-bone">
            В МЕНЮ
          </button>
        </div>
      </div>
    </div>
  );
}

/* ————————————————————— финал ————————————————————— */
export function EndingScreen({
  title,
  text,
  karma,
  kills,
  notes,
  onMenu,
}: {
  title: string;
  text: string;
  karma: number;
  kills: number;
  notes: number;
  onMenu: () => void;
}) {
  return (
    <div className="absolute inset-0 z-40 overflow-auto bg-ink grain">
      <div className="mx-auto flex min-h-full w-[min(900px,92vw)] flex-col justify-center py-16">
        <Mark size={54} className="text-rust" />
        <div className="stamped mt-6 text-[11px] text-neutral-warm">ЭПИЛОГ · КОНЦОВКА</div>
        <h2 className="font-display text-[clamp(3rem,11vw,8rem)] leading-[0.85] font-bold text-bone">{title}</h2>
        <div className="mt-4 h-px w-full bg-rust" />
        <p className="voice mt-6 text-[clamp(1.05rem,2.4vw,1.5rem)] leading-relaxed text-bone/88">{text}</p>
        <div className="mt-8 grid gap-3 sm:grid-cols-3">
          <Stat label="МОРАЛЬ" value={(karma > 0 ? "+" : "") + karma} />
          <Stat label="УБИТО" value={String(kills)} />
          <Stat label="ЗАПИСОК НАЙДЕНО" value={`${notes}/12`} />
        </div>
        <p className="voice mt-8 text-[15px] leading-relaxed text-neutral-warm">
          Игра не говорит, что было правильно. Она только запоминает.
        </p>
        <div className="mt-8">
          <button onClick={onMenu} className="enamel-rust bg-ink px-7 py-4 stamped text-[13px] text-bone hover:bg-rust">
            ГЛАВНОЕ МЕНЮ
          </button>
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="border border-bone/20 px-4 py-3">
      <div className="stamped text-[10px] text-neutral-warm">{label}</div>
      <div className="tabular text-[28px] leading-none text-bone">{value}</div>
    </div>
  );
}
