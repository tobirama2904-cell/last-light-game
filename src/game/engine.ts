/**
 * LAST LIGHT — игровой движок.
 * Третий игрок, камера через плечо, стрельба/ближний бой, крафт и инвентарь,
 * травмы, свет/шум/стелс, погода и время суток, взаимодействие с миром.
 */
import * as THREE from "three";
import { createRig, Rig } from "./humanoid";
import { buildWorld, HUBS, MAP_SIZE, WorldData } from "./world";
import { Actor, AICtx, lineOfSight, resetAlert } from "./ai";
import { audio } from "./audio";
import type { Chapter } from "./story";

export type SurfaceName = "grass" | "concrete" | "wood" | "glass" | "water" | "metal" | "asphalt";

export interface WeaponDef {
  id: string;
  name: string;
  kind: "melee" | "gun" | "bow";
  dmg: number;
  rate: number;
  noise: number;
  range: number;
  mag?: number;
  ammo?: string;
  spread: number;
  auto?: boolean;
  zoom?: number;
  pellets?: number;
  durability?: number;
}

export const WEAPONS: Record<string, WeaponDef> = {
  fists: { id: "fists", name: "Кулаки", kind: "melee", dmg: 12, rate: 0.45, noise: 6, range: 1.7, spread: 0 },
  knife: { id: "knife", name: "Нож", kind: "melee", dmg: 30, rate: 0.55, noise: 4, range: 2.1, spread: 0, durability: 40 },
  bat: { id: "bat", name: "Бита с гвоздями", kind: "melee", dmg: 46, rate: 0.8, noise: 10, range: 2.5, spread: 0, durability: 55 },
  axe: { id: "axe", name: "Топор", kind: "melee", dmg: 72, rate: 1.0, noise: 12, range: 2.6, spread: 0, durability: 60 },
  pistol: { id: "pistol", name: "Пистолет 9мм", kind: "gun", dmg: 34, rate: 0.26, noise: 46, range: 90, mag: 12, ammo: "ammo9", spread: 0.011, auto: false },
  rifle: { id: "rifle", name: "Винтовка 5.56", kind: "gun", dmg: 44, rate: 0.11, noise: 62, range: 140, mag: 30, ammo: "ammo556", spread: 0.014, auto: true },
  shotgun: { id: "shotgun", name: "Дробовик", kind: "gun", dmg: 21, rate: 0.95, noise: 72, range: 26, mag: 6, ammo: "shell", spread: 0.06, pellets: 8, auto: false },
  sniper: { id: "sniper", name: "Снайперка", kind: "gun", dmg: 130, rate: 1.4, noise: 78, range: 320, mag: 5, ammo: "ammo556", spread: 0.002, auto: false, zoom: 4 },
  bow: { id: "bow", name: "Лук", kind: "bow", dmg: 78, rate: 1.1, noise: 3, range: 110, mag: 1, ammo: "arrow", spread: 0.006, auto: false },
};

export const ITEM_NAMES: Record<string, string> = {
  rag: "Тряпки",
  alcohol: "Спирт",
  scrap: "Металлолом",
  tape: "Изолента",
  blade: "Сталь",
  powder: "Порох",
  ammo9: "Патроны 9мм",
  ammo556: "Патроны 5.56",
  shell: "Обоймы дроби",
  arrow: "Стрелы",
  food: "Консервы",
  herb: "Травы",
  sugar: "Сахар",
  fuel: "Топливо",
  battery: "Батареи",
  notes: "Записки",
  rifle: "Винтовка 5.56",
  shotgun: "Дробовик",
  sniper: "Снайперка",
  bow: "Лук",
  bat: "Бита с гвоздями",
  axe: "Топор",
  molotov: "Коктейль Молотова",
  smoke: "Дымовая шашка",
  bottle: "Бутылка",
};

export interface Recipe {
  id: string;
  name: string;
  out: { item?: string; weapon?: string; heal?: string };
  need: Record<string, number>;
}

export const RECIPES: Recipe[] = [
  { id: "bandage", name: "Перевязка", out: { heal: "bandage" }, need: { rag: 1, alcohol: 1 } },
  { id: "splint", name: "Шина", out: { heal: "splint" }, need: { rag: 1, tape: 1 } },
  { id: "kit", name: "Аптечка", out: { heal: "kit" }, need: { rag: 1, alcohol: 1, herb: 2 } },
  { id: "ammo9", name: "Патроны 9мм ×6", out: { item: "ammo9" }, need: { scrap: 1, powder: 1 } },
  { id: "ammo556", name: "Патроны 5.56 ×8", out: { item: "ammo556" }, need: { scrap: 1, powder: 1, sugar: 1 } },
  { id: "shell", name: "Дробь ×4", out: { item: "shell" }, need: { scrap: 1, powder: 1, sugar: 1 } },
  { id: "molotov", name: "Коктейль Молотова", out: { item: "molotov" }, need: { alcohol: 1, rag: 1 } },
  { id: "smoke", name: "Дымовая шашка", out: { item: "smoke" }, need: { sugar: 1, scrap: 1 } },
  { id: "shiv", name: "Шив (скрытый клинок)", out: { weapon: "knife" }, need: { blade: 1, tape: 1 } },
  { id: "bow", name: "Лук", out: { weapon: "bow" }, need: { blade: 1, tape: 2, scrap: 1 } },
  { id: "bottle", name: "Бутылка для отвлечения", out: { item: "bottle" }, need: { scrap: 1 } },
];

export type EngineEvent =
  | { type: "ready" }
  | { type: "hurt" }
  | { type: "death" }
  | { type: "complete" }
  | { type: "objective"; text: string }
  | { type: "toast"; text: string }
  | { type: "note"; id: string }
  | { type: "prompt"; text: string }
  | { type: "pause" };

export interface HudState {
  hp: number;
  stamina: number;
  breath: number;
  injuries: string[];
  weapon: string;
  weaponId: string;
  mag: number;
  reserve: number;
  dur: number;
  noise: number;
  light: number;
  detected: number;
  objective: string;
  prompt: string;
  hour: number;
  weather: string;
  cruelty: number;
  fear: number;
  alert: number;
  kills: number;
  items: Record<string, number>;
  ammoByType: Record<string, number>;
  echo: boolean;
  adrenaline: boolean;
  aiming: boolean;
  mode: string;
  chapter: number;
  px: number;
  pz: number;
  yaw: number;
  enemiesNear: number;
  companionAlive: boolean;
  toast: string;
  contacts: { dist: number; ang: number; type: string }[];
  objPos: { x: number; z: number; dist: number } | null;
}

interface InputState {
  keys: Record<string, boolean>;
  mouse: { x: number; y: number; left: boolean; right: boolean };
}

const SAVE_KEY = "lastlight_save_v1";

export class Game {
  container: HTMLElement;
  renderer: THREE.WebGLRenderer;
  scene = new THREE.Scene();
  camera: THREE.PerspectiveCamera;
  world!: WorldData;
  cfg: { mode: "story" | "free" | "realism"; chapter: number; quality: "high" | "low" };
  onEvent: (e: EngineEvent) => void;
  onHud: (s: HudState) => void;

  // игрок
  rig!: Rig;
  pos = new THREE.Vector3(0, 0, 0);
  vel = new THREE.Vector3();
  yaw = 0;
  pitch = 0;
  grounded = false;
  hp = 100;
  stamina = 100;
  breath = 100;
  crouchT = 0;
  proneT = 0;
  aiming = false;
  aimingT = 0;
  sprinting = false;
  onGroundTime = 0;
  animState = { speed: 0, crouch: 0, prone: 0, aim: 0, aimPitch: 0, attack: 0, flinch: 0, dead: 0, lookYaw: 0, lookPitch: 0 };

  // состояние боя/выживания
  weaponId = "pistol";
  slots: string[] = ["fists", "knife", "pistol"];
  mag: Record<string, number> = { pistol: 12, rifle: 0, shotgun: 0, sniper: 0, bow: 1 };
  durability: Record<string, number> = { knife: 40, bat: 0, axe: 0 };
  items: Record<string, number> = { rag: 2, alcohol: 1, scrap: 3, tape: 1, ammo9: 24, ammo556: 0, shell: 0, arrow: 4, food: 1, herb: 1, powder: 1, sugar: 0, battery: 1, notes: 0, bottle: 2, molotov: 1, smoke: 0 };
  injuries = { bleed: 0, fracture: 0, concussion: 0, arm: 0, leg: 0 };
  cruelty = 0;
  fear = 0;
  adrenaline = 0;
  kills = 0;
  detectedGlobal = 0;
  fireCd = 0;
  reloadT = 0;
  meleeT = 0;
  stealthT = 0;
  echoT = 0;
  mode: "cinematic" | "play" | "paused" | "dead" = "cinematic";
  objective = "";
  prompt = "";
  toast = "";
  toastT = 0;
  hour = 18;
  weather: "clear" | "rain" | "fog" | "storm" | "snow" = "clear";
  weatherT = 60;
  flashT = 0;
  chapter = 1;
  goals: Chapter["goals"] = [];
  goalProgress: Record<string, number> = {};
  completeOnce = false;
  companion: Actor | null = null;
  enemies: Actor[] = [];
  fires: { pos: THREE.Vector3; t: number }[] = [];
  notesFound = new Set<string>();

  // fx
  muzzle = new THREE.PointLight(0xffd9a0, 0, 22, 2);
  flashlight!: THREE.SpotLight;
  tracers: { line: THREE.Line; t: number }[] = [];
  impacts: { mesh: THREE.Mesh; t: number }[] = [];

  input: InputState = { keys: {}, mouse: { x: 0, y: 0, left: false, right: false } };
  isTouch = false;
  raf = 0;
  clock = new THREE.Clock();
  time = 0;
  paused = false;
  disposed = false;
  lastStepPhase = 0;
  noise = 0;
  lightLevel = 0.5;
  safePos = new THREE.Vector3();
  hudSig = "";
  camShake = 0;
  slowmo = 1;
  cinematic = { active: false, pos: new THREE.Vector3(0, 4, 10), look: new THREE.Vector3(0, 1, 0), t: 0 };
  playerName = "MARK";

