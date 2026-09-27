/**
 * Установка как приложение на Android без стора:
 * манифест и иконки генерируются в рантайме (файл остаётся автономным одним index.html).
 */

const WING_A = "M57 55 C46 40 26 33 15 41 C4 49 6 68 18 78 C29 87 46 85 56 76 Z";
const WING_B = "M57 74 C48 76 34 82 28 93 C23 102 30 110 40 108 C50 106 56 94 58 84 Z";

/** Рисует знак LAST LIGHT в canvas и отдаёт data:image/png. */
export function makeIcon(size: number, maskable = false): string {
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const g = c.getContext("2d");
  if (!g) return "";
  const s = size / 120;

  g.fillStyle = "#0E1210";
  g.fillRect(0, 0, size, size);

  // фактура
  for (let i = 0; i < size * 6; i++) {
    g.fillStyle = `rgba(232,226,211,${Math.random() * 0.03})`;
    g.fillRect(Math.random() * size, Math.random() * size, 1, 1);
  }

  g.save();
  // у maskable-иконки полезная зона — центральные 80%
  if (maskable) {
    g.translate(size * 0.1, size * 0.1);
    g.scale(0.8, 0.8);
  }
  g.scale(s, s);
  g.strokeStyle = "#B4442A";
  g.fillStyle = "#B4442A";
  g.lineCap = "square";

  g.lineWidth = 2.5;
  g.setLineDash([150, 42, 66, 30]);
  g.beginPath();
  g.arc(60, 60, 53, 0, Math.PI * 2);
  g.stroke();
  g.setLineDash([]);

  // тело и голова
  g.beginPath();
  g.ellipse(60, 70, 5, 19, 0, 0, Math.PI * 2);
  g.fill();
  g.beginPath();
  g.arc(60, 49, 6.4, 0, Math.PI * 2);
  g.fill();

  // усики
  g.lineWidth = 2.2;
  g.beginPath();
  g.moveTo(57, 45);
  g.bezierCurveTo(50, 36, 43, 32, 36, 31);
  g.moveTo(63, 45);
  g.bezierCurveTo(70, 36, 77, 32, 84, 31);
  g.stroke();

  // крылья (левое и зеркальное правое)
  const wings = [new Path2D(WING_A), new Path2D(WING_B)];
  for (const pass of [0, 1]) {
    g.save();
    if (pass === 1) {
      g.translate(120, 0);
      g.scale(-1, 1);
    }
    g.globalAlpha = 0.92;
    g.fill(wings[0]);
    g.globalAlpha = 0.62;
    g.fill(wings[1]);
    g.restore();
  }
  g.globalAlpha = 1;

  // луч
  g.lineWidth = 2;
  g.beginPath();
  g.moveTo(60, 90);
  g.lineTo(60, 112);
  g.stroke();
  g.lineWidth = 2.5;
  g.beginPath();
  g.moveTo(52, 112);
  g.lineTo(68, 112);
  g.stroke();
  g.restore();

  return c.toDataURL("image/png");
}

let installEvent: any = null;

/** Подключает манифест и иконки, чтобы Chrome предложил «Установить приложение». */
export function initPwa() {
  if (document.querySelector('link[rel="manifest"]')) return;
  try {
    const icon192 = makeIcon(192);
    const icon512 = makeIcon(512, true);
    const manifest = {
      name: "LAST LIGHT",
      short_name: "LAST LIGHT",
      description: "3D-выживание: сюжет, стелс, открытый мир.",
      start_url: ".",
      scope: ".",
      display: "fullscreen",
      orientation: "landscape",
      background_color: "#0E1210",
      theme_color: "#0E1210",
      icons: [
        { src: icon192, sizes: "192x192", type: "image/png", purpose: "any" },
        { src: icon512, sizes: "512x512", type: "image/png", purpose: "maskable" },
      ],
    };
    const blob = new Blob([JSON.stringify(manifest)], { type: "application/manifest+json" });
    const link = document.createElement("link");
    link.rel = "manifest";
    link.href = URL.createObjectURL(blob);
    document.head.appendChild(link);

    const apple = document.createElement("link");
    apple.rel = "apple-touch-icon";
    apple.href = icon192;
    document.head.appendChild(apple);

    const fav = document.createElement("link");
    fav.rel = "icon";
    fav.href = makeIcon(64);
    document.head.appendChild(fav);
  } catch {
    /* canvas недоступен — не критично */
  }

  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    installEvent = e;
  });
}

export function canInstall() {
  return !!installEvent;
}

export async function promptInstall(): Promise<boolean> {
  if (!installEvent) return false;
  installEvent.prompt();
  const res = await installEvent.userChoice;
  installEvent = null;
  return res?.outcome === "accepted";
}

/** Полноэкранный режим + блокировка ландшафта на телефоне. */
export async function goFullscreenLandscape(el: HTMLElement) {
  try {
    if (!document.fullscreenElement) await el.requestFullscreen?.({ navigationUI: "hide" } as any);
  } catch {
    /* пользователь отказал */
  }
  try {
    const so: any = (screen as any).orientation;
    await so?.lock?.("landscape");
  } catch {
    /* не поддерживается в браузере — не мешает игре */
  }
}

export const isTouchDevice = () =>
  typeof window !== "undefined" &&
  (("ontouchstart" in window && navigator.maxTouchPoints > 0) || navigator.maxTouchPoints > 1);
