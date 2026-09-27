/**
 * ИИ актёров: патруль → расследование → бой → паника.
 * Восприятие: зрение (fov + луч + уровень света), слух (радиус шума), память (lastKnown),
 * координация (общая тревога), фланкирование, страх и отступление, стая заражённых.
 * Напарник: следует, не мешает стелсу, подаёт патроны, комментирует.
 */
import * as THREE from "three";
import { createRig, Rig } from "./humanoid";
import type { WorldData } from "./world";
import { audio } from "./audio";

export type ActorType = "runner" | "stalker" | "clicker" | "bloater" | "wolf" | "dog" | "companion";

export interface AICtx {
  world: WorldData;
  playerPos: THREE.Vector3;
  playerNoise: number;
  isSeen: (from: THREE.Vector3, to: THREE.Vector3, fovDot: number, dist: number) => boolean;
  lightAt: (x: number, z: number) => number;
  damagePlayer(amount: number, fromPos: THREE.Vector3, zone?: string): void;
  onNoise(pos: THREE.Vector3, radius: number, kind: string): void;
  sharedAlert(pos: THREE.Vector3, level: number): void;
  alertAt(pos: THREE.Vector3): number;
  cruelty: number;
  time: number;
  slow: number;
  killCredit(a: Actor): void;
  onCompanionSay(line: string): void;
}

const PROFILE: Record<ActorType, {
  hp: number;
  speed: number;
  run: number;
  damage: number;
  hearing: number;
  vision: number;
  fov: number;
  morale: number;
  ranged: boolean;
  scale: number;
  skin: number;
  shirt: number;
  pants: number;
}> = {
  runner: { hp: 70, speed: 1.5, run: 5.6, damage: 16, hearing: 34, vision: 30, fov: 0.15, morale: 0.7, ranged: false, scale: 1, skin: 0x9a9c86, shirt: 0x6d6a55, pants: 0x44463a },
  stalker: { hp: 85, speed: 1.6, run: 4.6, damage: 20, hearing: 40, vision: 42, fov: 0.05, morale: 0.5, ranged: false, scale: 1.03, skin: 0x8e9179, shirt: 0x4f5b45, pants: 0x3a3d33 },
  clicker: { hp: 110, speed: 1.4, run: 5.0, damage: 55, hearing: 62, vision: 0, fov: -1, morale: 1, ranged: false, scale: 1.05, skin: 0xb8b39a, shirt: 0x6b6a58, pants: 0x4b4c40 },
  bloater: { hp: 460, speed: 1.2, run: 3.4, damage: 42, hearing: 44, vision: 20, fov: 0.2, morale: 1, ranged: true, scale: 1.5, skin: 0x8d7a54, shirt: 0x5c5334, pants: 0x403a26 },
  wolf: { hp: 100, speed: 1.5, run: 5.0, damage: 14, hearing: 36, vision: 48, fov: 0.35, morale: 0.62, ranged: true, scale: 1, skin: 0xc39c78, shirt: 0x39413a, pants: 0x2d322c },
  dog: { hp: 60, speed: 2, run: 7.4, damage: 18, hearing: 40, vision: 26, fov: 0.1, morale: 0.8, ranged: false, scale: 0.62, skin: 0x7b6a52, shirt: 0x6a5c46, pants: 0x4a4236 },
  companion: { hp: 260, speed: 1.6, run: 5.4, damage: 15, hearing: 40, vision: 50, fov: 0.2, morale: 1, ranged: true, scale: 1, skin: 0xb58c68, shirt: 0x4b5340, pants: 0x33362e },
};

export type ActorState = "idle" | "patrol" | "investigate" | "combat" | "flee" | "dead";

let SHARED_ALERT = 0;
export function resetAlert() {
  SHARED_ALERT = 0;
}