  constructor(
    container: HTMLElement,
    cfg: { mode: "story" | "free" | "realism"; chapter: number; quality?: "high" | "low" },
    cb: { onEvent: (e: EngineEvent) => void; onHud: (s: HudState) => void }
  ) {
    this.container = container;
    // телефон/планшет — автоматически облегчённый профиль
    this.isTouch =
      ("ontouchstart" in window && navigator.maxTouchPoints > 0) || navigator.maxTouchPoints > 1;
    const weakCpu = (navigator.hardwareConcurrency ?? 8) <= 6;
    const weakMem = ((navigator as any).deviceMemory ?? 8) <= 4;
    const auto: "high" | "low" = this.isTouch || weakCpu || weakMem || window.innerWidth < 900 ? "low" : "high";
    this.cfg = { mode: cfg.mode, chapter: cfg.chapter, quality: cfg.quality ?? auto };
    this.onEvent = cb.onEvent;
    this.onHud = cb.onHud;

    this.renderer = new THREE.WebGLRenderer({
      antialias: this.cfg.quality === "high",
      powerPreference: "high-performance",
      stencil: false,
      depth: true,
    });
    // на телефоне рендерим чуть ниже native-плотности — стабильные 60 fps важнее пикселей
    this.renderer.setPixelRatio(
      this.cfg.quality === "high" ? Math.min(window.devicePixelRatio, 1.75) : Math.min(window.devicePixelRatio, 1.1)
    );
    this.renderer.setSize(container.clientWidth || window.innerWidth, container.clientHeight || window.innerHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = this.cfg.quality === "high" ? THREE.PCFSoftShadowMap : THREE.PCFShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    container.appendChild(this.renderer.domElement);
    this.renderer.domElement.style.display = "block";
    this.renderer.domElement.style.touchAction = "none";

    this.camera = new THREE.PerspectiveCamera(
      62,
      (container.clientWidth || 1) / (container.clientHeight || 1),
      0.1,
      this.cfg.quality === "high" ? 1400 : 420
    );
    this.scene.fog = new THREE.FogExp2(0x8d9683, this.cfg.quality === "high" ? 0.011 : 0.016);

    this.world = buildWorld(this.scene, this.cfg.quality);
    this.scene.add(this.muzzle);
    this.buildPlayer();
    this.spawnChapter(this.cfg.chapter);
    this.bind();
    this.applyTimeOfDay(true);
    this.emit(true);
  }

  // ————————————————————————— построение —————————————————————————
  private buildPlayer() {
    this.rig = createRig({ shirt: 0x59614a, pants: 0x35392f, skin: 0xbb9272, pack: 0x6a5a44, hood: false });
    this.rig.setWeapon("pistol");
    this.scene.add(this.rig.group);
    this.flashlight = new THREE.SpotLight(0xfff0d0, 0, 42, Math.PI / 5.5, 0.45, 1.4);
    this.flashlight.castShadow = false;
    this.scene.add(this.flashlight, this.flashlight.target);

    const spawn = HUBS.find((h) => h.id === this.chapterHub(this.cfg.chapter));
    this.pos.set(spawn?.x ?? 0, 0, (spawn?.z ?? 0) + 14);
    this.pos.y = this.world.heightAt(this.pos.x, this.pos.z);
    this.safePos.copy(this.pos);
    this.rig.group.position.copy(this.pos);
  }

  private chapterHub(ch: number): string {
    const map: Record<number, string> = { 1: "city", 2: "mill", 3: "dam", 4: "uni", 5: "winter", 6: "prison", 7: "church", 8: "church" };
    return this.cfg.mode === "free" ? "mill" : map[ch] ?? "city";
  }

  spawnChapter(ch: number, chapter?: Chapter) {
    for (const a of this.enemies) this.scene.remove(a.rig.group);
    this.enemies = [];
    if (this.companion) this.scene.remove(this.companion.rig.group);
    this.companion = null;
    resetAlert();

    const conf = chapter?.level;
    const hubId = this.chapterHub(ch);
    const hub = HUBS.find((h) => h.id === hubId) ?? HUBS[0];
    this.chapter = ch;
    this.hour = conf?.hour ?? (this.cfg.mode === "free" ? 17 : 18);
    this.weather = conf?.weather ?? (this.cfg.mode === "free" ? "clear" : "fog");
    this.objective = chapter?.objective ?? "Исследуйте район и соберите припасы";

    // точка старта: у главного хаба
    const start = this.findWalkable(hub.x, hub.z + hub.r * 0.55);
    this.pos.copy(start);
    this.vel.set(0, 0, 0);
    this.safePos.copy(start);
    this.yaw = Math.atan2(hub.x - this.pos.x, hub.z - this.pos.z);

    const list = conf?.enemies ?? ["runner", "stalker", "clicker", "wolf"];
    const base = conf?.count ?? (this.cfg.mode === "free" ? 14 : 8);
    const count = this.cfg.quality === "low" ? Math.max(5, Math.round(base * 0.65)) : base;
    for (let i = 0; i < count; i++) {
      const type = list[i % list.length];
      const p = this.findWalkable(hub.x + (Math.random() - 0.5) * hub.r * 1.7, hub.z + (Math.random() - 0.5) * hub.r * 1.7, 40);
      if (p.distanceTo(this.pos) < 24) continue;
      const isBoss = ch === 4 && type === "bloater" && i === count - 1;
      const a = new Actor(type, p, this.world, { boss: isBoss });
      if (isBoss) {
        a.maxHp = a.hp = 520;
        a.rig.group.scale.setScalar(1.6);
        this.onEvent({ type: "toast", text: "БЛОАТЕР · три фазы · ищите тяжёлое оружие" });
      }
      this.enemies.push(a);
      this.scene.add(a.rig.group);
    }
    // босс-Блоатер главы 4 (три фазы: броски спор, таран, ближний разрыв)
    if (ch === 4) {
      const p = this.findWalkable(hub.x, hub.z - 10, 34);
      const boss = new Actor("bloater", p, this.world, { boss: true });
      boss.maxHp = boss.hp = 520;
      boss.rig.group.scale.setScalar(1.65);
      this.enemies.push(boss);
      this.scene.add(boss.rig.group);
      this.onEvent({ type: "toast", text: "БЛОАТЕР · три фазы · держите дистанцию" });
    }
    // финальный босс главы 7
    if (ch === 7) {
      const p = this.findWalkable(hub.x, hub.z - 6, 30);
      const boss = new Actor("wolf", p, this.world, { boss: true, weapon: "rifle" });
      boss.maxHp = boss.hp = 420;
      boss.rig.group.scale.setScalar(1.15);
      this.enemies.push(boss);
      this.scene.add(boss.rig.group);
    }

    if (conf?.companion ?? (this.cfg.mode !== "story" || ch > 1)) {
      const cp = this.findWalkable(this.pos.x - 3, this.pos.z - 3, 12);
      this.companion = new Actor("companion", cp, this.world, { weapon: "rifle" });
      this.companion.rig.setWeapon("rifle");
      this.scene.add(this.companion.rig.group);
    }

    // цели главы
    this.goals = (chapter?.goals ?? []).map((g) => ({ ...g }));
    this.goalProgress = {};
    this.completeOnce = false;
    this.hp = Math.max(this.hp, 70);
    this.injuries = { bleed: 0, fracture: 0, concussion: 0, arm: 0, leg: 0 };
    this.emit(true);
  }

  private findWalkable(x: number, z: number, range = 26): THREE.Vector3 {
    const cand = this.world.walkable.filter((w) => Math.hypot(w.x - x, w.z - z) < range);
    const p = cand.length ? cand[Math.floor(Math.random() * cand.length)] : new THREE.Vector3(x, this.world.heightAt(x, z), z);
    return p.clone();
  }

  // ————————————————————————— ввод —————————————————————————
  private onKeyDown = (e: KeyboardEvent) => {
    if (this.mode !== "play") return;
    this.input.keys[e.code] = true;
    if (e.code === "KeyR") this.reload();
    if (e.code === "KeyE") this.interact();
    if (e.code === "KeyF") this.melee();
    if (e.code === "KeyG") this.throwItem();
    if (e.code === "KeyL") this.toggleFlashlight();
    if (e.code === "KeyT") this.commandCompanion();
    if (e.code === "KeyH") this.echoT = 1;
    if (e.code === "KeyQ") this.quickHeal();
    if (["Digit1", "Digit2", "Digit3", "Digit4", "Digit5", "Digit6", "Digit7"].includes(e.code)) {
      const idx = Number(e.code.replace("Digit", "")) - 1;
      if (this.slots[idx]) this.equip(this.slots[idx]);
    }
    if (e.code === "Space") e.preventDefault();
  };
  private onKeyUp = (e: KeyboardEvent) => {
    this.input.keys[e.code] = false;
    if (e.code === "KeyH") this.echoT = 0;
  };
  private onMouseMove = (e: MouseEvent) => {
    if (document.pointerLockElement !== this.renderer.domElement) return;
    const sens = 0.0021 * (this.aiming ? 0.6 : 1);
    this.yaw -= e.movementX * sens;
    this.pitch -= e.movementY * sens;
    this.pitch = Math.max(-1.15, Math.min(1.05, this.pitch));
  };
  private onMouseDown = (e: MouseEvent) => {
    if (this.mode !== "play" || this.isTouch) return;
    if (document.pointerLockElement !== this.renderer.domElement) {
      this.renderer.domElement.requestPointerLock();
      return;
    }
    if (e.button === 0) {
      this.input.mouse.left = true;
      this.useWeapon();
    }
    if (e.button === 2) {
      this.input.mouse.right = true;
      this.aiming = true;
    }
  };
  private onMouseUp = (e: MouseEvent) => {
    if (e.button === 0) this.input.mouse.left = false;
    if (e.button === 2) {
      this.input.mouse.right = false;
      this.aiming = false;
    }
  };
  private onWheel = (e: WheelEvent) => {
    if (this.mode !== "play") return;
    const i = this.slots.indexOf(this.weaponId);
    const n = (i + (e.deltaY > 0 ? 1 : -1) + this.slots.length) % this.slots.length;
    this.equip(this.slots[n]);
  };
  private onResize = () => {
    const w = this.container.clientWidth || window.innerWidth;
    const h = this.container.clientHeight || window.innerHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
  };
  private onLockChange = () => {
    if (this.isTouch) return;
    if (this.mode === "play" && document.pointerLockElement !== this.renderer.domElement) {
      this.mode = "paused";
      this.paused = true;
      this.onEvent({ type: "pause" });
    }
  };
  private onContext = (e: Event) => e.preventDefault();

  private bind() {
    window.addEventListener("keydown", this.onKeyDown);
    window.addEventListener("keyup", this.onKeyUp);
    window.addEventListener("mousemove", this.onMouseMove);
    window.addEventListener("mousedown", this.onMouseDown);
    window.addEventListener("mouseup", this.onMouseUp);
    window.addEventListener("wheel", this.onWheel, { passive: true });
    window.addEventListener("resize", this.onResize);
    document.addEventListener("pointerlockchange", this.onLockChange);
    this.renderer.domElement.addEventListener("contextmenu", this.onContext);
  }

  requestLock() {
    if (this.isTouch) return;
    this.renderer.domElement.requestPointerLock?.();
  }

  // ————————————————————————— цикл —————————————————————————
  start() {
    this.clock.start();
    const loop = () => {
      if (this.disposed) return;
      this.raf = requestAnimationFrame(loop);
      const raw = Math.min(0.05, this.clock.getDelta());
      if (!this.paused) this.update(raw);
      this.renderer.render(this.scene, this.camera);
    };
    this.raf = requestAnimationFrame(loop);
  }

  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    window.removeEventListener("keydown", this.onKeyDown);
    window.removeEventListener("keyup", this.onKeyUp);
    window.removeEventListener("mousemove", this.onMouseMove);
    window.removeEventListener("mousedown", this.onMouseDown);
    window.removeEventListener("mouseup", this.onMouseUp);
    window.removeEventListener("wheel", this.onWheel);
    window.removeEventListener("resize", this.onResize);
    document.removeEventListener("pointerlockchange", this.onLockChange);
    this.renderer.domElement.removeEventListener("contextmenu", this.onContext);
    this.renderer.dispose();
    if (this.renderer.domElement.parentElement) this.renderer.domElement.parentElement.removeChild(this.renderer.domElement);
    audio.stopSpeech();
  }

