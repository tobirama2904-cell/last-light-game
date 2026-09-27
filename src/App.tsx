import { useCallback, useEffect, useRef, useState } from "react";
import Menu from "./ui/Menu";
import Hud from "./ui/Hud";
import { Cutscene, DeathScreen, EndingScreen, Pause } from "./ui/Overlays";
import { Game, type EngineEvent, type HudState } from "./game/engine";
import { CHAPTERS, ENDINGS, NOTES } from "./game/story";
import { audio } from "./game/audio";
import { Mark } from "./ui/Mark";
import TouchControls from "./ui/TouchControls";
import { canInstall, goFullscreenLandscape, initPwa, isTouchDevice, promptInstall } from "./pwa";

type Screen = "boot" | "menu" | "cutscene" | "game" | "death" | "ending";

const EMPTY_HUD: HudState = {
  hp: 100,
  stamina: 100,
  breath: 100,
  injuries: [],
  weapon: "Пистолет 9мм",
  weaponId: "pistol",
  mag: 12,
  reserve: 24,
  dur: -1,
  noise: 0,
  light: 50,
  detected: 0,
  objective: "",
  prompt: "",
  hour: 18,
  weather: "clear",
  cruelty: 0,
  fear: 0,
  alert: 0,
  kills: 0,
  items: {},
  ammoByType: { ammo9: 24, ammo556: 0, shell: 0, arrow: 4 },
  echo: false,
  adrenaline: false,
  aiming: false,
  mode: "cinematic",
  chapter: 1,
  px: 0,
  pz: 0,
  yaw: 0,
  enemiesNear: 0,
  companionAlive: false,
  toast: "",
  contacts: [],
  objPos: null,
};