export class Actor {
  type: ActorType;
  rig: Rig;
  pos: THREE.Vector3;
  yaw = 0;
  hp: number;
  maxHp: number;
  state: ActorState = "patrol";
  detection = 0;
  lastKnown = new THREE.Vector3();
  memory = 0;
  cooldown = 0;
  meleeCd = 0;
  patrol: THREE.Vector3[] = [];
  patrolI = 0;
  waitT = 0;
  target = new THREE.Vector3();
  aimYaw = 0;
  aimPitch = 0;
  pose = { speed: 0, crouch: 0, prone: 0, aim: 0, aimPitch: 0, attack: 0, flinch: 0, dead: 0, lookYaw: 0, lookPitch: 0 };
  vel = new THREE.Vector3();
  deadT = 0;
  morale: number;
  aggro = 0;
  flankSide: 1 | -1 = 1;
  flankT = 0;
  lastPos = new THREE.Vector3();
  stuck = 0;
  commentCd = 0;
  weapon: string;
  ammo = 6;
  boss = false;
  phase = 0;
  spawnPos = new THREE.Vector3();
  engagedPlayer = false;
  animPhase = Math.random() * 6.28;
  world: WorldData;

  constructor(type: ActorType, pos: THREE.Vector3, world: WorldData, opts: { boss?: boolean; weapon?: string } = {}) {
    this.type = type;
    this.world = world;
    this.boss = !!opts.boss;
    const p = PROFILE[type];
    const isInfected = type !== "wolf" && type !== "companion" && type !== "dog";
    this.rig = createRig({
      scale: p.scale,
      skin: p.skin,
      shirt: p.shirt,
      pants: p.pants,
      pack: type === "companion" ? 0x6a5a44 : type === "wolf" ? 0x3a4038 : 0x54503c,
      hood: type === "runner" || type === "stalker",
      hat: type === "wolf",
      armor: type === "wolf",
    });
    if (type === "clicker") this.decorateClicker();
    if (type === "bloater") this.decorateBloater();
    this.pos = pos.clone();
    this.pos.y = world.heightAt(pos.x, pos.z);
    this.rig.group.position.copy(this.pos);
    this.spawnPos.copy(this.pos);
    this.hp = this.maxHp = p.hp * (this.boss ? 1.4 : 1);
    this.morale = p.morale;
    this.weapon = opts.weapon ?? (type === "wolf" ? "rifle" : type === "companion" ? "rifle" : isInfected ? "" : "pistol");
    this.ammo = type === "wolf" ? 12 : type === "companion" ? 30 : 6;
    this.rig.setWeapon(this.weapon || "knife");
    this.target.copy(this.pos);
    this.lastPos.copy(this.pos);

    // маршрут патруля из точек мира
    const steps = 3 + Math.floor(Math.random() * 3);
    let cur = pos.clone();
    for (let i = 0; i < steps; i++) {
      const near = world.walkable.filter((w) => w.distanceTo(cur) < 34 && w.distanceTo(cur) > 8);
      const nxt = near.length ? near[Math.floor(Math.random() * near.length)] : pos.clone();
      this.patrol.push(nxt.clone());
      cur = nxt;
    }
    this.target.copy(this.patrol[0] ?? pos);
  }