  private update(dtRaw: number) {
    const dt = dtRaw * this.slowmo;
    this.time += dt;

    if (this.mode === "cinematic") {
      this.updateCinematic(dt);
      this.applyTimeOfDay();
      const d = new THREE.Vector3();
      this.camera.getWorldDirection(d);
      audio.listener(this.camera.position.x, this.camera.position.y, this.camera.position.z, d.x, d.y, d.z);
      return;
    }
    if (this.mode !== "play") return;

    this.updatePlayer(dt);
    this.updateAICtx(dt);
    this.updateFx(dt);
    this.updateWorld(dt);
    this.updateCamera(dt);
    this.checkGoals();
    this.emit();

    const d = new THREE.Vector3();
    this.camera.getWorldDirection(d);
    audio.listener(this.camera.position.x, this.camera.position.y, this.camera.position.z, d.x, d.y, d.z);

    // напряжение саундтрека
    const near = this.enemies.filter((e) => !e.isDead && e.pos.distanceTo(this.pos) < 45).length;
    const inCombat = this.enemies.some((e) => e.state === "combat" && !e.isDead);
    audio.setTension(Math.min(1, this.fear * 0.5 + (inCombat ? 0.5 : 0) + near * 0.06), inCombat ? Math.min(1, 0.35 + near * 0.18) : 0, this.cruelty < -3 ? 0.2 : 0.75);
    audio.heartbeat(Math.min(1, (this.hp < 40 ? 0.6 : 0) + (inCombat ? 0.35 : 0) + (this.echoT ? 0.35 : 0)));
  }

  private updateCinematic(dt: number) {
    this.cinematic.t += dt;
    const t = this.cinematic.t;
    const c = this.cinematic;
    // медленный дрейф + лёгкое «дыхание» камеры
    const drift = new THREE.Vector3(Math.sin(t * 0.16) * 0.5, Math.sin(t * 0.23) * 0.22, Math.cos(t * 0.14) * 0.5);
    this.camera.position.lerp(c.pos.clone().add(drift), Math.min(1, dt * 2.4));
    const look = c.look.clone();
    look.y += Math.sin(t * 0.3) * 0.06;
    this.camera.lookAt(look);
    // персонажи «играют» реплику
    if (this.companion) this.companion.rig.animate(this.time, dt, { speed: 0, lookYaw: Math.sin(t * 0.5) * 0.4, talk: 1 });
      this.rig.animate(this.time, dt, { speed: 0, lookYaw: -0.3 + Math.sin(t * 0.4) * 0.3, talk: 0.6 });
      void this.mode;
      // виньетка/титры рисуются поверх, сцену рендерит общий цикл
    }

  setCinematicCamera(pos?: [number, number, number], look?: [number, number, number]) {
    this.cinematic.active = true;
    this.mode = "cinematic";
    if (pos) this.cinematic.pos.set(pos[0], pos[1], pos[2]);
    if (look) this.cinematic.look.set(look[0], look[1], look[2]);
    else this.cinematic.look.copy(this.pos).add(new THREE.Vector3(0, 1.5, 0));
    this.cinematic.t = 0;
    // герои остаются на точке спавна главы — катсцена не должна телепортировать игрока
    this.rig.group.position.copy(this.pos);
    if (this.companion) {
      this.companion.pos.copy(this.pos).add(new THREE.Vector3(-2.2, 0, 1.4));
      this.companion.pos.y = this.world.heightAt(this.companion.pos.x, this.companion.pos.z);
      this.companion.rig.group.position.copy(this.companion.pos);
      this.companion.rig.group.rotation.y = this.yaw;
    }
    this.rig.group.rotation.y = this.yaw;
    this.camera.position.copy(this.cinematic.pos);
    this.camera.lookAt(this.cinematic.look);
  }

  beginPlay() {
    this.mode = "play";
    this.paused = false;
    this.cinematic.active = false;
    this.safePos.copy(this.pos);
    this.emit(true);
    this.onEvent({ type: "objective", text: this.objective });
  }

  // ————————————————————————— игрок —————————————————————————
  private updatePlayer(dt: number) {
    const k = this.input.keys;
    const crouchKey = k["ControlLeft"] || k["KeyC"];
    const proneKey = k["KeyZ"];
    this.crouchT += ((crouchKey || proneKey ? 1 : 0) - this.crouchT) * Math.min(1, dt * 9);
    this.proneT += ((proneKey ? 1 : 0) - this.proneT) * Math.min(1, dt * 7);

    const fwd = new THREE.Vector3(Math.sin(this.yaw), 0, Math.cos(this.yaw));
    const right = new THREE.Vector3().crossVectors(fwd, new THREE.Vector3(0, 1, 0));
    let mx = 0;
    let mz = 0;
    if (k["KeyW"]) mz += 1;
    if (k["KeyS"]) mz -= 1;
    if (k["KeyD"]) mx += 1;
    if (k["KeyA"]) mx -= 1;
    const moving = mx !== 0 || mz !== 0;

    this.sprinting = !!k["ShiftLeft"] && mz > 0 && !this.aiming && this.crouchT < 0.4 && this.proneT < 0.4 && this.stamina > 2;
    let speed = this.sprinting ? 5.7 : this.aiming ? 2.1 : 2.9;
    speed *= 1 - this.crouchT * 0.55 - this.proneT * 0.72;
    if (this.injuries.fracture > 0 || this.injuries.leg > 0) speed *= 0.52;
    if (this.injuries.arm > 0) speed *= 0.94;
    if (this.hp < 30) speed *= 0.85;
    if (this.echoT) speed *= 0.55;

    // стамина
    if (this.sprinting && moving) this.stamina = Math.max(0, this.stamina - dt * 17);
    else this.stamina = Math.min(100, this.stamina + dt * (moving ? 7 : 15));
    // задержка дыхания + режим эхолокации
    const wasEcho = this.echoT > 0;
    if (this.echoT) this.breath = Math.max(0, this.breath - dt * 15);
    else this.breath = Math.min(100, this.breath + dt * 22);
    if (this.breath <= 0) this.echoT = 0;
    if (wasEcho !== this.echoT > 0) audio.setEcho(this.echoT > 0);

    const wish = fwd.clone().multiplyScalar(mz).add(right.clone().multiplyScalar(mx));
    if (wish.lengthSq() > 0) wish.normalize();
    const accel = this.grounded ? 14 : 3;
    this.vel.x += (wish.x * speed - this.vel.x) * Math.min(1, dt * accel);
    this.vel.z += (wish.z * speed - this.vel.z) * Math.min(1, dt * accel);
    if (!moving) {
      this.vel.x *= Math.max(0, 1 - dt * (this.grounded ? 12 : 1));
      this.vel.z *= Math.max(0, 1 - dt * (this.grounded ? 12 : 1));
    }

    // прыжок / запрыгивание
    if (this.grounded && k["Space"]) {
      if (!this.tryClimb()) {
        this.vel.y = 6.1 - this.crouchT * 1.2;
        this.grounded = false;
        audio.footstep("concrete", 0.3);
      }
      k["Space"] = false;
    }
    this.vel.y -= 23 * dt;

    // интеграция + коллизии
    const before = this.pos.clone();
    this.pos.addScaledVector(this.vel, dt);
    this.resolveCollisions();
    this.collideGround(dt);

    // вода/падение
    if (this.pos.y < this.world.heightAt(this.pos.x, this.pos.z) - 6) {
      this.pos.copy(this.safePos);
      this.vel.set(0, 0, 0);
      this.damage(14, "fall");
    }
    const half = MAP_SIZE / 2 - 6;
    this.pos.x = Math.max(-half, Math.min(half, this.pos.x));
    this.pos.z = Math.max(-half, Math.min(half, this.pos.z));

    // шаги и шум
    const planarSpeed = Math.hypot(this.vel.x, this.vel.z);
    this.lastStepPhase += dt * planarSpeed * 1.5;
    if (this.grounded && this.lastStepPhase > Math.PI) {
      this.lastStepPhase -= Math.PI;
      const surf = this.world.surfaceAt(this.pos.x, this.pos.z);
      audio.footstep(surf, (this.sprinting ? 0.5 : this.crouchT > 0.5 ? 0.12 : 0.3) * (surf === "glass" ? 1.4 : 1));
      if (surf === "glass") this.noiseEvent(22);
    }

    // уровень шума для ИИ
    let n = 0;
    if (moving) n = planarSpeed / 12 + (this.crouchT > 0.5 ? 0 : 0.12) + (this.sprinting ? 0.25 : 0);
    if (this.aiming) n *= 0.7;
    this.noise += (n - this.noise) * Math.min(1, dt * 6);
    if (this.noise > 0.16 && moving) this.pushNoise(dt);

    // кровотечение, контузия
    if (this.injuries.bleed > 0) {
      this.hp -= this.injuries.bleed * dt * 1.1;
      this.injuries.bleed = Math.max(0, this.injuries.bleed - dt * 0.12);
      if (this.hp <= 0) this.die();
    }
    if (this.injuries.concussion > 0) this.injuries.concussion = Math.max(0, this.injuries.concussion - dt * 0.08);
    this.fear = Math.max(0, this.fear - dt * 0.06);

    // цель/анимация
    this.rig.group.position.copy(this.pos);
    const face = this.aiming ? this.yaw : this.yaw + (moving ? 0 : Math.sin(this.time * 0.4) * 0.05);
    this.rig.group.rotation.y = damp(this.rig.group.rotation.y, face, 14, dt);
    this.animState.speed = planarSpeed;
    this.animState.crouch = this.crouchT;
    this.animState.prone = this.proneT;
    this.animState.aim = this.aimingT;
    this.animState.aimPitch = -this.pitch * this.aimingT;
    if (this.meleeT > 0) {
      this.animState.attack = this.meleeT;
      this.meleeT = Math.max(0, this.meleeT - dt * 3.2);
    }
    this.animState.lookYaw = this.aiming ? 0 : THREE.MathUtils.clamp((moving ? 0 : Math.sin(this.time * 0.3) * 0.4), -1, 1);
    this.animState.flinch *= Math.max(0, 1 - dt * 4);
    this.animState.dead = this.hp <= 0 ? 1 : 0;
    this.rig.animate(this.time, dt, this.animState);
    this.aimingT += ((this.aiming && this.reloadT <= 0 ? 1 : 0) - this.aimingT) * Math.min(1, dt * 12);

    if (this.fireCd > 0) this.fireCd -= dt;
    if (this.reloadT > 0) {
      this.reloadT -= dt;
      if (this.reloadT <= 0) this.finishReload();
    }
    if (this.toastT > 0) {
      this.toastT -= dt;
      if (this.toastT <= 0) this.toast = "";
    }
    this.findInteract();
    if (this.injuries.leg > 0) this.injuries.leg = Math.max(0, this.injuries.leg - dt * 0.01);

    void before;
    void dt;
  }

