import { useEffect, useState } from "react";
import type { HudState } from "../game/engine";
import { Mark } from "./Mark";

const CARDINALS: [number, string][] = [
  [0, "С"],
  [45, "СВ"],
  [90, "В"],
  [135, "ЮВ"],
  [180, "Ю"],
  [225, "ЮЗ"],
  [270, "З"],
  [315, "СЗ"],
];

function norm(a: number) {
  while (a > 180) a -= 360;
  while (a < -180) a += 360;
  return a;
}

export default function Hud({
  hud,
  subtitle,
  realism,
}: {
  hud: HudState;
  subtitle: { who: string; text: string } | null;
  realism: boolean;
}) {
  const [flash, setFlash] = useState(0);
  const bearing = (((hud.yaw * 180) / Math.PI) % 360 + 360) % 360;
  const lowHp = hud.hp <= 35;

  useEffect(() => {
    if (hud.hp < 40) {
      setFlash(1);
      const t = setTimeout(() => setFlash(0), 260);
      return () => clearTimeout(t);
    }
  }, [hud.hp]);

  if (realism) {
    return (
      <div className="pointer-events-none absolute inset-0">
        {subtitle && (
          <div className="absolute bottom-16 left-1/2 w-[min(760px,88vw)] -translate-x-1/2 text-center">
            <span className="voice text-[15px] text-bone/90 drop-shadow">{subtitle.text}</span>
          </div>
        )}
        {hud.prompt && (
          <div className="absolute bottom-28 left-1/2 -translate-x-1/2 stamped text-[12px] text-bone/80">{hud.prompt}</div>
        )}
      </div>
    );
  }

  const hpArc = 2 * Math.PI * 46;
  const hpLen = hpArc * (hud.hp / 100);

  return (
    <div className="pointer-events-none absolute inset-0 select-none">
      {/* виньетка и красная вспышка урона */}
      <div className="absolute inset-0 vignette" />
      <div
        className="absolute inset-0 transition-opacity duration-300"
        style={{
          opacity: flash * 0.5 + (lowHp ? 0.35 : 0),
          background: "radial-gradient(ellipse at center, rgba(0,0,0,0) 45%, rgba(140,29,18,0.85) 100%)",
        }}
      />

      {/* ——— объектив ——— */}
      <div className="absolute left-6 top-24 flex items-start gap-3">
        <div className="enamel-rust mt-1 bg-ink/80 px-2 py-1 text-[11px] stamped text-rust-bright">
          {String(hud.chapter).padStart(2, "0")}
        </div>
        <div className="max-w-[46vw] border-l border-bone/25 pl-3">
          <div className="stamped text-[10px] text-neutral-warm">ЗАДАЧА</div>
          <div className="mt-0.5 text-[15px] leading-tight text-bone/95 drop-shadow-[0_1px_3px_rgba(0,0,0,0.9)]">
            {hud.objective}
          </div>
        </div>
      </div>

      {/* ——— компас ——— */}
      <div className="absolute left-1/2 top-5 w-[min(560px,72vw)] -translate-x-1/2">
        <div className="relative h-8 overflow-hidden border-y border-bone/20 bg-ink/45">
          {CARDINALS.map(([deg, label]) => {
            const d = norm(deg - bearing);
            if (Math.abs(d) > 68) return null;
            const x = 50 + (d / 68) * 50;
            return (
              <div
                key={deg}
                className="absolute top-0 flex h-full -translate-x-1/2 flex-col items-center justify-center"
                style={{ left: `${x}%`, opacity: 1 - Math.abs(d) / 90 }}
              >
                <span className={`text-[11px] stamped ${d === 0 ? "text-rust-bright" : "text-bone/75"}`}>{label}</span>
                <span className="h-1.5 w-px bg-bone/50" />
              </div>
            );
          })}
          {Array.from({ length: 25 }).map((_, i) => {
            const deg = i * 15;
            const d = norm(deg - bearing);
            if (Math.abs(d) > 68) return null;
            const x = 50 + (d / 68) * 50;
            return (
              <div
                key={`t${i}`}
                className="absolute top-0 h-full w-px bg-bone/25"
                style={{ left: `${x}%` }}
              />
            );
          })}
          {hud.objPos &&
            (() => {
              const brg = (Math.atan2(hud.objPos!.x - hud.px, hud.objPos!.z - hud.pz) * 180) / Math.PI;
              const d = norm(brg - bearing);
              if (Math.abs(d) > 68) return null;
              const x = 50 + (d / 68) * 50;
              return (
                <div
                  className="absolute top-0 flex h-full -translate-x-1/2 flex-col items-center justify-center"
                  style={{ left: `${x}%` }}
                  title={`Цель · ${hud.objPos!.dist} м`}
                >
                  <div className="h-0 w-0 border-x-[6px] border-t-[8px] border-x-transparent border-t-rust-bright" />
                  <span className="tabular mt-0.5 text-[9px] text-rust-bright">{hud.objPos!.dist}</span>
                </div>
              );
            })()}
          <div className="absolute left-1/2 top-0 h-full w-px -translate-x-1/2 bg-rust" />
        </div>
        <div className="mt-1 text-center text-[10px] stamped text-neutral-warm/80">
          {String(Math.round(hud.hour)).padStart(2, "0")}:00 ·{" "}
          {hud.weather === "rain" ? "ДОЖДЬ" : hud.weather === "fog" ? "ТУМАН" : hud.weather === "storm" ? "ГРОЗА" : hud.weather === "snow" ? "СНЕГ" : "ЯСНО"}
          {" · "}
          {hud.enemiesNear} ЦЕЛЕЙ
        </div>
      </div>

      {/* ——— прицел / обнаружение ——— */}
      <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
        <svg width="120" height="120" viewBox="0 0 120 120" className="overflow-visible">
          <circle cx="60" cy="60" r="2.2" fill={hud.aiming ? "#E8E2D3" : "rgba(232,226,211,0.55)"} />
          {hud.aiming && (
            <>
              <path d="M60 40 L60 50 M60 70 L60 80 M40 60 L50 60 M70 60 L80 60" stroke="#E8E2D3" strokeWidth="1.4" opacity="0.9" />
              <path d="M34 60 A26 26 0 0 0 34 60" stroke="none" />
            </>
          )}
          {/* дуга обнаружения */}
          <circle
            cx="60"
            cy="60"
            r="34"
            fill="none"
            stroke={hud.detected > 0.7 ? "#D9613F" : hud.detected > 0.35 ? "#E8E2D3" : "#7C8A5A"}
            strokeWidth={hud.detected > 0.7 ? 3 : 2}
            strokeDasharray={`${hud.detected * 214} 214`}
            strokeLinecap="round"
            transform="rotate(-90 60 60)"
            opacity={hud.detected > 0.02 ? 0.95 : 0}
          />
        </svg>
      </div>

      {/* ——— здоровье и травмы ——— */}
      <div className="absolute bottom-6 left-6 flex items-end gap-4">
        <div className="relative h-[124px] w-[124px]">
          <svg viewBox="0 0 120 120" className="h-full w-full -rotate-[135deg]">
            <circle cx="60" cy="60" r="46" fill="none" stroke="rgba(232,226,211,0.16)" strokeWidth="9" strokeDasharray={`${hpArc * 0.75} ${hpArc}`} strokeLinecap="butt" />
            <circle
              cx="60"
              cy="60"
              r="46"
              fill="none"
              stroke={hud.hp > 60 ? "#7C8A5A" : hud.hp > 30 ? "#D9A23F" : "#B4442A"}
              strokeWidth="9"
              strokeDasharray={`${hpLen * 0.75} ${hpArc}`}
              strokeLinecap="butt"
              className="transition-all duration-300"
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <div className="tabular text-[30px] leading-none font-semibold text-bone">{hud.hp}</div>
            <div className="stamped text-[9px] text-neutral-warm">СОСТОЯНИЕ</div>
          </div>
        </div>

        <div className="mb-1 flex flex-col gap-1.5">
          {hud.injuries.map((i) => (
            <div key={i} className="enamel-rust bg-ink/85 px-2 py-1 text-[10px] stamped text-rust-bright">
              {i}
            </div>
          ))}
          {/* выносливость / дыхание */}
          <div className="mt-1 h-1.5 w-40 bg-bone/15">
            <div className="h-full bg-moss transition-all duration-200" style={{ width: `${hud.stamina}%` }} />
          </div>
          <div className="h-1.5 w-40 bg-bone/15">
            <div className="h-full bg-bone/70 transition-all duration-200" style={{ width: `${hud.breath}%` }} />
          </div>
          <div className="stamped text-[9px] text-neutral-warm/80">ВЫНОСЛИВОСТЬ · ДЫХАНИЕ</div>
        </div>
      </div>

      {/* ——— оружие ——— */}
      <div className="absolute bottom-6 right-6 text-right">
        <div className="stamped text-[11px] text-neutral-warm">{hud.weapon}</div>
        <div className="mt-0.5 flex items-end justify-end gap-2">
          <span className="tabular text-[46px] leading-none font-semibold text-bone">
            {hud.reserve >= 0 ? hud.mag : "—"}
          </span>
          <span className="tabular mb-1 text-[16px] text-neutral-warm">
            {hud.reserve >= 0 ? `/ ${hud.reserve}` : ""}
          </span>
        </div>
        {hud.dur >= 0 && (
          <div className="mt-1 ml-auto h-1.5 w-36 bg-bone/15">
            <div
              className="h-full transition-all duration-300"
              style={{ width: `${Math.max(0, Math.min(100, (hud.dur / 60) * 100))}%`, background: hud.dur < 15 ? "#B4442A" : "#7C8A5A" }}
            />
          </div>
        )}
        <div className="mt-2 flex justify-end gap-1.5">
          {(["ammo9", "ammo556", "shell", "arrow"] as const).map((k) =>
            hud.ammoByType[k] > 0 ? (
              <span key={k} className="enamel bg-ink/70 px-1.5 py-0.5 text-[10px] tabular text-bone/80">
                {k.toUpperCase()} {hud.ammoByType[k]}
              </span>
            ) : null
          )}
        </div>
      </div>

      {/* ——— шум и свет ——— */}
      <div className="absolute bottom-6 left-1/2 flex -translate-x-1/2 flex-col items-center gap-2">
        <div className="hidden gap-6 md:flex">
          <Meter label="ШУМ" value={hud.noise} color="#B4442A" />
          <Meter label="СВЕТ" value={hud.light} color="#E8E2D3" />
          <Meter label="СТРАХ" value={hud.fear} color="#7C8A5A" />
        </div>
        {hud.prompt && (
          <div className="enamel bg-ink/85 px-3 py-1.5 text-[12px] stamped text-bone">{hud.prompt}</div>
        )}
      </div>

      {/* ——— подсказки и реплики ——— */}
      {hud.toast && (
        <div className="absolute right-6 top-24 max-w-[34vw] border-r-2 border-rust bg-ink/85 px-3 py-2 text-right text-[13px] text-bone/95">
          {hud.toast}
        </div>
      )}
      {subtitle && (
        <div className="absolute bottom-24 left-1/2 w-[min(820px,90vw)] -translate-x-1/2 text-center">
          <div className="stamped text-[11px] text-rust-bright">{subtitle.who}</div>
          <div className="voice mt-1 text-[17px] leading-snug text-bone drop-shadow-[0_2px_6px_rgba(0,0,0,0.95)]">
            {subtitle.text}
          </div>
        </div>
      )}

      {/* ——— режим эхолокации ——— */}
      {hud.echo && (
        <div className="absolute inset-0 overflow-hidden bg-ink/88">
          <div className="absolute inset-0 flex items-center justify-center">
            {hud.contacts.map((c, i) => {
              const r = Math.min(300, 40 + c.dist * 9);
              const x = Math.sin(c.ang) * r;
              const y = Math.cos(c.ang) * r;
              return (
                <div
                  key={i}
                  className="absolute"
                  style={{ transform: `translate(${x}px, ${y}px)` }}
                >
                  <div
                    className={`echo-ring h-16 w-16 rounded-full border-2 ${
                      c.type === "clicker" ? "border-rust-bright" : "border-bone/80"
                    }`}
                    style={{ animationDelay: `${i * 0.18}s` }}
                  />
                  <div
                    className={`absolute left-1/2 top-1/2 h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full ${
                      c.type === "clicker" ? "bg-rust-bright" : "bg-bone"
                    }`}
                  />
                </div>
              );
            })}
            <div className="absolute h-[520px] w-[520px] rounded-full border border-bone/10" />
          </div>
          <div className="absolute left-1/2 top-1/2 mt-40 -translate-x-1/2 text-center">
            <div className="stamped text-[12px] text-bone/80">ЭХОЛОКАЦИЯ · SHIFT</div>
            <div className="voice mt-1 text-[13px] text-neutral-warm">
              Щелчки идут ближе, чем кажется. Дыши реже.
            </div>
          </div>
          <div className="absolute bottom-24 left-1/2 h-2 w-64 -translate-x-1/2 bg-bone/15">
            <div className="h-full bg-bone transition-all duration-150" style={{ width: `${hud.breath}%` }} />
          </div>
        </div>
      )}

      {/* ——— адреналин ——— */}
      {hud.adrenaline && (
        <div className="absolute inset-0 border-[6px] border-rust/40" style={{ boxShadow: "inset 0 0 120px rgba(180,68,42,0.5)" }} />
      )}

      <div className="absolute left-6 bottom-1/2 -translate-y-1/2 opacity-60">
        <Mark size={26} className="text-bone/50" />
      </div>
    </div>
  );
}

function Meter({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="stamped text-[9px] text-neutral-warm">{label}</span>
      <div className="h-1 w-24 bg-bone/15">
        <div className="h-full transition-all duration-200" style={{ width: `${Math.min(100, value)}%`, background: color }} />
      </div>
      <span className="tabular text-[10px] text-bone/70">{String(value).padStart(3, "0")}</span>
    </div>
  );
}