  private decorateClicker() {
    const g = new THREE.Group();
    const cap = new THREE.Mesh(
      new THREE.SphereGeometry(0.3, 10, 8, 0, Math.PI * 2, 0, Math.PI * 0.55),
      new THREE.MeshStandardMaterial({ color: 0xc7a06a, roughness: 0.95 })
    );
    cap.scale.set(1, 1.5, 1);
    cap.position.y = 0.18;
    cap.castShadow = true;
    g.add(cap);
    const jaw = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.12, 0.16), new THREE.MeshStandardMaterial({ color: 0x9a7346, roughness: 1 }));
    jaw.position.set(0, 0.1, 0.2);
    g.add(jaw);
    this.rig.parts.head.add(g);
  }

  private decorateBloater() {
    const m = new THREE.MeshStandardMaterial({ color: 0xa8873e, roughness: 1 });
    for (let i = 0; i < 7; i++) {
      const b = new THREE.Mesh(new THREE.SphereGeometry(0.22 + Math.random() * 0.2, 8, 6), m);
      b.position.set((Math.random() - 0.5) * 0.5, 0.1 + Math.random() * 0.5, (Math.random() - 0.5) * 0.4);
      b.castShadow = true;
      this.rig.parts.torso.add(b);
    }
  }

  get isDead() {
    return this.state === "dead";
  }
  get center() {
    return new THREE.Vector3(this.pos.x, this.pos.y + 1.1 * this.rig.group.scale.x, this.pos.z);
  }

  say(kind: "alert" | "pain" | "shout" | "talk", dist: number) {
    if (dist > 70) return;
    audio.humanVoice(this.pos.x, this.pos.y + 1.5, this.pos.z, kind === "pain" ? "pain" : kind === "alert" ? "alert" : "shout");
  }

  hit(amount: number, dir: THREE.Vector3, zone: string, ctx: AICtx) {
    if (this.state === "dead") return;
    let dmg = amount;
    if (zone === "head") dmg *= this.type === "bloater" || this.type === "clicker" ? 1.6 : 3.2;
    if (zone === "leg") dmg *= 0.85;
    this.hp -= dmg;
    this.pose.flinch = 1;
    this.aggro = 1;
    this.memory = 14;
    this.lastKnown.copy(ctx.playerPos);
    if (this.state !== "combat") {
      this.state = "combat";
      this.say("alert", this.pos.distanceTo(ctx.playerPos));
      ctx.sharedAlert(this.pos, 1);
    }
    if (dir) this.vel.addScaledVector(dir, Math.min(3, amount * 0.03));
    if (this.hp <= 0) this.die(ctx, dir);
    else if (this.hp < this.maxHp * 0.25 && Math.random() < 0.4) this.say("pain", this.pos.distanceTo(ctx.playerPos));
  }

  die(ctx: AICtx, dir?: THREE.Vector3) {
    this.state = "dead";
    this.deadT = 0;
    this.pose.dead = 1;
    audio.growl(this.pos.x, this.pos.y + 1, this.pos.z, this.type === "bloater");
    if (dir) this.vel.addScaledVector(dir, 2.2);
    ctx.killCredit(this);
    // находка трупа поднимает тревогу у тех, кто рядом
    ctx.onNoise(this.pos, 16, "body");
    void ctx;
  }

  update(dt: number, ctx: AICtx) {
    const g = this.rig.group;
    const p = PROFILE[this.type];

    if (this.state === "dead") {
      this.deadT += dt;
      this.vel.multiplyScalar(Math.max(0, 1 - dt * 6));
      g.position.addScaledVector(this.vel, dt);
      this.rig.animate(ctx.time, dt, { ...this.pose, dead: 1, speed: 0 });
      return;
    }

    const toPlayer = ctx.playerPos.clone().sub(this.pos);
    const dist = toPlayer.length();
    const eye = this.center.clone();
    const speedNow = this.vel.length();

    // ——— восприятие ———
    const shared = ctx.alertAt(this.pos);
    let sees = false;
    if (this.type === "clicker") {
      sees = false;
      // слепой: реагирует только на шум игрока
      const noise = ctx.playerNoise * (1 - dist / (p.hearing * 1.4));
      if (noise > 0.02 && dist < p.hearing * 1.35) {
        this.memory = Math.max(this.memory, 2.5);
        this.lastKnown.copy(ctx.playerPos);
        if (this.state === "patrol" || this.state === "idle" || this.state === "investigate") this.state = "investigate";
      }
      // эхолокация: если игрок стоит рядом и дышит — слышит
      if (dist < 3.2 && ctx.playerNoise > 0.05) {
        this.state = "combat";
        this.lastKnown.copy(ctx.playerPos);
      }
    } else if (this.type === "dog") {
      // собака чует: запах важнее зрения
      const scent = dist < 30 && ctx.cruelty < 5 ? 1 : 1;
      if (dist < p.vision * scent && ctx.isSeen(eye, ctx.playerPos, p.fov, dist)) sees = true;
      if (dist < 26 && (ctx.playerNoise > 0.03 || Math.random() < 0.5)) sees = sees || dist < 18;
    } else if (p.vision > 0 && this.playerInCone(toPlayer) && ctx.isSeen(eye, ctx.playerPos, p.fov, dist)) {
      const light = 0.35 + ctx.lightAt(ctx.playerPos.x, ctx.playerPos.z) * 0.9;
      const crouchFactor = this.type === "wolf" ? 0.85 : 0.7;
      const range = p.vision * (0.55 + light);
      if (dist < range) {
        sees = true;
        const spd = 0.55 + Math.min(1, speedNow / 5) * 1.3;
        this.detection += dt * spd * (1 - dist / range) * light * crouchFactor;
      }
    }
    if (!sees) this.detection -= dt * (this.state === "combat" ? 0.08 : 0.34);
    this.detection = Math.max(0, Math.min(1.4, this.detection));

    const heardNoise = ctx.playerNoise > 0 && dist < p.hearing * (0.5 + ctx.playerNoise);
    if (heardNoise && this.state !== "combat" && Math.random() < dt * 3) {
      this.memory = Math.max(this.memory, 4);
      this.lastKnown.copy(ctx.playerPos);
      if (this.state === "patrol" || this.state === "idle") this.state = "investigate";
    }

    if ((this.detection >= 1 || shared > 0.6) && this.state !== "combat") {
      this.state = "combat";
      this.memory = 16;
      this.lastKnown.copy(sees ? ctx.playerPos : this.lastKnown);
      this.say("alert", dist);
      ctx.sharedAlert(this.pos, 1);
      // стая реагирует мгновенно
      ctx.onNoise(this.pos, 45, "shout");
    }

    if (this.memory > 0) this.memory -= dt;
    else if (this.state === "combat" || this.state === "investigate") {
      this.state = this.state === "combat" ? "investigate" : "patrol";
    }
    if (this.state === "combat") this.lastKnown.lerp(sees ? ctx.playerPos : this.lastKnown, Math.min(1, dt * 2));

    // ——— цели и движение ———
    let desired = new THREE.Vector3();
    let wantSpeed = 0;
    let faceTarget = false;

    if (this.state === "combat") {
      desired.copy(this.lastKnown);
      const dToLast = this.pos.distanceTo(this.lastKnown);
      faceTarget = true;
      const ranged = p.ranged && this.ammo > 0;

      if (this.type === "clicker" || this.type === "runner" || this.type === "dog" || this.type === "stalker") {
        // ближний бой: сближаются, сталкеры делают обход
        if (this.type === "stalker") {
          this.flankT -= dt;
          if (this.flankT <= 0) {
            this.flankT = 3 + Math.random() * 3;
            this.flankSide = Math.random() < 0.5 ? -1 : 1;
          }
          const side = new THREE.Vector3(-toPlayer.z, 0, toPlayer.x).normalize().multiplyScalar(this.flankSide);
          desired.copy(ctx.playerPos).addScaledVector(side, 7).sub(this.pos);
          wantSpeed = p.run * 0.75;
        } else {
          desired.copy(ctx.playerPos).sub(this.pos);
          wantSpeed = p.run;
        }
        if (dToLast < 2.2) wantSpeed = 0;
      } else if (this.type === "bloater") {
        desired.copy(ctx.playerPos).sub(this.pos);
        wantSpeed = dist > 9 ? p.run : 0;
        this.cooldown -= dt;
        if (this.cooldown <= 0 && dist < 26 && ctx.isSeen(eye, ctx.playerPos, 0, dist)) {
          this.cooldown = 4.5;
          this.throwSpore(ctx);
        }
        // фазы босса
        this.phase = this.hp < this.maxHp * 0.33 ? 2 : this.hp < this.maxHp * 0.66 ? 1 : 0;
        if (this.phase >= 1 && dist < 4) {
          ctx.damagePlayer(18, this.pos, "torso");
          this.cooldown = Math.max(this.cooldown, 1.5);
        }
      } else if (ranged) {
        // стрелок: занимает укрытие, стреляет, перезаряжается, фланкирует
        const hasCover = this.findCover(ctx) !== null;
        this.cooldown -= dt;
        const canSee = ctx.isSeen(eye, ctx.playerPos, 0, dist);
        if (canSee && dist > 40) {
          desired.copy(ctx.playerPos).sub(this.pos);
          wantSpeed = p.run;
        } else if (!canSee && dToLast > 6) {
          desired.copy(this.lastKnown).sub(this.pos);
          wantSpeed = p.run * 0.9;
        } else {
          wantSpeed = 0;
          if (this.cooldown <= 0 && canSee && this.ammo > 0) {
            this.cooldown = 0.9 + Math.random() * 1.4;
            this.ammo--;
            const spread = 0.035 + (1 - this.morale) * 0.05;
            audio.shot(this.weapon, this.pos.x, this.pos.y + 1.4, this.pos.z);
            const aimDir = ctx.playerPos.clone().sub(this.center).normalize();
            aimDir.x += (Math.random() - 0.5) * spread;
            aimDir.y += (Math.random() - 0.5) * spread;
            aimDir.z += (Math.random() - 0.5) * spread;
            aimDir.normalize();
            this.aimPitch = Math.asin(aimDir.y);
            this.aimYaw = Math.atan2(aimDir.x, aimDir.z);
            this.pose.attack = 1;
            if (Math.random() < 0.55 - spread * 4) ctx.damagePlayer(p.damage * (0.6 + Math.random() * 0.8), this.pos, Math.random() < 0.25 ? "arm" : Math.random() < 0.5 ? "leg" : "torso");
            this.say("shout", dist);
            if (this.ammo <= 0) {
              this.ammo = PROFILE[this.type].ranged ? 18 : 6;
              this.memory = 6;
            }
          }
        }
        void hasCover;
      }
      if (dist > 60 && this.memory < 6) this.state = "investigate";
    } else if (this.state === "investigate") {
      desired.copy(this.lastKnown).sub(this.pos);
      wantSpeed = p.speed * 1.5;
      faceTarget = true;
      if (this.pos.distanceTo(this.lastKnown) < 2.5) {
        this.waitT = 2.5 + Math.random() * 2;
        this.state = "patrol";
        this.target.copy(this.patrol[this.patrolI] ?? this.pos);
      }
      if (Math.random() < dt * 0.5) this.say("talk", dist);
    } else if (this.state === "flee") {
      desired.copy(this.pos).sub(ctx.playerPos).setY(0).normalize().multiplyScalar(12);
      wantSpeed = p.run * 1.05;
      faceTarget = false;
      if (dist > 45 || this.memory <= 0) {
        this.state = "patrol";
        this.morale = Math.min(1, this.morale + 0.3);
      }
    } else {
      // патруль / ожидание с распорядком
      if (this.waitT > 0) {
        this.waitT -= dt;
        wantSpeed = 0;
      } else {
        const tp = this.patrol[this.patrolI] ?? this.pos;
        desired.copy(tp).sub(this.pos);
        wantSpeed = p.speed * (this.type === "wolf" ? 1.15 : 0.95);
        faceTarget = true;
        if (this.pos.distanceTo(tp) < 2.4) {
          this.patrolI = (this.patrolI + 1) % Math.max(1, this.patrol.length);
          this.waitT = 1 + Math.random() * 4;
        }
      }
      // страх: при низкой морали и потере союзников
      if (this.morale < 0.32 && ctx.cruelty > 3 && Math.random() < dt * 0.4) {
        this.state = "flee";
        this.say("shout", dist);
      }
    }

    // напарник — своя логика
    if (this.type === "companion") {
      desired.copy(this.followPoint(ctx)).sub(this.pos);
      const d = desired.length();
      wantSpeed = d > 14 ? p.run : d > 4 ? p.speed * 1.6 : 0;
      faceTarget = this.state === "combat";
      const enemy = this.nearestEnemy(ctx);
      if (enemy) {
        this.state = "combat";
        this.lastKnown.copy(enemy.pos);
        const ed = this.pos.distanceTo(enemy.pos);
        const canSee = ctx.isSeen(this.center, enemy.center, 0.05, ed);
        wantSpeed = ed < 10 ? 0 : wantSpeed;
        if (canSee) {
          faceTarget = true;
          this.cooldown -= dt;
          if (this.cooldown <= 0) {
            this.cooldown = 0.55 + Math.random() * 0.6;
            audio.shot("rifle", this.pos.x, this.pos.y + 1.4, this.pos.z);
            const dir = enemy.center.clone().sub(this.center).normalize();
            dir.x += (Math.random() - 0.5) * 0.06;
            dir.y += (Math.random() - 0.5) * 0.04;
            dir.normalize();
            this.aimYaw = Math.atan2(dir.x, dir.z);
            this.aimPitch = Math.asin(dir.y);
            this.pose.attack = 1;
            enemy.hit(26, dir, Math.random() < 0.2 ? "head" : "torso", ctx);
            if (this.commentCd <= 0) {
              this.commentCd = 12 + Math.random() * 14;
              ctx.onCompanionSay(["Держу левый фланг.", "Они вылезают из-под машин!", "Патроны у меня, бери свои.", "Не геройствуй, прижмись!"][Math.floor(Math.random() * 4)]);
            }
          }
        } else if (ed > 30) this.state = "patrol";
      } else if (this.state === "combat" && this.memory <= 0) this.state = "patrol";
      // помогает: подбросить патроны
      if (this.commentCd <= 0 && Math.random() < dt * 0.05) {
        this.commentCd = 24;
        ctx.onCompanionSay("Возьми — у меня лишняя обойма.");
      }
    }
    this.commentCd = Math.max(0, this.commentCd - dt);

    // ——— движение с обходом препятствий ———
    if (desired.lengthSq() > 0.001) {
      desired.normalize();
      const spd = Math.min(wantSpeed, this.type === "wolf" && this.state === "combat" ? 6 : wantSpeed);
      const next = this.pos.clone().addScaledVector(desired, spd * dt);
      const blocked = this.blockedAt(next);
      if (blocked) {
        const perp = new THREE.Vector3(-desired.z, 0, desired.x);
        const left = this.pos.clone().addScaledVector(perp, spd * dt);
        const right = this.pos.clone().addScaledVector(perp, -spd * dt);
        const okL = !this.blockedAt(left);
        const okR = !this.blockedAt(right);
        if (okL && (!okR || this.flankSide > 0)) desired.copy(perp);
        else if (okR) desired.copy(perp).multiplyScalar(-1);
        else desired.multiplyScalar(-1);
        this.stuck += dt;
        if (this.stuck > 1.4) {
          this.stuck = 0;
          this.flankSide = Math.random() < 0.5 ? -1 : 1;
          this.target.copy(ctx.world.walkable[Math.floor(Math.random() * ctx.world.walkable.length)] ?? this.pos);
          this.patrol.unshift(this.target.clone());
        }
      } else this.stuck = Math.max(0, this.stuck - dt);
      const step = desired.clone().multiplyScalar(spd * dt);
      this.pos.add(step);
      this.vel.lerp(step, Math.min(1, dt * 4));
      if (faceTarget) {
        const f = this.state === "combat" ? this.lastKnown : this.pos.clone().add(desired);
        const want = Math.atan2(f.x - this.pos.x, f.z - this.pos.z);
        this.yaw = dampAngle(this.yaw, want, 8, dt);
      } else {
        this.yaw = dampAngle(this.yaw, Math.atan2(desired.x, desired.z), 6, dt);
      }
    }

    // шаги
    if (wantSpeed > 0.5) {
      this.animPhase += dt * this.spdAnim(wantSpeed);
      if (this.animPhase > Math.PI * 2) {
        this.animPhase -= Math.PI * 2;
        const surf = ctx.world.surfaceAt(this.pos.x, this.pos.z);
        audio.footstep(surf, Math.min(0.5, 0.12 + wantSpeed * 0.05));
        if (this.type === "clicker" && Math.random() < 0.5) audio.clicker(this.pos.x, this.pos.y + 1.6, this.pos.z);
        if (this.type === "clicker") ctx.onNoise(this.pos, this.state === "combat" ? 26 : 14, "click");
      }
    }
    if (this.type === "clicker" && Math.random() < dt * 0.55) audio.clicker(this.pos.x, this.pos.y + 1.6, this.pos.z);
    if (this.type === "bloater" && Math.random() < dt * 0.4) audio.growl(this.pos.x, this.pos.y + 1.6, this.pos.z, true);

    // урон вблизи
    if (this.state === "combat" && dist < (this.type === "bloater" ? 3.4 : 2.1)) {
      this.meleeCd -= dt;
      if (this.meleeCd <= 0) {
        this.meleeCd = this.type === "clicker" ? 1.1 : 1.5;
        this.pose.attack = 1;
        audio.meleeHit(true);
        const lethal = this.type === "clicker" && dist < 1.7;
        ctx.damagePlayer(lethal ? 48 : p.damage, this.pos, lethal ? "torso" : Math.random() < 0.5 ? "arm" : "leg");
      }
    }

    // гравитация/высота
    const gy = ctx.world.heightAt(this.pos.x, this.pos.z);
    this.pos.y += (gy - this.pos.y) * Math.min(1, dt * 12);
    g.position.copy(this.pos);
    g.rotation.y = this.yaw;

    // прицел/анимация
    const aimT = this.state === "combat" ? (p.ranged ? 1 : 0.2) : 0;
    this.pose.aim += (aimT - this.pose.aim) * Math.min(1, dt * 7);
    this.pose.speed = wantSpeed > 0 ? Math.min(6, wantSpeed) : 0;
    this.pose.crouch = this.state === "combat" && this.type === "wolf" && wantSpeed < 0.3 ? 0.7 : 0;
    if (this.state === "combat" && this.state === "combat" && faceTarget) {
      const d = this.lastKnown.clone().sub(this.center);
      this.aimYaw = dampAngle(this.aimYaw, Math.atan2(d.x, d.z), 10, dt);
      this.aimPitch = THREE.MathUtils.clamp(Math.atan2(d.y, Math.hypot(d.x, d.z)), -1, 1);
    }
    this.pose.aimPitch = -this.aimPitch * this.pose.aim;
    this.pose.lookYaw = THREE.MathUtils.clamp(this.aimYaw - this.yaw, -1.3, 1.3);
    this.pose.lookPitch = -this.aimPitch;
    this.pose.flinch *= Math.max(0, 1 - dt * 4);
    this.rig.animate(ctx.time, dt, this.pose);

    // мораль: союзники падают рядом → паника
    if (this.type === "wolf" && Math.random() < dt * 0.35) {
      const panic = SHARED_ALERT;
      this.morale = Math.max(0, this.morale - dt * 0.02 * panic);
      if (this.morale < 0.22 && this.state === "combat" && Math.random() < 0.3) {
        this.state = "flee";
        this.say("shout", dist);
      }
    }
    void ctx.playerNoise;
    void ctx.slow;
  }

  private spdAnim(s: number) {
    return 2.2 + s * 1.4;
  }

  /** поле зрения актёра: за спиной не видно, у заражённых оно шире */
  private playerInCone(toPlayer: THREE.Vector3): boolean {
    const fwd = new THREE.Vector3(Math.sin(this.yaw), 0, Math.cos(this.yaw));
    const flat = new THREE.Vector3(toPlayer.x, 0, toPlayer.z);
    if (flat.lengthSq() < 1e-6) return true;
    flat.normalize();
    const cone = this.type === "wolf" || this.type === "companion" ? 0.05 : -0.4;
    return flat.dot(fwd) > cone;
  }

  private followPoint(ctx: AICtx): THREE.Vector3 {
    const back = new THREE.Vector3(Math.sin(ctx.playerPos.x * 0.01), 0, Math.cos(ctx.playerPos.z * 0.01));
    const p = ctx.playerPos.clone().add(back.multiplyScalar(4));
    p.y = ctx.world.heightAt(p.x, p.z);
    return p;
  }

  private nearestEnemy(ctx: AICtx): Actor | null {
    // используется движком через внешний список
    const list = (ctx as any).__actors as Actor[] | undefined;
    if (!list) return null;
    let best: Actor | null = null;
    let bd = 45;
    for (const a of list) {
      if (a === this || a.isDead) continue;
      if (a.type === "companion") continue;
      const d = a.pos.distanceTo(this.pos);
      if (d < bd) {
        bd = d;
        best = a;
      }
    }
    return best;
  }

  private findCover(ctx: AICtx): THREE.Vector3 | null {
    let best: THREE.Vector3 | null = null;
    let bd = 1e9;
    for (const c of ctx.world.covers) {
      const d = c.distanceTo(this.pos);
      const dp = c.distanceTo(ctx.playerPos);
      if (d < 16 && dp > 8 && dp < 34 && d < bd) {
        bd = d;
        best = c;
      }
    }
    return best;
  }

  private throwSpore(ctx: AICtx) {
    audio.growl(this.pos.x, this.pos.y + 1.6, this.pos.z, true);
    const t = 1.4;
    // урон в радиусе приземления
    const land = ctx.playerPos.clone();
    setTimeout(() => {
      const d = land.distanceTo(ctx.playerPos);
      audio.thunder();
      if (d < 6) ctx.damagePlayer(30 * (1 - d / 6), this.pos, "torso");
      ctx.onNoise(land, 40, "boom");
    }, t * 1000);
  }

  /** дешёвая проверка препятствий: цилиндр тела против AABB-коллайдеров */
  blockedAt(p: THREE.Vector3): boolean {
    const r = this.type === "bloater" ? 0.9 : 0.5;
    const hLow = p.y + 0.35;
    const hHigh = p.y + (this.type === "bloater" ? 2.6 : 1.85);
    for (const c of this.world.colliders) {
      if (c.max.y < hLow || c.min.y > hHigh) continue;
      if (p.x + r > c.min.x && p.x - r < c.max.x && p.z + r > c.min.z && p.z - r < c.max.z) {
        if (c.kind === "climb") continue;
        return true;
      }
    }
    return false;
  }
}

// плавный поворот с учётом угла
function dampAngle(cur: number, want: number, lambda: number, dt: number) {
  let d = want - cur;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return cur + d * Math.min(1, lambda * dt);
}

/** Проверка ведения огня по линии видимости (общая для актёров). */
export function lineOfSight(
  world: WorldData,
  from: THREE.Vector3,
  to: THREE.Vector3,
  fovDot: number,
  dist: number
): boolean {
  if (dist <= 0) return false;
  void fovDot;
  const dir = to.clone().sub(from);
  const len = dir.length();
  if (len < 0.001) return true;
  dir.divideScalar(len);
  for (const c of world.colliders) {
    if (c.tag === "tree") continue;
    const t = rayBox(from, dir, c.min, c.max);
    if (t !== null && t < len) return false;
  }
  return true;
}

export function rayBox(o: THREE.Vector3, d: THREE.Vector3, min: THREE.Vector3, max: THREE.Vector3): number | null {
  let tmin = -Infinity;
  let tmax = Infinity;
  const axis: ("x" | "y" | "z")[] = ["x", "y", "z"];
  for (const a of axis) {
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