  private noiseAccum = 0;
  private pushNoise(dt: number) {
    this.noiseAccum += dt;
    if (this.noiseAccum > 0.6) {
      this.noiseAccum = 0;
      this.noiseEvent(this.noise * 40);
    }
  }

  private noiseEvent(radius: number) {
    if (radius < 4) return;
    this.notifyNoise(this.pos.clone(), radius, "step");
  }

  private notifyNoise(pos: THREE.Vector3, radius: number, kind: string) {
    for (const a of this.enemies) {
      if (a.isDead) continue;
      const d = a.pos.distanceTo(pos);
      if (d < radius && a.state !== "combat") {
        a.lastKnown.copy(pos);
        a.memory = Math.max(a.memory, 5);
        if (a.state === "patrol" || a.state === "idle") a.state = "investigate";
      }
    }
    if (kind === "shout") this.detectedGlobal = 1;
  }

  private tryClimb(): boolean {
    const fwd = new THREE.Vector3(Math.sin(this.yaw), 0, Math.cos(this.yaw));
    for (const c of this.world.colliders) {
      if (c.max.y - this.pos.y > 2.4 || c.max.y - this.pos.y < 0.4) continue;
      const px = this.pos.x + fwd.x * 0.7;
      const pz = this.pos.z + fwd.z * 0.7;
      if (px > c.min.x - 0.3 && px < c.max.x + 0.3 && pz > c.min.z - 0.3 && pz < c.max.z + 0.3) {
        const headroom = !this.world.colliders.some(
          (o) => o !== c && px > o.min.x - 0.35 && px < o.max.x + 0.35 && pz > o.min.z - 0.35 && pz < o.max.z + 0.35 && o.min.y < c.max.y + 1.7 && o.max.y > c.max.y + 0.4
        );
        if (!headroom) return false;
        this.pos.set(px, c.max.y + 0.02, pz);
        this.vel.set(0, 0, 0);
        audio.footstep(this.world.surfaceAt(px, pz), 0.4);
        return true;
      }
    }
    return false;
  }

  private resolveCollisions() {
    const r = 0.42;
    const feet = this.pos.y + 0.25;
    const head = this.pos.y + 1.75;
    for (const c of this.world.colliders) {
      if (c.max.y < feet || c.min.y > head) continue;
      const overlap = this.pos.x + r > c.min.x && this.pos.x - r < c.max.x && this.pos.z + r > c.min.z && this.pos.z - r < c.max.z;
      if (!overlap) continue;
      const stepUp = c.max.y - this.pos.y;
      if (stepUp > 0 && stepUp <= 0.58 && this.grounded) {
        this.pos.y = c.max.y;
        continue;
      }
      if (c.kind === "climb" || stepUp <= 0.58) {
        if (this.grounded && stepUp <= 0.58) {
          this.pos.y = c.max.y;
          continue;
        }
      }
      const dxL = this.pos.x + r - c.min.x;
      const dxR = c.max.x - (this.pos.x - r);
      const dzL = this.pos.z + r - c.min.z;
      const dzR = c.max.z - (this.pos.z - r);
      const m = Math.min(dxL, dxR, dzL, dzR);
      if (m === dxL) this.pos.x = c.min.x - r;
      else if (m === dxR) this.pos.x = c.max.x + r;
      else if (m === dzL) this.pos.z = c.min.z - r;
      else this.pos.z = c.max.z + r;
      this.vel.x *= 0.2;
      this.vel.z *= 0.2;
    }
  }

  private collideGround(dt: number) {
    let support = this.world.heightAt(this.pos.x, this.pos.z);
    const r = 0.36;
    for (const c of this.world.colliders) {
      if (c.max.y > this.pos.y + 0.65) continue;
      if (this.pos.x + r > c.min.x && this.pos.x - r < c.max.x && this.pos.z + r > c.min.z && this.pos.z - r < c.max.z) {
        support = Math.max(support, c.max.y);
      }
    }
    if (this.pos.y <= support + 0.02) {
      if (!this.grounded && this.vel.y < -9) {
        audio.footstep(this.world.surfaceAt(this.pos.x, this.pos.z), 0.6);
        this.damage(Math.min(30, (-this.vel.y - 9) * 1.6), "fall");
      }
      this.pos.y = support;
      this.vel.y = 0;
      this.grounded = true;
      this.onGroundTime += dt;
      this.safePos.copy(this.pos);
    } else {
      this.grounded = false;
    }
    // потолок
    const ceil = this.world.colliders.find(
      (c) => this.pos.x > c.min.x - 0.3 && this.pos.x < c.max.x + 0.3 && this.pos.z > c.min.z - 0.3 && this.pos.z < c.max.z + 0.3 && c.min.y > this.pos.y + 0.6 && c.min.y < this.pos.y + 1.9
    );
    if (ceil && this.vel.y > 0) this.vel.y = 0;
  }

