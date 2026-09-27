import { useEffect, useRef, useState } from "react";
import type { Game } from "../game/engine";

/**
 * Сенсорное управление для Android/телефона.
 * Левая половина — виртуальный стик (ходьба, край = бег).
 * Правая половина — обзор пальцем. Кнопки — действия.
 */

const KEY = {
  W: "KeyW",
  A: "KeyA",
  S: "KeyS",
  D: "KeyD",
  SPRINT: "ShiftLeft",
  CROUCH: "ControlLeft",
  JUMP: "Space",
} as const;

export default function TouchControls({ game, onPause }: { game: Game; onPause: () => void }) {
  const [knob, setKnob] = useState({ x: 0, y: 0, active: false });
  const [crouch, setCrouch] = useState(false);
  const [aim, setAim] = useState(false);
  const [fire, setFire] = useState(false);
  const [echo, setEcho] = useState(false);
  const [tip, setTip] = useState(true);
  const moveId = useRef<number | null>(null);
  const lookId = useRef<number | null>(null);
  const lookLast = useRef({ x: 0, y: 0 });
  const origin = useRef({ x: 0, y: 0 });

  const setKey = (code: string, down: boolean) => {
    game.input.keys[code] = down;
  };

  useEffect(() => {
    if (!fire) return;
    game.useWeapon();
    const id = window.setInterval(() => game.useWeapon(), 90);
    return () => window.clearInterval(id);
  }, [fire, game]);

  useEffect(() => {
    game.aiming = aim;
  }, [aim, game]);

  useEffect(() => {
    game.input.keys[KEY.CROUCH] = crouch;
  }, [crouch, game]);

  useEffect(() => {
    game.echoT = echo ? 1 : 0;
  }, [echo, game]);

  useEffect(() => {
    return () => {
      for (const k of Object.values(KEY)) game.input.keys[k] = false;
      game.aiming = false;
      game.echoT = 0;
    };
  }, [game]);

  const applyStick = (dx: number, dy: number) => {
    const max = 56;
    const len = Math.hypot(dx, dy);
    const clamped = len > max ? max : len;
    const nx = len > 0 ? (dx / len) * clamped : 0;
    const ny = len > 0 ? (dy / len) * clamped : 0;
    setKnob({ x: nx, y: ny, active: true });
    const t = clamped / max;
    const dead = 0.22;
    setKey(KEY.W, ny < -max * dead);
    setKey(KEY.S, ny > max * dead);
    setKey(KEY.A, nx < -max * dead);
    setKey(KEY.D, nx > max * dead);
    setKey(KEY.SPRINT, t > 0.86 && ny < 0);
  };

  const releaseStick = () => {
    moveId.current = null;
    setKnob({ x: 0, y: 0, active: false });
    setKey(KEY.W, false);
    setKey(KEY.A, false);
    setKey(KEY.S, false);
    setKey(KEY.D, false);
    setKey(KEY.SPRINT, false);
  };

  const onPointerDown = (e: React.PointerEvent) => {
    const half = window.innerWidth * 0.46;
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    if (e.clientX < half && moveId.current === null) {
      moveId.current = e.pointerId;
      origin.current = { x: e.clientX, y: e.clientY };
      applyStick(0, 0);
    } else if (lookId.current === null) {
      lookId.current = e.pointerId;
      lookLast.current = { x: e.clientX, y: e.clientY };
    }
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (e.pointerId === moveId.current) {
      applyStick(e.clientX - origin.current.x, e.clientY - origin.current.y);
    } else if (e.pointerId === lookId.current) {
      const dx = e.clientX - lookLast.current.x;
      const dy = e.clientY - lookLast.current.y;
      lookLast.current = { x: e.clientX, y: e.clientY };
      game.applyLook(dx, dy);
      if (tip) setTip(false);
    }
  };

  const onPointerUp = (e: React.PointerEvent) => {
    if (e.pointerId === moveId.current) releaseStick();
    if (e.pointerId === lookId.current) lookId.current = null;
  };

  return (
    <div
      className="absolute inset-0 z-20"
      style={{ touchAction: "none" }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    >
      {/* стик */}
      <div
        className="pointer-events-none absolute bottom-[8vh] left-[6vw] h-[136px] w-[136px] rounded-full border border-bone/25 bg-ink/35"
        style={{ opacity: knob.active ? 0.9 : 0.45 }}
      >
        <div className="absolute inset-[26%] rounded-full border border-bone/15" />
        <div
          className="absolute left-1/2 top-1/2 h-14 w-14 rounded-full border-2 border-bone/60 bg-bone/20"
          style={{ transform: `translate(calc(-50% + ${knob.x}px), calc(-50% + ${knob.y}px))` }}
        />
        <span className="absolute -top-6 left-1/2 -translate-x-1/2 stamped text-[9px] text-bone/50">
          ДВИЖЕНИЕ · КРАЙ = БЕГ
        </span>
      </div>

      {/* главные действия */}
      <div className="absolute bottom-[6vh] right-[4vw] flex items-end gap-3">
        <div className="flex flex-col gap-3">
          <Btn label="ПРЫЖОК" small onDown={() => setKey(KEY.JUMP, true)} onUp={() => setKey(KEY.JUMP, false)} />
          <Btn label="ПРИСЕД" small active={crouch} onDown={() => setCrouch((c) => !c)} />
        </div>
        <div className="flex flex-col gap-3">
          <Btn label="R" small onDown={() => game.reload()} />
          <Btn label="БЛИЖ." small onDown={() => game.melee()} />
        </div>
        <div className="flex flex-col items-center gap-3">
          <Btn label="ПРИЦЕЛ" active={aim} onDown={() => setAim((a) => !a)} />
          <Btn label="ОГОНЬ" big active={fire} onDown={() => setFire(true)} onUp={() => setFire(false)} />
        </div>
      </div>

      {/* рядом со стиком */}
      <div className="absolute bottom-[8vh] left-[calc(6vw+152px)] flex flex-col gap-3">
        <Btn label="E" small onDown={() => game.interact()} />
        <Btn label="ЭХО" small active={echo} onDown={() => setEcho((v) => !v)} />
      </div>

      {/* подсказка про обзор — уходит после первого свайпа */}
      {tip && (
        <div className="pointer-events-none absolute left-1/2 top-[38%] -translate-x-1/2 text-center">
          <div className="stamped text-[12px] text-bone/70">ПРОВЕДИ ПАЛЬЦЕМ ЗДЕСЬ — ОБЗОР</div>
          <div className="voice mt-1 text-[12px] text-neutral-warm">слева — стик, справа — камера</div>
        </div>
      )}

      {/* верхняя панель */}
      <div className="absolute right-[3vw] top-[2vh] flex gap-2">
        <Btn label="G" tiny onDown={() => game.throwItem()} />
        <Btn label="L" tiny onDown={() => game.toggleFlashlight()} />
        <Btn label="T" tiny onDown={() => game.commandCompanion()} />
        <Btn label="Q" tiny onDown={() => game.quickHeal()} />
        <Btn label="СМЕНА" tiny onDown={() => game.cycleWeapon()} />
        <Btn label="МЕНЮ" tiny onDown={onPause} />
      </div>
    </div>
  );
}

function Btn({
  label,
  onDown,
  onUp,
  big,
  small,
  tiny,
  active,
}: {
  label: string;
  onDown?: () => void;
  onUp?: () => void;
  big?: boolean;
  small?: boolean;
  tiny?: boolean;
  active?: boolean;
}) {
  const size = big
    ? "h-24 w-24 text-[13px] rounded-full"
    : small
      ? "h-16 w-16 text-[11px] rounded-full"
      : tiny
        ? "h-10 px-3 text-[10px]"
        : "h-20 w-20 text-[12px] rounded-full";
  return (
    <button
      className={`pointer-events-auto ${size} stamped border-2 transition-colors ${
        active ? "border-rust bg-rust/70 text-bone" : "border-bone/40 bg-ink/55 text-bone/90"
      }`}
      style={{ touchAction: "none" }}
      onPointerDown={(e) => {
        e.stopPropagation();
        onDown?.();
      }}
      onPointerUp={(e) => {
        e.stopPropagation();
        onUp?.();
      }}
      onPointerCancel={() => onUp?.()}
      onContextMenu={(e) => e.preventDefault()}
    >
      {label}
    </button>
  );
}
