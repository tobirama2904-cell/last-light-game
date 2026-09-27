/**
 * Процедурный риг персонажа: скелет из групп, анимация без внешних файлов.
 * Поддерживает: idle, walk, run, crouch, prone, прицел, отдачу, ближний бой,
 * блок, урон (вздрагивание), смерть (рагдолл-подброс), речь, взгляд головы.
 */
import * as THREE from "three";

export interface Pose {
  speed?: number;
  crouch?: number;
  prone?: number;
  aim?: number;
  aimPitch?: number;
  attack?: number;
  block?: number;
  flinch?: number;
  dead?: number;
  talk?: number;
  lookYaw?: number;
  lookPitch?: number;
  hurtLimp?: number;
}

export interface Rig {
  group: THREE.Group;
  body: THREE.Group;
  mount: THREE.Group;
  parts: Record<string, THREE.Object3D>;
  setWeapon(kind: string): void;
  animate(t: number, dt: number, p: Pose): void;
  dispose(): void;
}

const BOX = new THREE.BoxGeometry(1, 1, 1);
const SPH = new THREE.SphereGeometry(0.5, 14, 10);
const CYL = new THREE.CylinderGeometry(0.5, 0.5, 1, 10);
const MATS = new Map<string, THREE.MeshStandardMaterial>();

function mat(color: number, rough = 0.86, metal = 0.02): THREE.MeshStandardMaterial {
  const k = `${color}_${rough}_${metal}`;
  let m = MATS.get(k);
  if (!m) {
    m = new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal });
    MATS.set(k, m);
  }
  return m;
}