  // ————————————————————————— камера —————————————————————————
  private updateCamera(dt: number) {
    const pivot = this.pos.clone().add(new THREE.Vector3(0, 1.52 - this.crouchT * 0.45 - this.proneT * 0.7, 0));
    const pitch = this.pitch;
    const yaw = this.yaw;
    const dir = new THREE.Vector3(Math.cos(pitch) * Math.sin(yaw), Math.sin(pitch), Math.cos(pitch) * Math.cos(yaw));
    const fwd = new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw));
    const right = new THREE.Vector3().crossVectors(fwd, new THREE.Vector3(0, 1, 0));

    const dist = THREE.MathUtils.lerp(3.5, 1.7, this.aimingT) - this.proneT * 0.7;
    const shoulder = 0.62 - this.aimingT * 0.16;
    let want = pivot.clone().addScaledVector(dir, -dist).addScaledVector(right, shoulder);

    // не даём камере войти в геометрию
    const toCam = want.clone().sub(pivot);
    const len = toCam.length();
    const nd = toCam.clone().normalize();
    let hitT = len;
    for (const c of this.world.colliders) {
      const t = rayBox(pivot, nd, c.min, c.max);
      if (t !== null && t < hitT) hitT = t;
    }
    if (hitT < len) want = pivot.clone().addScaledVector(nd, Math.max(0.4, hitT - 0.25));

    this.camera.position.lerp(want, Math.min(1, dt * (this.aiming ? 22 : 11)));
    if (this.camShake > 0) {
      this.camShake = Math.max(0, this.camShake - dt * 2.6);
      const s = this.camShake * 0.16;
      this.camera.position.x += (Math.random() - 0.5) * s;
      this.camera.position.y += (Math.random() - 0.5) * s;
    }
    // лёгкое покачивание при беге
    const sw = Math.hypot(this.vel.x, this.vel.z);
    this.camera.position.y += Math.sin(this.time * 9) * 0.012 * Math.min(1, sw / 5) * (1 - this.aimingT);

    const look = this.camera.position.clone().add(dir);
    this.camera.lookAt(look);

    const targetFov = this.aiming ? (WEAPONS[this.weaponId]?.zoom ?? 1.35) * 18 + 34 : 62;
    this.camera.fov += (targetFov - this.camera.fov) * Math.min(1, dt * 9);
    this.camera.updateProjectionMatrix();

    // фонарь
    this.flashlight.position.copy(this.camera.position);
    this.flashlight.target.position.copy(this.camera.position).addScaledVector(dir, 12);
    this.flashlight.target.updateMatrixWorld();
  }

  // ————————————————————————— оружие и бой —————————————————————————
  /** обзор пальцем/мышью (используется сенсорным управлением) */
  applyLook(dx: number, dy: number) {
    const sens = 0.0042 * (this.aiming ? 0.55 : 1);
    this.yaw -= dx * sens;
    this.pitch -= dy * sens;
    this.pitch = Math.max(-1.15, Math.min(1.05, this.pitch));
  }

  /** следующий слот оружия — для кнопки на телефоне */
  cycleWeapon() {
    const i = this.slots.indexOf(this.weaponId);
    this.equip(this.slots[(i + 1) % this.slots.length]);
  }

  equip(id: string) {
    if (!this.slots.includes(id)) return;
    if (this.reloadT > 0) this.reloadT = 0;
    this.weaponId = id;
    this.rig.setWeapon(id === "fists" ? "" : id);
    audio.ui("hover");
    this.emit(true);
  }

  private currentWeapon(): WeaponDef {
    return WEAPONS[this.weaponId] ?? WEAPONS.fists;
  }

  private ammoCount(type: string) {
    if (type === "ammo9" || type === "ammo556" || type === "shell" || type === "arrow") return this.items[type] ?? 0;
    return 0;
  }

  reload() {
    const w = this.currentWeapon();
    if (w.kind !== "gun" || this.reloadT > 0) return;
    const magSize = w.mag!;
    const have = this.mag[w.id] ?? 0;
    const reserve = this.ammoCount(w.ammo!);
    if (have >= magSize || reserve <= 0) return;
    this.reloadT = w.id === "shotgun" ? 2.4 : 1.7;
    audio.reload(w.id === "shotgun" ? "pump" : "mag");
    this.emit(true);
  }

  private finishReload() {
    const w = this.currentWeapon();
    const need = w.mag! - (this.mag[w.id] ?? 0);
    const take = Math.min(need, this.ammoCount(w.ammo!));
    this.mag[w.id] = (this.mag[w.id] ?? 0) + take;
    this.items[w.ammo!] = this.ammoCount(w.ammo!) - take;
    this.emit(true);
  }

  useWeapon() {
    if (this.reloadT > 0 || this.fireCd > 0) return;
    const w = this.currentWeapon();
    if (w.kind === "melee") return this.melee();
    const mag = this.mag[w.id] ?? 0;
    if (mag <= 0) {
      audio.ui("back");
      this.reload();
      return;
    }
    this.fireCd = w.rate;
    this.mag[w.id] = mag - 1;
    this.camShake = Math.min(1, this.camShake + (w.id === "sniper" ? 0.9 : w.id === "shotgun" ? 0.8 : 0.42));
    audio.shot(w.id, this.camera.position.x, this.camera.position.y, this.camera.position.z);

    const dir = new THREE.Vector3();
    this.camera.getWorldDirection(dir);
    const spread = w.spread * (this.aiming ? 0.45 : 1) * (1 + (100 - this.stamina) / 160) * (this.injuries.arm > 0 ? 2.2 : 1) * (this.fear > 0.5 ? 1.6 : 1);
    const pellets = w.pellets ?? 1;
    for (let i = 0; i < pellets; i++) {
      const d = dir.clone();
      d.x += (Math.random() - 0.5) * spread * 2;
      d.y += (Math.random() - 0.5) * spread * 2;
      d.z += (Math.random() - 0.5) * spread * 2;
      d.normalize();
      this.traceShot(d, w);
    }
    // отдача
    this.pitch += (w.id === "sniper" ? 0.075 : w.id === "shotgun" ? 0.06 : 0.028) * (this.aiming ? 0.8 : 1.3);
    this.yaw += (Math.random() - 0.5) * 0.012;
    this.noiseEvent(w.noise);
    this.useDurability(1);
    if (this.mag[w.id] === 0) this.reload();
    this.emit(true);
  }

  private traceShot(dir: THREE.Vector3, w: WeaponDef) {
    const origin = this.camera.position.clone();
    let bestT = w.range;
    let hitEnemy: Actor | null = null;
    let zone = "torso";

    // геометрия мира
    for (const c of this.world.colliders) {
      if (c.tag === "tree" && w.kind === "bow") continue;
      const t = rayBox(origin, dir, c.min, c.max);
      if (t !== null && t < bestT) {
        bestT = t;
        hitEnemy = null;
      }
    }
    // актёры: сфера торса + сфера головы
    for (const a of this.enemies) {
      if (a.isDead) continue;
      const scale = a.rig.group.scale.x;
      const bodyC = a.pos.clone().add(new THREE.Vector3(0, 1.05 * scale, 0));
      const headC = a.pos.clone().add(new THREE.Vector3(0, 1.62 * scale, 0));
      const tb = raySphere(origin, dir, bodyC, 0.52 * scale);
      const th = raySphere(origin, dir, headC, 0.3 * scale);
      if (th !== null && th < bestT) {
        bestT = th;
        hitEnemy = a;
        zone = "head";
      } else if (tb !== null && tb < bestT) {
        bestT = tb;
        hitEnemy = a;
        const hit = origin.clone().addScaledVector(dir, tb).sub(a.pos);
        zone = hit.y < 0.75 * scale ? "leg" : Math.abs(hit.x) > 0.34 ? "arm" : "torso";
      }
    }
    const end = origin.clone().addScaledVector(dir, bestT);
    this.spawnTracer(origin.clone().addScaledVector(dir, 1.2), end);
    if (bestT < w.range) this.spawnImpact(end, hitEnemy !== null);

    if (hitEnemy) {
      const dmg = w.dmg * (zone === "head" ? 1 : zone === "leg" ? 0.7 : 1);
      hitEnemy.hit(dmg, dir, zone, this.aiCtx());
      audio.meleeHit(true);
      if (zone === "leg" && hitEnemy.type === "wolf") hitEnemy.morale -= 0.15;
      this.hitMarker();
    }
    // патроны расходуют прочность не оружия, а нашего состояния
    void w;
  }

  private hitFlash = 0;
  private hitMarker() {
    this.hitFlash = 0.25;
  }

  melee() {
    if (this.fireCd > 0) return;
    const w = this.currentWeapon();
    this.fireCd = w.kind === "melee" ? w.rate : 0.75;
    this.meleeT = 1;
    audio.meleeHit(false);
    const fwd = new THREE.Vector3(Math.sin(this.yaw), 0, Math.cos(this.yaw));
    const ctx = this.aiCtx();

    // скрытая атака
    const victim = this.enemies.find((a) => !a.isDead && a.pos.distanceTo(this.pos) < 2.6 && a.state !== "combat");
    if (victim) {
      const toV = victim.pos.clone().sub(this.pos).normalize();
      if (toV.dot(fwd) > 0.4) {
        const dmg = (w.kind === "melee" ? w.dmg : 18) * 2.4;
        victim.hit(dmg, toV, "torso", ctx);
        audio.meleeHit(true);
        this.useDurability(3);
        this.notifyNoise(this.pos.clone(), 8, "stealth");
        this.toast = "Тихое устранение";
        this.toastT = 2.4;
        return;
      }
    }
    for (const a of this.enemies) {
      if (a.isDead) continue;
      const toA = a.pos.clone().sub(this.pos);
      const dist = toA.length();
      if (dist > w.range + 0.6) continue;
      toA.normalize();
      if (toA.dot(fwd) < 0.35) continue;
      const zone = Math.random() < 0.2 ? "head" : Math.random() < 0.5 ? "arm" : "torso";
      a.hit(w.dmg, toA, zone, ctx);
      audio.meleeHit(true);
      this.useDurability(2);
      this.noiseEvent(w.noise + 10);
      this.camShake = 0.5;
      break;
    }
    if (w.kind === "melee") this.emit(true);
  }

  private useDurability(n: number) {
    const w = this.currentWeapon();
    if (!w.durability) return;
    this.durability[w.id] = (this.durability[w.id] ?? 0) - n;
    if (this.durability[w.id] <= 0) {
      this.toast = `${w.name} сломалось`;
      this.toastT = 3;
      audio.meleeHit(false);
      const alt = this.slots.find((s) => WEAPONS[s].kind === "gun") ?? "fists";
      this.equip(alt);
    }
  }

  throwItem() {
    const id = (this.items.bottle ?? 0) > 0 ? "bottle" : (this.items.molotov ?? 0) > 0 ? "molotov" : (this.items.smoke ?? 0) > 0 ? "smoke" : null;
    if (!id) {
      this.toast = "Нет ничего для броска";
      this.toastT = 2;
      return;
    }
    this.items[id] = (this.items[id] ?? 0) - 1;
    const dir = new THREE.Vector3();
    this.camera.getWorldDirection(dir);
    const power = 16;
    const from = this.pos.clone().add(new THREE.Vector3(0, 1.4, 0));
    const vel = dir.multiplyScalar(power).add(new THREE.Vector3(0, 5.5, 0));
    const start = this.time;
    const step = () => {
      if (this.disposed) return;
      const t = this.time - start;
      const p = from.clone().addScaledVector(vel, t).add(new THREE.Vector3(0, -9.8 * t * t * 0.5, 0));
      const ground = this.world.heightAt(p.x, p.z);
      if (p.y <= ground + 0.1 || t > 3.5) {
        if (id === "molotov") {
          this.fires.push({ pos: p.clone(), t: 7 });
          audio.fire();
          for (const a of this.enemies) {
            if (a.pos.distanceTo(p) < 6) a.hit(70, a.pos.clone().sub(p).normalize(), "torso", this.aiCtx());
          }
          this.notifyNoise(p, 30, "fire");
        } else if (id === "smoke") {
          this.notifyNoise(p, 16, "smoke");
          this.toast = "Дым скрывает вас";
          this.toastT = 3;
        } else {
          audio.footstep("glass", 0.8);
          this.notifyNoise(p, 46, "bottle");
          this.toast = "Они слышат звук";
          this.toastT = 2.4;
        }
        return;
      }
      window.setTimeout(step, 40);
    };
    window.setTimeout(step, 40);
    this.emit(true);
  }

  toggleFlashlight() {
    this.flashlight.intensity = this.flashlight.intensity > 0 ? 0 : 16;
    audio.ui("select");
    this.toast = this.flashlight.intensity > 0 ? "Фонарь включён — вас виднее" : "Фонарь выключен";
    this.toastT = 2.4;
  }

  commandCompanion() {
    if (!this.companion) return;
    const order = (this.companion as any).__order ?? "follow";
    const next = order === "follow" ? "hold" : order === "hold" ? "attack" : "follow";
    (this.companion as any).__order = next;
    this.toast = next === "follow" ? "Дейл: иду за тобой" : next === "hold" ? "Дейл: стою, прикрываю" : "Дейл: веду огонь";
    this.toastT = 3;
    audio.humanVoice(this.companion.pos.x, this.companion.pos.y + 1.5, this.companion.pos.z, "talk");
  }

  quickHeal() {
    if ((this.items.food ?? 0) > 0 && this.hp < 100) {
      this.items.food--;
      this.hp = Math.min(100, this.hp + 18);
      this.injuries.bleed = Math.max(0, this.injuries.bleed - 0.3);
      this.toast = "Съедено: +18";
      this.toastT = 2.4;
      audio.pickup();
      this.emit(true);
      return;
    }
    this.toast = "Еды нет (Q — быстрый приём пищи)";
    this.toastT = 2.6;
  }

  useHeal(kind: "bandage" | "splint" | "kit") {
    if (kind === "bandage" && (this.items.rag ?? 0) >= 1 && (this.items.alcohol ?? 0) >= 1) {
      this.items.rag--;
      this.items.alcohol--;
      this.injuries.bleed = 0;
      this.hp = Math.min(100, this.hp + 8);
      this.toast = "Кровотечение остановлено";
    } else if (kind === "splint" && (this.items.rag ?? 0) >= 1 && (this.items.tape ?? 0) >= 1) {
      this.items.rag--;
      this.items.tape--;
      this.injuries.fracture = 0;
      this.injuries.leg = 0;
      this.toast = "Перелом зафиксирован";
    } else if (kind === "kit" && (this.items.rag ?? 0) >= 1 && (this.items.alcohol ?? 0) >= 1 && (this.items.herb ?? 0) >= 2) {
      this.items.rag--;
      this.items.alcohol--;
      this.items.herb -= 2;
      this.hp = 100;
      this.injuries.bleed = 0;
      this.injuries.concussion = 0;
      this.injuries.arm = 0;
      this.injuries.leg = 0;
      this.injuries.fracture = 0;
      this.toast = "Вылечены все травмы";
    } else {
      this.toast = "Не хватает материалов";
      this.toastT = 2.4;
      this.emit(true);
      return;
    }
    this.toastT = 3;
    audio.craft();
    this.emit(true);
  }

  craft(recipeId: string) {
    const r = RECIPES.find((x) => x.id === recipeId);
    if (!r) return;
    for (const [k, v] of Object.entries(r.need)) if ((this.items[k] ?? 0) < v) {
      this.toast = `Не хватает: ${Object.entries(r.need).filter(([kk, vv]) => (this.items[kk] ?? 0) < vv).map(([kk, vv]) => `${ITEM_NAMES[kk] ?? kk} ×${vv}`).join(", ")}`;
      this.toastT = 3;
      this.emit(true);
      return;
    }
    for (const [k, v] of Object.entries(r.need)) this.items[k] -= v;
    if (r.out.item) this.items[r.out.item] = (this.items[r.out.item] ?? 0) + (r.out.item === "bottle" ? 2 : r.out.item === "ammo9" ? 6 : r.out.item === "ammo556" ? 8 : r.out.item === "shell" ? 4 : 1);
    if (r.out.weapon && !this.slots.includes(r.out.weapon)) this.slots.push(r.out.weapon);
    if (r.out.weapon && this.durability[r.out.weapon] === undefined) this.durability[r.out.weapon] = WEAPONS[r.out.weapon].durability ?? 0;
    if (r.out.heal) this.useHeal(r.out.heal as any);
    audio.craft();
    this.toast = `Создано: ${r.name}`;
    this.toastT = 3;
    this.emit(true);
  }

  private interactTarget: { kind: "loot" | "note" | "marker"; idx: number; label: string } | null = null;

  private findInteract() {
    const fwd = new THREE.Vector3(Math.sin(this.yaw), 0, Math.cos(this.yaw));
    let best: typeof this.interactTarget = null;
    let bd = 3.2;
    for (let i = 0; i < this.world.loot.length; i++) {
      const l = this.world.loot[i];
      const d = l.pos.distanceTo(this.pos);
      if (d < bd && Math.abs(l.pos.y - this.pos.y) < 2.6) {
        const dir = l.pos.clone().sub(this.pos).setY(0).normalize();
        if (dir.dot(fwd) > -0.2 || d < 1.6) {
          bd = d;
          best = { kind: "loot", idx: i, label: l.searched ? "Пусто" : `Обыскать · ${l.kind === "body" ? "тело" : l.kind === "car" ? "бардачок" : l.kind === "safe" ? "сейф" : "ящик"}` };
        }
      }
    }
    for (const m of this.world.markers) {
      if (m.kind !== "note" && m.kind !== "quest") continue;
      const d = m.pos.distanceTo(this.pos);
      if (d < bd + 1 && Math.abs(m.pos.y - this.pos.y) < 4) {
        bd = d;
        best = { kind: "marker", idx: this.world.markers.indexOf(m), label: `Взять: ${m.label}` };
      }
    }
    this.interactTarget = best;
    this.prompt = best ? `[E] ${best.label}` : "";
  }

  interact() {
    const t = this.interactTarget;
    if (!t) return;
    if (t.kind === "loot") {
      const l = this.world.loot[t.idx];
      if (l.searched) return;
      l.searched = true;
      const found: string[] = [];
      for (const it of l.items) {
        if (WEAPONS[it]) {
          if (!this.slots.includes(it)) {
            this.slots.push(it);
            this.durability[it] = WEAPONS[it].durability ?? 0;
            this.mag[it] = this.mag[it] ?? (WEAPONS[it].mag ?? 0);
            found.push(`ОРУЖИЕ: ${WEAPONS[it].name}`);
          }
          continue;
        }
        this.items[it] = (this.items[it] ?? 0) + 1;
        found.push(ITEM_NAMES[it] ?? it);
      }
      if (Math.random() < 0.34) {
        this.items.notes = (this.items.notes ?? 0) + 1;
        const nIdx = (this.items.notes - 1) % 12;
        this.notesFound.add(String(nIdx));
        this.onEvent({ type: "note", id: String(nIdx) });
      }
      if (l.glint) l.glint.visible = false;
      l.mesh.scale.multiplyScalar(0.86);
      audio.pickup();
      this.toast = `Найдено: ${found.join(", ")}`;
      this.toastT = 3.4;
      this.goalAdd("collect");
      this.goalAdd("interact");
    } else if (t.kind === "marker") {
      const m = this.world.markers[t.idx];
      m.done = true;
      audio.pickup();
      this.toast = `Взято: ${m.label}`;
      this.toastT = 3;
      this.onEvent({ type: "note", id: m.id });
      this.goalAdd("collect");
      this.goalAdd("interact");
    }
    this.prompt = "";
    this.interactTarget = null;
    this.emit(true);
  }

  // ————————————————————————— урон игроку —————————————————————————
  damage(amount: number, zone = "torso") {
    if (this.hp <= 0) return;
    if (this.mode !== "play") return;
    let a = amount;
    if (zone === "arm") {
      this.injuries.arm = 1;
      a *= 0.7;
    }
    if (zone === "leg") {
      this.injuries.leg = 1;
      a *= 0.7;
    }
    this.hp -= a;
    this.animState.flinch = 1;
    this.camShake = Math.min(1.2, this.camShake + a * 0.02);
    this.fear = Math.min(1, this.fear + a * 0.012);
    audio.hurt();
    if (zone === "head") {
      this.injuries.concussion = 1;
      audio.setTension(1, 1, 0);
    }
    if (Math.random() < a * 0.02) this.injuries.bleed = Math.min(1.4, this.injuries.bleed + 0.5);
    if (a > 26 && Math.random() < 0.4) this.injuries.fracture = 1;
    if (this.hp < 35) this.adrenaline = 1;
    this.adrenaline = Math.max(0, this.adrenaline - 0.02);
    this.slowmo = this.adrenaline > 0.5 ? 0.72 : 1;
    this.onEvent({ type: "hurt" });
    if (this.hp <= 0) this.die();
    this.emit(true);
  }

  private die() {
    this.hp = 0;
    this.mode = "dead";
    this.animState.dead = 1;
    this.rig.animate(this.time, 0.016, { ...this.animState, dead: 1 });
    document.exitPointerLock?.();
    this.onEvent({ type: "death" });
  }

  respawn() {
    this.hp = 80;
    this.stamina = 100;
    this.breath = 100;
    this.injuries = { bleed: 0, fracture: 0, concussion: 0, arm: 0, leg: 0 };
    this.pos.copy(this.safePos);
    this.vel.set(0, 0, 0);
    this.animState.dead = 0;
    this.mode = "play";
    this.paused = false;
    this.slowmo = 1;
    for (const a of this.enemies) if (a.pos.distanceTo(this.pos) < 24 && !a.isDead) {
      a.state = "patrol";
      a.detection = 0;
      a.pos.copy(a.spawnPos);
      a.rig.group.position.copy(a.pos);
    }
    this.toast = "Вы очнулись. Свет — единственная валюта.";
    this.toastT = 4;
    resetAlert();
    this.emit(true);
    this.requestLock();
  }

  // ————————————————————————— ИИ-контекст —————————————————————————
  private aiCtx(): AICtx {
    const self = this;
    return {
      world: this.world,
      playerPos: this.pos,
      playerNoise: this.noise,
      isSeen: (from, to, fovDot, dist) => {
        if (dist > 70) return false;
        if (fovDot > 0) {
          // враг за спиной и далеко — заметить сложнее; взгляд в его сторону повышает шанс
          const toEnemy = from.clone().sub(self.pos).normalize();
          const fwd = new THREE.Vector3(Math.sin(self.yaw), 0, Math.cos(self.yaw));
          const facing = toEnemy.dot(fwd);
          const light = 0.4 + self.lightLevel;
          const crouch = self.crouchT > 0.6 ? 0.55 : 1;
          const stealth = self.echoT ? 0.4 : 1;
          const behind = facing < 0.25;
          if (behind && dist > 7 * light * crouch * stealth * (1.4 - fovDot)) return false;
        }
        return lineOfSight(self.world, from, to, fovDot, dist);
      },
      lightAt: (x, z) => self.computeLight(x, z),
      damagePlayer: (amount, fromPos, zone) => {
        const d = fromPos.distanceTo(self.pos);
        if (d > 70) return;
        self.damage(amount, zone ?? "torso");
      },
      onNoise: (pos, radius, kind) => self.notifyNoise(pos, radius, kind),
      sharedAlert: (pos, level) => {
        self.detectedGlobal = Math.max(self.detectedGlobal, level);
        for (const a of self.enemies) {
          if (a.isDead || a.state === "combat") continue;
          if (a.pos.distanceTo(pos) < 42) {
            a.state = "investigate";
            a.lastKnown.copy(pos);
            a.memory = Math.max(a.memory, 7);
          }
        }
      },
      alertAt: () => self.detectedGlobal,
      cruelty: this.cruelty,
      time: this.time,
      slow: this.slowmo,
      killCredit: (a) => {
        self.kills++;
        self.cruelty = Math.max(-14, self.cruelty - (a.type === "wolf" ? 1 : 0.6));
        self.goalAdd("kill", !!a.boss);
        const alive = self.enemies.filter((e) => !e.isDead).length;
        if (alive <= 2) self.detectedGlobal = Math.max(0, self.detectedGlobal - 0.3);
        if (self.companion && Math.random() < 0.4) {
          self.onEvent({ type: "toast", text: Math.random() < 0.5 ? "Дейл: Всё. Тихо." : "Дейл: Ты это зачем?.." });
        }
      },
      onCompanionSay: (line) => {
        if (self.companion) self.onEvent({ type: "toast", text: `ДЕЙЛ: ${line}` });
      },
    };
  }

  computeLight(x: number, z: number): number {
    const sun = Math.max(0, Math.sin(((this.hour - 6) / 12) * Math.PI));
    let l = sun;
    if (this.world.indoorAt(x, z)) l *= 0.3;
    if (this.flashlight.intensity > 0) l += 0.55;
    if (this.weather === "storm" || this.weather === "fog") l *= 0.65;
    if (this.weather === "rain") l *= 0.8;
    if (this.flashT > 0) l += 0.8;
    return Math.min(1.4, l);
  }

  private updateAICtx(dt: number) {
    const ctx: AICtx = {
      ...this.aiCtx(),
      isSeen: (from, to, fovDot, dist) => this.aiCtx().isSeen(from, to, fovDot, dist),
    };
    (ctx as any).__actors = this.enemies;
    for (const a of this.enemies) a.update(dt, ctx);
    if (this.companion) {
      const order = (this.companion as any).__order ?? "follow";
      if (order === "hold") {
        const d = this.companion.pos.distanceTo(this.pos);
        if (d > 4) {
          const dir = this.pos.clone().sub(this.companion.pos).setY(0).normalize();
          this.companion.pos.addScaledVector(dir, dt * 4);
          this.companion.pos.y = this.world.heightAt(this.companion.pos.x, this.companion.pos.z);
        }
        this.companion.rig.group.position.copy(this.companion.pos);
        this.companion.rig.animate(this.time, dt, { speed: 0, aim: this.enemies.some((e) => e.state === "combat" && !e.isDead) ? 1 : 0 });
      } else {
        this.companion.update(dt, ctx);
      }
      this.lightLevel = this.computeLight(this.pos.x, this.pos.z);
    }
    this.detectedGlobal = Math.max(0, this.detectedGlobal - dt * 0.05);
    // ближайший уровень обнаружения — для HUD
    let maxDet = 0;
    for (const a of this.enemies) if (!a.isDead) maxDet = Math.max(maxDet, a.detection);
    this.detectedGlobal = Math.max(this.detectedGlobal, maxDet);
    void dt;
  }

  // ————————————————————————— мир: погода, время, fx —————————————————————————
  private updateWorld(dt: number) {
    this.hour += dt * 0.05; // ~20 минут реального времени на игровой час
    if (this.hour >= 24) this.hour -= 24;
    this.weatherT -= dt;
    if (this.weatherT <= 0) {
      this.weatherT = 90 + Math.random() * 120;
      const opts: typeof this.weather[] = this.cfg.mode === "free" ? ["clear", "rain", "fog", "storm"] : ["clear", "fog", "rain", "storm"];
      this.weather = opts[Math.floor(Math.random() * opts.length)];
      this.toast = this.weather === "storm" ? "Гроза приближается" : this.weather === "fog" ? "Туман сгущается" : this.weather === "rain" ? "Начинается дождь" : "Небо проясняется";
      this.toastT = 4;
    }
    this.applyTimeOfDay();

    const rain = (this.weather === "rain" || this.weather === "storm") && this.cfg.quality === "high";
    this.world.rain.visible = rain;
    this.world.snow.visible = this.weather === "snow";
    if (rain) this.animatePrecip(this.world.rain, dt, 42, true);
    if (this.world.snow.visible) this.animatePrecip(this.world.snow, dt, 4, false);

    if (this.weather === "storm" && Math.random() < dt * 0.08) {
      this.flashT = 0.28;
      window.setTimeout(() => audio.thunder(), 300 + Math.random() * 900);
    }
    this.flashT = Math.max(0, this.flashT - dt);
    audio.setWeather(rain ? (this.weather === "storm" ? 1 : 0.7) : 0, this.weather === "storm" ? 1 : 0.4);

    // ветер в траве
    const gm = this.world.grassMat as any;
    if (gm.__wind) gm.__wind.value = this.time;

    // костры
    for (const f of this.world.campfires) {
      f.light.intensity = 12 + Math.sin(this.time * 7 + f.pos.x) * 3 + Math.sin(this.time * 13) * 1.5;
    }
    // разведённый игроком огонь
    for (let i = this.fires.length - 1; i >= 0; i--) {
      const f = this.fires[i];
      f.t -= dt;
      if (f.t <= 0) {
        this.fires.splice(i, 1);
        continue;
      }
      for (const a of this.enemies) {
        if (!a.isDead && a.pos.distanceTo(f.pos) < 5) a.hit(dt * 12, a.pos.clone().sub(f.pos).normalize(), "torso", this.aiCtx());
      }
      if (this.pos.distanceTo(f.pos) < 5) this.damage(dt * 4, "torso");
    }
    if (Math.random() < dt * 0.1) audio.fire();

    // живой мир: птицы, вороны на тревоге, волки ночью
    const day = this.hour > 5.5 && this.hour < 20.5;
    if (day && this.weather !== "storm" && Math.random() < dt * 0.05) audio.bird();
    if (!day && Math.random() < dt * 0.012) audio.wolfHowl();
    if (this.detectedGlobal > 0.5 && Math.random() < dt * 0.06) audio.crow();
  }

  private animatePrecip(pts: THREE.Points, dt: number, speed: number, isRain: boolean) {
    pts.position.set(this.camera.position.x, this.camera.position.y - 20, this.camera.position.z);
    const arr = pts.geometry.attributes.position as THREE.BufferAttribute;
    const a = arr.array as Float32Array;
    for (let i = 0; i < a.length; i += 3) {
      a[i + 1] -= speed * dt;
      if (!isRain) a[i] += Math.sin(this.time * 2 + i) * dt * 1.6;
      if (a[i + 1] < -6) {
        a[i + 1] = 55;
        a[i] = (Math.random() - 0.5) * 90;
        a[i + 2] = (Math.random() - 0.5) * 90;
      }
    }
    arr.needsUpdate = true;
  }

  private applyTimeOfDay(force = false) {
    void force;
    const sun = this.world.sun;
    const ang = ((this.hour - 6) / 12) * Math.PI;
    const elev = Math.sin(ang);
    // солнце следует за игроком — тени всегда в кадре
    sun.position.set(this.pos.x + Math.cos(ang) * 120, Math.max(14, elev * 130), this.pos.z - 70);
    sun.target.position.set(this.pos.x, 0, this.pos.z);
    sun.target.updateMatrixWorld();
    const dayness = Math.max(0, Math.min(1, elev * 1.5));
    sun.intensity = 0.15 + dayness * 2.4 + (this.flashT > 0 ? 3 : 0);
    sun.color.setHSL(0.09, 0.45 - dayness * 0.25, 0.55 + dayness * 0.2);
    this.world.hemi.intensity = 0.22 + dayness * 0.65;
    const sky = this.world.sky.material as THREE.ShaderMaterial;
    if (sky.uniforms) {
      const top = new THREE.Color().setHSL(0.58, 0.22, 0.06 + dayness * 0.28);
      const hor = new THREE.Color().setHSL(0.12, 0.28, 0.08 + dayness * 0.42);
      if (this.weather === "storm") {
        top.multiplyScalar(0.6);
        hor.multiplyScalar(0.6);
      }
      (sky.uniforms.top.value as THREE.Color).copy(top);
      (sky.uniforms.horizon.value as THREE.Color).copy(hor);
      (sky.uniforms.sunDir.value as THREE.Vector3).set(Math.cos(ang), Math.max(0.02, elev), -0.6).normalize();
    }
    const fogC = new THREE.Color().setHSL(0.16, 0.16, 0.07 + dayness * 0.42);
    (this.scene.fog as THREE.FogExp2).color.copy(fogC);
    (this.scene.fog as THREE.FogExp2).density = this.weather === "fog" ? 0.03 : this.weather === "storm" ? 0.02 : 0.0095;
    this.scene.background = null;
    this.lightLevel = this.computeLight(this.pos.x, this.pos.z);
  }

  private updateFx(dt: number) {
    // трассеры
    for (let i = this.tracers.length - 1; i >= 0; i--) {
      const t = this.tracers[i];
      t.t -= dt;
      (t.line.material as THREE.LineBasicMaterial).opacity = Math.max(0, t.t * 6);
      if (t.t <= 0) {
        this.scene.remove(t.line);
        t.line.geometry.dispose();
        (t.line.material as THREE.Material).dispose();
        this.tracers.splice(i, 1);
      }
    }
    for (let i = this.impacts.length - 1; i >= 0; i--) {
      const im = this.impacts[i];
      im.t -= dt;
      im.mesh.scale.multiplyScalar(1 + dt * 3);
      (im.mesh.material as THREE.MeshBasicMaterial).opacity = Math.max(0, im.t * 4);
      if (im.t <= 0) {
        this.scene.remove(im.mesh);
        im.mesh.geometry.dispose();
        (im.mesh.material as THREE.Material).dispose();
        this.impacts.splice(i, 1);
      }
    }
    // вспышка дула
    this.muzzle.intensity = Math.max(0, this.muzzle.intensity - dt * 60);
    // метки лута мерцают
    if (Math.random() < dt * 6) {
      const l = this.world.loot[Math.floor(Math.random() * this.world.loot.length)];
      if (l && l.glint && !l.searched) l.glint.visible = !l.glint.visible;
    }
    if (this.hitFlash > 0) this.hitFlash = Math.max(0, this.hitFlash - dt);
    this.lightLevel = this.computeLight(this.pos.x, this.pos.z);
  }

  private spawnTracer(from: THREE.Vector3, to: THREE.Vector3) {
    const geo = new THREE.BufferGeometry().setFromPoints([from, to]);
    const mat = new THREE.LineBasicMaterial({ color: 0xffe0a0, transparent: true, opacity: 1 });
    const line = new THREE.Line(geo, mat);
    this.scene.add(line);
    this.tracers.push({ line, t: 0.14 });
    this.muzzle.position.copy(from);
    this.muzzle.intensity = 12;
    if (this.tracers.length > 26) {
      const old = this.tracers.shift();
      if (old) {
        this.scene.remove(old.line);
        old.line.geometry.dispose();
        (old.line.material as THREE.Material).dispose();
      }
    }
  }

  private spawnImpact(p: THREE.Vector3, blood: boolean) {
    const geo = new THREE.SphereGeometry(blood ? 0.16 : 0.09, 6, 5);
    const mat = new THREE.MeshBasicMaterial({ color: blood ? 0x8c1d12 : 0xd9c9a0, transparent: true, opacity: 1 });
    const m = new THREE.Mesh(geo, mat);
    m.position.copy(p);
    this.scene.add(m);
    this.impacts.push({ mesh: m, t: blood ? 0.5 : 0.25 });
    if (this.impacts.length > 30) {
      const old = this.impacts.shift();
      if (old) {
        this.scene.remove(old.mesh);
        old.mesh.geometry.dispose();
        (old.mesh.material as THREE.Material).dispose();
      }
    }
  }

  // ————————————————————————— цели главы —————————————————————————
  private goalAdd(kind: string, boss = false) {
    for (const g of this.goals) {
      if (g.check !== kind) continue;
      if (g.id === "boss" && !boss) continue;
      this.goalProgress[g.id] = (this.goalProgress[g.id] ?? 0) + 1;
    }
    this.checkGoals();
  }

  private checkGoals() {
    if (this.completeOnce || !this.goals.length) return;
    // kill/collect/interact считаются, reach — по позиции
    let done = 0;
    for (const g of this.goals) {
      if (g.check === "reach" && g.at) {
        const d = Math.hypot(this.pos.x - g.at[0], this.pos.z - g.at[2]);
        if (d < 16) this.goalProgress[g.id] = 1;
      }
      const need = g.need ?? 1;
      if ((this.goalProgress[g.id] ?? 0) >= need) done++;
    }
    if (done >= this.goals.length) {
      this.completeOnce = true;
      this.mode = "cinematic";
      document.exitPointerLock?.();
      this.onEvent({ type: "complete" });
    }
  }

  setObjective(text: string) {
    this.objective = text;
    this.onEvent({ type: "objective", text });
    this.emit(true);
  }

  // ————————————————————————— HUD —————————————————————————
  private emit(force = false) {
    const s: HudState = {
      hp: Math.max(0, Math.round(this.hp)),
      stamina: Math.round(this.stamina),
      breath: Math.round(this.breath),
      injuries: [
        this.injuries.bleed > 0 ? "КРОВОТЕЧЕНИЕ" : "",
        this.injuries.fracture > 0 ? "ПЕРЕЛОМ" : "",
        this.injuries.concussion > 0 ? "КОНТУЗИЯ" : "",
        this.injuries.arm > 0 ? "РУКА" : "",
        this.injuries.leg > 0 ? "НОГА" : "",
      ].filter(Boolean),
      weapon: this.currentWeapon().name,
      weaponId: this.weaponId,
      mag: this.mag[this.weaponId] ?? 0,
      reserve: WEAPONS[this.weaponId].ammo ? this.ammoCount(WEAPONS[this.weaponId].ammo!) : -1,
      dur: this.durability[this.weaponId] ?? -1,
      noise: Math.round(this.noise * 100),
      light: Math.round(this.lightLevel * 100),
      detected: Math.min(1, this.detectedGlobal),
      objective: this.objective,
      prompt: this.prompt,
      hour: this.hour,
      weather: this.weather,
      cruelty: Math.round(this.cruelty),
      fear: Math.round(this.fear * 100),
      alert: this.detectedGlobal,
      kills: this.kills,
      items: { ...this.items },
      ammoByType: {
        ammo9: this.items.ammo9 ?? 0,
        ammo556: this.items.ammo556 ?? 0,
        shell: this.items.shell ?? 0,
        arrow: this.items.arrow ?? 0,
      },
      echo: this.echoT > 0,
      adrenaline: this.adrenaline > 0.5,
      aiming: this.aimingT > 0.5,
      mode: this.mode,
      chapter: this.chapter,
      px: this.pos.x,
      pz: this.pos.z,
      yaw: this.yaw,
      enemiesNear: this.enemies.filter((e) => !e.isDead && e.pos.distanceTo(this.pos) < 40).length,
      companionAlive: !!this.companion && !this.companion.isDead,
      toast: this.toast,
      objPos: this.objectivePos(),
      contacts: this.echoT > 0
        ? this.enemies
            .filter((e) => !e.isDead)
            .map((e) => {
              const dx = e.pos.x - this.pos.x;
              const dz = e.pos.z - this.pos.z;
              return {
                dist: Math.hypot(dx, dz),
                ang: Math.atan2(dx, dz) - this.yaw,
                type: e.type,
              };
            })
            .filter((c) => c.dist < 30)
            .slice(0, 8)
        : [],
    };
    const sig = [
      s.hp,
      s.stamina,
      s.breath,
      s.weaponId,
      s.mag,
      s.reserve,
      s.dur,
      s.noise,
      s.light,
      Math.round(s.detected * 20),
      s.objective,
      s.prompt,
      Math.round(s.hour),
      s.weather,
      s.cruelty,
      s.fear,
      s.kills,
      s.toast,
      s.echo ? 1 : 0,
      s.injuries.join(","),
      JSON.stringify(s.items),
      Math.round(s.px),
      Math.round(s.pz),
      s.mode,
      s.enemiesNear,
      s.contacts.map((c) => Math.round(c.dist) + ":" + Math.round(c.ang * 10)).join(","),
      s.objPos ? `${Math.round(s.objPos.x)},${Math.round(s.objPos.z)}` : "",
    ].join("|");
    if (force || sig !== this.hudSig) {
      this.hudSig = sig;
      this.onHud(s);
    }
  }

  /** ближайшая невыполненная цель маршрута — для компаса */
  private objectivePos(): { x: number; z: number; dist: number } | null {
    for (const g of this.goals) {
      if (!g.at) continue;
      const need = g.need ?? 1;
      if ((this.goalProgress[g.id] ?? 0) >= need) continue;
      if (g.check !== "reach") continue;
      return { x: g.at[0], z: g.at[2], dist: Math.round(Math.hypot(g.at[0] - this.pos.x, g.at[2] - this.pos.z)) };
    }
    const m = this.world.markers.find((x) => x.kind === "objective" && !x.done);
    if (m) return { x: m.pos.x, z: m.pos.z, dist: Math.round(m.pos.distanceTo(this.pos)) };
    return null;
  }

  getMapShapes() {
    return this.world.mapShapes;
  }
  getMarkers() {
    return this.world.markers;
  }
  getNotes() {
    return Array.from(this.notesFound);
  }

  save() {
    try {
      localStorage.setItem(
        SAVE_KEY,
        JSON.stringify({ chapter: this.chapter, cruelty: this.cruelty, items: this.items, slots: this.slots, kills: this.kills, hour: this.hour })
      );
    } catch {
      /* приватный режим */
    }
  }
  static loadSave(): any {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }
}