export default function App() {
  const mountRef = useRef<HTMLDivElement>(null);
  const gameRef = useRef<Game | null>(null);
  const karmaRef = useRef(0);
  const [screen, setScreen] = useState<Screen>("menu");
  const [hud, setHud] = useState<HudState>(EMPTY_HUD);
  const [mode, setMode] = useState<"story" | "free" | "realism">("story");
  const [chapterIdx, setChapterIdx] = useState(1);
  const [phase, setPhase] = useState<"intro" | "outro">("intro");
  const [paused, setPaused] = useState(false);
  const [sub, setSub] = useState<{ who: string; text: string } | null>(null);
  const [ending, setEnding] = useState<{ title: string; text: string } | null>(null);
  const [hasSave, setHasSave] = useState(() => !!Game.loadSave());
  const [hint, setHint] = useState(false);
  const [touch] = useState(() => isTouchDevice());
  const [installable, setInstallable] = useState(false);
  const [bootText, setBootText] = useState("СТРОИМ МИР…");
  const subTimer = useRef(0);

  const chapter = CHAPTERS.find((c) => c.id === chapterIdx) ?? CHAPTERS[0];

  const showSub = useCallback((who: string, text: string) => {
    setSub({ who, text });
    window.clearTimeout(subTimer.current);
    subTimer.current = window.setTimeout(() => setSub(null), Math.max(2600, text.length * 55));
  }, []);

  const handleEvent = useCallback(
    (e: EngineEvent) => {
      switch (e.type) {
        case "death":
          setScreen("death");
          break;
        case "complete":
          setPhase("outro");
          setScreen("cutscene");
          setPaused(false);
          break;
        case "pause":
          setPaused(true);
          break;
        case "objective":
          showSub("ЗАДАЧА", e.text);
          break;
        case "toast":
          showSub("ДЕЙЛ", e.text.replace("Дейл: ", ""));
          break;
        case "note":
          break;
        default:
          break;
      }
    },
    [showSub]
  );

  const boot = useCallback(
    async (m: "story" | "free" | "realism", ch: number) => {
      await audio.ensure();
      audio.setEcho(false);
      if (touch && document.documentElement) await goFullscreenLandscape(document.documentElement);
      setMode(m);
      setChapterIdx(ch);
      setBootText(m === "free" ? "ЗАПУСКАЕМ СВОБОДНЫЙ МИР…" : "СТРОИМ ГЛАВУ…");
      setScreen("boot");

      window.setTimeout(() => {
        const mount = mountRef.current;
        if (!mount) return;
        if (gameRef.current) {
          gameRef.current.dispose();
          gameRef.current = null;
        }
        const chData = CHAPTERS.find((c) => c.id === ch);
        const game = new Game(
          mount,
          { mode: m, chapter: ch, quality: "high" },
          { onEvent: handleEvent, onHud: setHud }
        );
        gameRef.current = game;
        game.spawnChapter(ch, chData);
        game.start();

        if (m === "free") {
          game.setObjective("Свободный мир: соберите припасы, найдите лагерь, решите, кем быть");
          game.beginPlay();
          setScreen("game");
          setHint(true);
          window.setTimeout(() => setHint(false), 16000);
        } else {
          game.setCinematicCamera(chData?.intro[0]?.cam, chData?.intro[0]?.look);
          setPhase("intro");
          setScreen("cutscene");
        }
      }, 80);
    },
    [handleEvent, touch]
  );

  const nextChapterRef = useRef<() => void>(() => {});

  const finishGame = useCallback(() => {
    const g = gameRef.current;
    const karma = karmaRef.current;
    const survivors = g && g.companion && !g.companion.isDead ? ["dale"] : [];
    const end = ENDINGS.find((e) => e.need(karma, survivors)) ?? ENDINGS[1];
    setEnding({ title: end.title, text: end.text });
    audio.setTension(0, 0, 1);
    audio.setEcho(false);
    setScreen("ending");
  }, []);

  const onCutsceneDone = useCallback(() => {
    const g = gameRef.current;
    if (!g) return;
    if (phase === "intro") {
      if (chapterIdx >= CHAPTERS.length) {
        finishGame();
        return;
      }
      g.setObjective(chapter.objective);
      g.beginPlay();
      setScreen("game");
      setHint(true);
      window.setTimeout(() => setHint(false), 16000);
      window.setTimeout(() => g.requestLock(), 60);
    } else {
      nextChapterRef.current();
    }
  }, [phase, chapter, chapterIdx, finishGame]);

  const onChoose = useCallback(
    (i: number) => {
      const opt = chapter.choice?.options[i];
      if (opt) {
        karmaRef.current += opt.karma;
        if (gameRef.current) gameRef.current.cruelty += opt.karma;
        showSub("РЕШЕНИЕ", opt.result);
      }
      window.setTimeout(() => nextChapter(), 400);
    },
    [chapter, showSub]
  );

  const nextChapter = useCallback(() => {
    const g = gameRef.current;
    if (!g) return;
    g.save();
    const nextId = chapterIdx + 1;
    if (nextId > CHAPTERS.length) {
      finishGame();
      return;
    }
    const chData = CHAPTERS.find((c) => c.id === nextId);
    setChapterIdx(nextId);
    g.spawnChapter(nextId, chData);
    g.setCinematicCamera(chData?.intro[0]?.cam, chData?.intro[0]?.look);
    setPhase("intro");
    setScreen("cutscene");
  }, [chapterIdx]);
  nextChapterRef.current = nextChapter;

  const resume = useCallback(() => {
    const g = gameRef.current;
    if (!g) return;
    setPaused(false);
    g.mode = "play";
    g.paused = false;
    g.requestLock();
  }, []);

  const toMenu = useCallback(() => {
    const g = gameRef.current;
    if (g) {
      g.mode = "cinematic";
      g.paused = true;
      g.save();
    }
    document.exitPointerLock?.();
    setPaused(false);
    setHasSave(true);
    setScreen("menu");
  }, []);

  const respawn = useCallback(() => {
    gameRef.current?.respawn();
    setScreen("game");
  }, []);

  // хоткеи поверх интерфейса
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (screen !== "game") return;
      if (e.code === "Tab" || e.code === "Escape") {
        e.preventDefault();
        document.exitPointerLock?.();
        setPaused((p) => !p);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [screen]);

  // сохранение при уходе
  useEffect(() => {
    const onUnload = () => gameRef.current?.save();
    window.addEventListener("beforeunload", onUnload);
    return () => window.removeEventListener("beforeunload", onUnload);
  }, []);

  // установка как приложение на Android
  useEffect(() => {
    initPwa();
    const onPrompt = () => window.setTimeout(() => setInstallable(canInstall()), 60);
    window.addEventListener("beforeinstallprompt", onPrompt);
    return () => window.removeEventListener("beforeinstallprompt", onPrompt);
  }, []);

  const realism = mode === "realism";

  return (
    <div className="relative h-full w-full overflow-hidden bg-ink">
      {/* 3D-полотно */}
      <div ref={mountRef} className="absolute inset-0" />

      {screen === "menu" && (
        <>
          <Menu onStart={boot} onContinue={() => boot("story", Game.loadSave()?.chapter ?? 1)} hasSave={hasSave} />
          {installable && (
            <button
              onClick={async () => {
                const ok = await promptInstall();
                if (ok) setInstallable(false);
              }}
              className="enamel-rust absolute bottom-4 left-1/2 z-30 -translate-x-1/2 bg-ink/90 px-6 py-3 stamped text-[12px] text-bone hover:bg-rust"
            >
              УСТАНОВИТЬ НА ТЕЛЕФОН
            </button>
          )}
        </>
      )}

      {screen === "boot" && (
        <div className="absolute inset-0 z-30 flex flex-col items-center justify-center bg-ink grain">
          <Mark size={72} className="text-rust breathe" />
          <div className="stamped mt-6 text-[12px] text-neutral-warm">{bootText}</div>
          <div className="mt-4 h-1 w-64 overflow-hidden bg-bone/15">
            <div className="h-full w-1/3 animate-pulse bg-rust" />
          </div>
          <p className="voice mt-4 max-w-[460px] text-center text-[13px] text-neutral-warm/80">
            Рельеф, кварталы, лес, лут и ИИ создаются процедурно прямо сейчас — поэтому загрузка занимает секунды,
            а не минуты.
          </p>
        </div>
      )}

      {screen === "cutscene" && (
        <Cutscene chapter={chapter} phase={phase} onDone={onCutsceneDone} onChoose={onChoose} />
      )}

      {screen === "game" && (
        <>
          <Hud hud={hud} subtitle={sub} realism={realism} />
          {touch && !paused && gameRef.current && (
            <TouchControls
              game={gameRef.current}
              onPause={() => {
                document.exitPointerLock?.();
                setPaused(true);
              }}
            />
          )}
          {paused && (
            <Pause
              game={gameRef.current!}
              hud={hud}
              onResume={resume}
              onMenu={toMenu}
            />
          )}
        </>
      )}

      {screen === "death" && <DeathScreen onRespawn={respawn} onMenu={toMenu} />}

      {screen === "ending" && ending && (
        <EndingScreen
          title={ending.title}
          text={ending.text}
          karma={karmaRef.current}
          kills={hud.kills}
          notes={gameRef.current?.getNotes().length ?? 0}
          onMenu={toMenu}
        />
      )}

      {/* лёгкая подпись во время игры */}
      {screen === "game" && !paused && (
        <div className="pointer-events-none absolute right-4 bottom-2 text-[9px] stamped text-bone/35">
          LAST LIGHT · ГЛАВА {String(chapterIdx).padStart(2, "0")} · {NOTES.length} ДНЕВНИКОВ В МИРЕ
        </div>
      )}

      {/* стартовая памятка */}
      {screen === "game" && hint && !paused && !touch && (
        <button
          onClick={() => setHint(false)}
          className="enamel absolute right-6 top-1/2 z-20 max-w-[300px] -translate-y-1/2 bg-ink/90 px-4 py-4 text-left transition hover:bg-ink/70"
        >
          <div className="stamped text-[11px] text-rust-bright">ПАМЯТКА · ПЕРВЫЕ МИНУТЫ</div>
          <ul className="mt-2 space-y-1.5 text-[12px] text-bone/85">
            <li><b>WASD</b> — идти, <b>SHIFT</b> — беги (шумно)</li>
            <li><b>CTRL</b> — присесть, <b>Z</b> — лечь: тише и незаметнее</li>
            <li><b>ПРОБЕЛ</b> — запрыгнуть в окно или на ящик</li>
            <li><b>ЛКМ</b> — огонь, <b>ПКМ</b> — прицел, <b>R</b> — перезарядка</li>
            <li><b>F</b> — тихое устранение со спины, <b>G</b> — бутылка на звук</li>
            <li><b>H</b> — эхолокация в темноте, <b>L</b> — фонарь</li>
            <li><b>T</b> — приказ напарнику, <b>TAB</b> — крафт и карта</li>
          </ul>
          <div className="mt-3 text-[10px] stamped text-neutral-warm">КЛИК — СКРЫТЬ · КЛИК ПО ЭКРАНУ — ЗАХВАТ КУРСОРА</div>
        </button>
      )}
    </div>
  );
}