function part(
  geo: THREE.BufferGeometry,
  color: number,
  sx: number,
  sy: number,
  sz: number,
  x = 0,
  y = 0,
  z = 0,
  rough?: number
): THREE.Mesh {
  const m = new THREE.Mesh(geo, mat(color, rough));
  m.userData.noMerge = true;
  m.scale.set(sx, sy, sz);
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

export interface RigStyle {
  skin?: number;
  shirt?: number;
  pants?: number;
  pack?: number;
  scale?: number;
  hood?: boolean;
  hat?: boolean;
  armor?: boolean;
}

export function createRig(style: RigStyle = {}): Rig {
  const s = style.scale ?? 1;
  const skin = style.skin ?? 0xb08a6a;
  const shirt = style.shirt ?? 0x4a5240;
  const pants = style.pants ?? 0x33362e;
  const pack = style.pack ?? 0x59493a;

  const group = new THREE.Group();
  group.scale.setScalar(s);
  const body = new THREE.Group();
  group.add(body);

  const parts: Record<string, THREE.Object3D> = {};

  // таз
  const hips = part(BOX, pants, 0.36, 0.22, 0.24, 0, 0.95, 0);
  body.add(hips);
  parts.hips = hips;

  // торс
  const torsoPivot = new THREE.Group();
  torsoPivot.position.set(0, 1.02, 0);
  body.add(torsoPivot);
  const torso = part(BOX, shirt, 0.44, 0.58, 0.26, 0, 0.29, 0);
  torsoPivot.add(torso);
  parts.torso = torsoPivot;
  if (style.armor) {
    torsoPivot.add(part(BOX, 0x2b2f28, 0.48, 0.4, 0.3, 0, 0.3, 0, 0.6));
  }

  // шея + голова
  const neck = new THREE.Group();
  neck.position.set(0, 0.6, 0);
  torsoPivot.add(neck);
  neck.add(part(CYL, skin, 0.13, 0.1, 0.13, 0, 0.04, 0));
  const head = part(SPH, skin, 0.25, 0.3, 0.27, 0, 0.2, 0);
  neck.add(head);
  parts.head = neck;
  // волосы / капюшон / кепка
  if (style.hood) {
    neck.add(part(SHP_hoodGeo(), shirt, 0.3, 0.3, 0.3, 0, 0.21, -0.02));
  } else if (style.hat) {
    neck.add(part(CYL, 0x2f3329, 0.27, 0.08, 0.27, 0, 0.32, 0));
    neck.add(part(BOX, 0x2f3329, 0.24, 0.03, 0.16, 0, 0.3, 0.16));
  } else {
    neck.add(part(SHP_hairGeo(), 0x231d18, 0.26, 0.2, 0.28, 0, 0.27, -0.02));
  }
  // морда/лицо-маска (для заражённых — «гриб»)
  if (style.armor) neck.add(part(SPH, 0x1c1f1a, 0.14, 0.06, 0.03, 0, 0.2, 0.14));

  // рюкзак
  const backpack = part(BOX, pack, 0.36, 0.42, 0.2, 0, 0.3, -0.22, 0.95);
  torsoPivot.add(backpack);
  parts.backpack = backpack;

  // руки
  const mkArm = (side: number) => {
    const shoulder = new THREE.Group();
    shoulder.position.set(side * 0.28, 0.5, 0);
    torsoPivot.add(shoulder);
    shoulder.add(part(BOX, shirt, 0.15, 0.34, 0.15, 0, -0.17, 0));
    const elbow = new THREE.Group();
    elbow.position.set(0, -0.34, 0);
    shoulder.add(elbow);
    elbow.add(part(BOX, skin, 0.12, 0.3, 0.12, 0, -0.15, 0));
    const hand = new THREE.Group();
    hand.position.set(0, -0.32, 0);
    elbow.add(hand);
    hand.add(part(BOX, skin, 0.11, 0.12, 0.13, 0, -0.05, 0.02));
    return { shoulder, elbow, hand };
  };
  const aL = mkArm(-1);
  const aR = mkArm(1);
  parts.armL = aL.shoulder;
  parts.armR = aR.shoulder;
  parts.foreL = aL.elbow;
  parts.foreR = aR.elbow;
  parts.handR = aR.hand;
  parts.handL = aL.hand;

  // оружие крепится к правой кисти
  const mount = new THREE.Group();
  mount.position.set(0, -0.06, 0.02);
  aR.hand.add(mount);

  // ноги
  const mkLeg = (side: number) => {
    const hip = new THREE.Group();
    hip.position.set(side * 0.12, 0.9, 0);
    body.add(hip);
    hip.add(part(BOX, pants, 0.18, 0.44, 0.18, 0, -0.22, 0));
    const knee = new THREE.Group();
    knee.position.set(0, -0.44, 0);
    hip.add(knee);
    knee.add(part(BOX, pants, 0.15, 0.42, 0.15, 0, -0.21, 0));
    const foot = part(BOX, 0x241f1a, 0.16, 0.1, 0.28, 0, -0.44, 0.05);
    knee.add(foot);
    return { hip, knee };
  };
  const lL = mkLeg(-1);
  const lR = mkLeg(1);
  parts.legL = lL.hip;
  parts.legR = lR.hip;
  parts.shinL = lL.knee;
  parts.shinR = lR.knee;

  let phase = Math.random() * 6.28;
  let atk = 0;
  let flinch = 0;
  let deadT = 0;

  const setWeapon = (kind: string) => {
    while (mount.children.length) mount.remove(mount.children[0]);
    const w = buildWeapon(kind);
    if (w) mount.add(w);
  };

  const animate = (t: number, dt: number, p: Pose) => {
    const speed = p.speed ?? 0;
    const crouch = p.crouch ?? 0;
    const prone = p.prone ?? 0;
    const aim = p.aim ?? 0;
    const dead = p.dead ?? 0;
    const gait = Math.min(1, speed / 4.5);

    phase += dt * (1.4 + speed * 1.35);
    if (speed < 0.15) phase += dt * 1.1;

    const swing = Math.sin(phase) * (0.35 + gait * 0.75) * (1 - prone);
    const swingOpp = Math.sin(phase + Math.PI) * (0.35 + gait * 0.75) * (1 - prone);
    const kneeBend = Math.max(0, Math.sin(phase)) * gait * 0.9;

    // поза корпуса
    const targetY = prone * -0.78 - crouch * 0.34;
    body.position.y += (targetY - body.position.y) * Math.min(1, dt * 12);
    const targetRotX = prone * -1.45 + crouch * 0.22 + gait * 0.08;
    body.rotation.x += (targetRotX - body.rotation.x) * Math.min(1, dt * 10);
    body.rotation.z = Math.sin(phase * 0.5) * 0.02 * gait;

    // ноги
    lL.hip.rotation.x = swing * (1 - prone) - prone * 0.1 + crouch * 0.5;
    lR.hip.rotation.x = swingOpp * (1 - prone) - prone * 0.1 + crouch * 0.5;
    lL.knee.rotation.x = kneeBend * (1 - prone) + crouch * 1.15 + prone * 0.35;
    lR.knee.rotation.x = Math.max(0, Math.sin(phase + Math.PI)) * gait * 0.9 * (1 - prone) + crouch * 1.15 + prone * 0.35;
    if (p.hurtLimp) {
      lL.hip.rotation.x += Math.sin(phase * 2) * 0.12 * p.hurtLimp;
      body.rotation.z += 0.08 * p.hurtLimp;
    }

    // корпус: дыхание, поворот к цели
    const breath = Math.sin(t * (1.6 + gait * 3)) * 0.012 * (1 - prone);
    torsoPivot.position.y = 1.02 + breath - crouch * 0.12;
    torsoPivot.rotation.y = (p.lookYaw ?? 0) * 0.35 * (1 - aim * 0.6) + Math.sin(phase) * 0.07 * gait;
    torsoPivot.rotation.x = -flinch * 0.35 + (p.talk ?? 0) * Math.sin(t * 9) * 0.02;

    // голова
    parts.head.rotation.y = THREE.MathUtils.clamp(p.lookYaw ?? 0, -1.2, 1.2) * 0.7;
    parts.head.rotation.x = THREE.MathUtils.clamp((p.lookPitch ?? 0) * -0.6, -0.5, 0.5) + crouch * 0.1;

    // руки
    const aimPitch = p.aimPitch ?? 0;
    if (aim > 0.02) {
      aR.shoulder.rotation.x += (-1.55 - aimPitch - aR.shoulder.rotation.x) * Math.min(1, dt * 14) * aim;
      aR.shoulder.rotation.z += (-0.18 - aR.shoulder.rotation.z) * Math.min(1, dt * 12);
      aR.elbow.rotation.x += (-0.25 - aR.elbow.rotation.x) * Math.min(1, dt * 12) * aim;
      aL.shoulder.rotation.x += (-1.35 - aimPitch - aL.shoulder.rotation.x) * Math.min(1, dt * 12) * aim;
      aL.shoulder.rotation.z += (0.55 - aL.shoulder.rotation.z) * Math.min(1, dt * 12) * aim;
      aL.elbow.rotation.x += (-0.85 - aL.elbow.rotation.x) * Math.min(1, dt * 12) * aim;
    } else {
      aR.shoulder.rotation.x += (swingOpp * 0.5 - aR.shoulder.rotation.x) * Math.min(1, dt * 10);
      aR.shoulder.rotation.z += (0.14 - aR.shoulder.rotation.z) * Math.min(1, dt * 10);
      aL.shoulder.rotation.x += (swing * 0.5 - aL.shoulder.rotation.x) * Math.min(1, dt * 10);
      aL.shoulder.rotation.z += (-0.14 - aL.shoulder.rotation.z) * Math.min(1, dt * 10);
      aR.elbow.rotation.x += (-0.15 - aR.elbow.rotation.x) * Math.min(1, dt * 10);
      aL.elbow.rotation.x += (-0.15 - aL.elbow.rotation.x) * Math.min(1, dt * 10);
      if (prone > 0.4) {
        aL.shoulder.rotation.x = -0.9;
        aR.shoulder.rotation.x = -0.9;
        aL.elbow.rotation.x = -0.6;
      }
    }

    // анимация ближнего боя
    if (p.attack !== undefined && p.attack > 0) {
      atk = p.attack;
    }
    if (atk > 0) {
      const k = 1 - atk; // 0..1 по ходу удара
      const arc = Math.sin(Math.PI * k);
      aR.shoulder.rotation.x = -0.6 - arc * 1.9;
      aR.shoulder.rotation.z = -0.5 + arc * 0.5;
      aR.elbow.rotation.x = -1.1 + arc * 0.9;
      torsoPivot.rotation.y = -0.5 + arc * 1.0;
      atk = Math.max(0, atk - dt * 3.4);
    }

    // защита
    if (p.block) {
      aL.shoulder.rotation.x = -1.9;
      aL.shoulder.rotation.z = 0.7;
      aR.shoulder.rotation.x = -1.7;
      aR.shoulder.rotation.z = -0.7;
      torsoPivot.rotation.y = 0.35;
    }

    // смерть — подброс и оседание
    if (dead > 0) {
      deadT = Math.min(1, deadT + dt * 1.6);
      const e = 1 - Math.pow(1 - deadT, 3);
      body.rotation.x = THREE.MathUtils.lerp(body.rotation.x, -1.5, e * 0.2);
      body.position.y = THREE.MathUtils.lerp(body.position.y, -0.7, e * 0.2);
      aL.shoulder.rotation.x = THREE.MathUtils.lerp(aL.shoulder.rotation.x, -2.4, e * 0.2);
      aR.shoulder.rotation.x = THREE.MathUtils.lerp(aR.shoulder.rotation.x, -1.9, e * 0.2);
      lL.hip.rotation.x = 0.35;
      lR.hip.rotation.x = -0.2;
      parts.head.rotation.z = 0.6;
    } else {
      deadT = 0;
      parts.head.rotation.z = 0;
    }

    flinch += ((p.flinch ?? 0) - flinch) * Math.min(1, dt * 9);
    void t;
  };

  return { group, body, mount, parts, setWeapon, animate, dispose() {} };
}

// геометрия волос/капюшона — полусфера, чтобы не выглядела шаром
let _hair: THREE.SphereGeometry | null = null;
function SHP_hairGeo() {
  if (!_hair) _hair = new THREE.SphereGeometry(0.5, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.62);
  return _hair;
}
let _hood: THREE.SphereGeometry | null = null;
function SHP_hoodGeo() {
  if (!_hood) _hood = new THREE.SphereGeometry(0.5, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.75);
  return _hood;
}

/** Простые, но читаемые модели оружия (заполняют монтажную точку в кисти). */
export function buildWeapon(kind: string): THREE.Group | null {
  const g = new THREE.Group();
  g.userData.noMerge = true;
  const dark = mat(0x1c1e1a, 0.55, 0.55);
  const wood = mat(0x5b4230, 0.8, 0.05);
  const steel = mat(0x6d7269, 0.4, 0.8);
  const add = (geo: THREE.BufferGeometry, m: THREE.Material, x: number, y: number, z: number, sx: number, sy: number, sz: number, rx = 0) => {
    const mesh = new THREE.Mesh(geo, m);
    mesh.position.set(x, y, z);
    mesh.scale.set(sx, sy, sz);
    mesh.rotation.x = rx;
    mesh.castShadow = true;
    g.add(mesh);
    return mesh;
  };
  switch (kind) {
    case "pistol":
      add(BOX, dark, 0, 0.04, 0.09, 0.05, 0.07, 0.2);
      add(BOX, dark, 0, -0.02, 0.0, 0.045, 0.13, 0.06, 0.25);
      break;
    case "rifle":
    case "sniper":
      add(BOX, dark, 0, 0.03, 0.16, 0.05, 0.07, kind === "sniper" ? 0.66 : 0.5);
      add(BOX, wood, 0, 0.0, -0.1, 0.05, 0.1, 0.24);
      add(BOX, dark, 0, -0.05, 0.06, 0.04, 0.13, 0.07, 0.3);
      add(CYL, steel, 0, 0.05, 0.42, 0.03, 0.3, 0.03, Math.PI / 2);
      if (kind === "sniper") add(CYL, dark, 0, 0.1, 0.16, 0.05, 0.26, 0.05, Math.PI / 2);
      break;
    case "shotgun":
      add(BOX, wood, 0, 0.0, -0.08, 0.06, 0.11, 0.26);
      add(CYL, steel, 0, 0.04, 0.26, 0.045, 0.5, 0.045, Math.PI / 2);
      add(BOX, dark, 0, -0.02, 0.2, 0.05, 0.06, 0.18);
      break;
    case "bow":
      add(CYL, wood, 0, 0.02, 0.06, 0.03, 0.62, 0.03, 0.06);
      add(BOX, dark, 0, 0.02, 0.06, 0.02, 0.02, 0.62, 0);
      break;
    case "axe":
      add(CYL, wood, 0, -0.1, 0.1, 0.04, 0.5, 0.04, Math.PI / 2.4);
      add(BOX, steel, 0, 0.1, 0.3, 0.05, 0.16, 0.14);
      break;
    case "knife":
      add(BOX, steel, 0, 0.02, 0.12, 0.02, 0.05, 0.24);
      add(BOX, dark, 0, 0.0, 0.0, 0.03, 0.06, 0.1);
      break;
    case "bat":
      add(CYL, wood, 0, 0.0, 0.16, 0.06, 0.6, 0.06, Math.PI / 2.6);
      break;
    case "shiv":
      add(BOX, steel, 0, 0.02, 0.1, 0.015, 0.04, 0.18);
      break;
    default:
      return null;
  }
  return g;
}