function damp(cur: number, want: number, lambda: number, dt: number) {
  let d = want - cur;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return cur + d * Math.min(1, lambda * dt);
}

export function rayBox(o: THREE.Vector3, d: THREE.Vector3, min: THREE.Vector3, max: THREE.Vector3): number | null {
  let tmin = -Infinity;
  let tmax = Infinity;
  for (const a of ["x", "y", "z"] as const) {
    const od = o[a];
    const dd = d[a];
    const mn = min[a];
    const mx = max[a];
    if (Math.abs(dd) < 1e-8) {
      if (od < mn || od > mx) return null;
    } else {
      let t1 = (mn - od) / dd;
      let t2 = (mx - od) / dd;
      if (t1 > t2) [t1, t2] = [t2, t1];
      tmin = Math.max(tmin, t1);
      tmax = Math.min(tmax, t2);
      if (tmin > tmax) return null;
    }
  }
  if (tmax < 0) return null;
  return tmin >= 0 ? tmin : tmax;
}

function raySphere(o: THREE.Vector3, d: THREE.Vector3, c: THREE.Vector3, r: number): number | null {
  const oc = o.clone().sub(c);
  const b = oc.dot(d);
  const cc = oc.dot(oc) - r * r;
  const disc = b * b - cc;
  if (disc < 0) return null;
  const t = -b - Math.sqrt(disc);
  return t > 0 ? t : null;
}
