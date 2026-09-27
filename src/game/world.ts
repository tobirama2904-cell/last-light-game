/**
 * Генератор открытого мира: рельеф, кварталы, лес, интерьеры, укрытия, лут, метки.
 * Всё создаётся процедурно при старте — сборка не зависит от внешних ресурсов.
 */
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import texGround from "../assets/tex_forest.jpg";
import texAsphalt from "../assets/tex_asphalt.jpg";
import texConcrete from "../assets/tex_concrete.jpg";
import texFoliage from "../assets/foliage.png";

export type Surface = "grass" | "concrete" | "wood" | "glass" | "water" | "metal" | "asphalt";

export interface Collider {
  min: THREE.Vector3;
  max: THREE.Vector3;
  kind: "solid" | "cover" | "vault" | "climb";
  tag?: string;
}

export interface LootBox {
  pos: THREE.Vector3;
  kind: "crate" | "bag" | "safe" | "shelf" | "car" | "body";
  items: string[];
  searched: boolean;
  mesh: THREE.Object3D;
  glint: THREE.Mesh | null;
}

export interface Marker {
  id: string;
  kind: "objective" | "note" | "quest" | "camp" | "boss";
  pos: THREE.Vector3;
  label: string;
  done?: boolean;
}

export interface Hub {
  id: string;
  label: string;
  x: number;
  z: number;
  r: number;
}

export const HUBS: Hub[] = [
  { id: "city", label: "Карантин · Элм-стрит", x: 0, z: -46, r: 60 },
  { id: "mill", label: "Мельница Харлоу", x: -58, z: 46, r: 34 },
  { id: "dam", label: "Плотина Кейнс-Рок", x: 12, z: 96, r: 34 },
  { id: "uni", label: "Медицинский корпус", x: 86, z: 60, r: 42 },
  { id: "winter", label: "Долина Купера", x: -86, z: -70, r: 40 },
  { id: "prison", label: "Тюрьма Санта-Ана", x: 44, z: -112, r: 46 },
  { id: "church", label: "Церковь Святого Марка", x: -6, z: 132, r: 34 },
];

export const MAP_SIZE = 460;

// ——————————————————————————————— шум рельефа ———————————————————————————————
function hash2(x: number, y: number) {
  let h = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return h - Math.floor(h);
}
function vnoise(x: number, y: number) {
  const xi = Math.floor(x),
    yi = Math.floor(y);
  const xf = x - xi,
    yf = y - yi;
  const u = xf * xf * (3 - 2 * xf);
  const v = yf * yf * (3 - 2 * yf);
  const a = hash2(xi, yi);
  const b = hash2(xi + 1, yi);
  const c = hash2(xi, yi + 1);
  const d = hash2(xi + 1, yi + 1);
  return (a * (1 - u) + b * u) * (1 - v) + (c * (1 - u) + d * u) * v;
}
function smoothstep(e0: number, e1: number, x: number) {
  const t = Math.max(0, Math.min(1, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
}

export function terrainHeight(x: number, z: number): number {
  let h =
    vnoise(x * 0.0075, z * 0.0075) * 14 +
    vnoise(x * 0.021, z * 0.021) * 4.2 +
    vnoise(x * 0.07, z * 0.07) * 0.9 -
    6.4;
  // дороги (по осям) и окрестности — сглаживаем
  const roadX = Math.abs(z);
  const roadZ = Math.abs(x);
  const road = Math.min(roadX, roadZ);
  h = THREE.MathUtils.lerp(h * 0.15, h, smoothstep(7, 22, road));
  // площадки объектов
  for (const hub of HUBS) {
    const d = Math.hypot(x - hub.x, z - hub.z);
    if (d < hub.r + 26) h = THREE.MathUtils.lerp(0, h, smoothstep(hub.r - 10, hub.r + 26, d));
  }
  // границы карты — горы-обод
  const edge = Math.max(Math.abs(x), Math.abs(z));
  if (edge > MAP_SIZE / 2 - 40) h += (edge - (MAP_SIZE / 2 - 40)) * 0.55;
  return h;
}

export interface WorldData {
  colliders: Collider[];
  loot: LootBox[];
  markers: Marker[];
  walkable: THREE.Vector3[];
  covers: THREE.Vector3[];
  water: THREE.Mesh[];
  campfires: { light: THREE.PointLight; pos: THREE.Vector3 }[];
  sun: THREE.DirectionalLight;
  hemi: THREE.HemisphereLight;
  sky: THREE.Mesh;
  rain: THREE.Points;
  snow: THREE.Points;
  grassMat: THREE.Material;
  mapShapes: { kind: string; label: string; x: number; z: number; w: number; d: number }[];
  heightAt: (x: number, z: number) => number;
  surfaceAt: (x: number, z: number) => Surface;
  indoorAt: (x: number, z: number) => boolean;
}

export function buildWorld(scene: THREE.Scene, quality: "high" | "low" = "high"): WorldData {
  const loader = new THREE.TextureLoader();
  const groundTex = loader.load(texGround);
  const asphaltTex = loader.load(texAsphalt);
  const concreteTex = loader.load(texConcrete);
  const foliageTex = loader.load(texFoliage);
  for (const t of [groundTex, asphaltTex, concreteTex]) {
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 4;
  }
  foliageTex.colorSpace = THREE.SRGBColorSpace;
  groundTex.repeat.set(90, 90);
  asphaltTex.repeat.set(8, 8);
  concreteTex.repeat.set(3, 3);

  const colliders: Collider[] = [];
  const loot: LootBox[] = [];
  const markers: Marker[] = [];
  const walkable: THREE.Vector3[] = [];
  const covers: THREE.Vector3[] = [];
  const water: THREE.Mesh[] = [];
  const campfires: { light: THREE.PointLight; pos: THREE.Vector3 }[] = [];
  const mapShapes: WorldData["mapShapes"] = [];
  const disposables: (THREE.BufferGeometry | THREE.Material | THREE.Texture)[] = [];

  const heightAt = terrainHeight;

  // ————————————————— рельеф —————————————————
  const segs = quality === "high" ? 160 : 96;
  const gGeo = new THREE.PlaneGeometry(MAP_SIZE, MAP_SIZE, segs, segs);
  gGeo.rotateX(-Math.PI / 2);
  const pos = gGeo.attributes.position as THREE.BufferAttribute;
  const colors = new Float32Array(pos.count * 3);
  const cLow = new THREE.Color(0x39412d);
  const cHigh = new THREE.Color(0x5b6047);
  const cRock = new THREE.Color(0x55584d);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    const y = heightAt(x, z);
    pos.setY(i, y);
    const c = y > 8 ? cRock : y < -2 ? cLow : cLow.clone().lerp(cHigh, (y + 6) / 14);
    colors[i * 3] = c.r;
    colors[i * 3 + 1] = c.g;
    colors[i * 3 + 2] = c.b;
  }
  gGeo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  gGeo.computeVertexNormals();
  const groundMat = new THREE.MeshStandardMaterial({
    map: groundTex,
    vertexColors: true,
    roughness: 0.97,
    metalness: 0,
  });
  const ground = new THREE.Mesh(gGeo, groundMat);
  ground.receiveShadow = true;
  scene.add(ground);
  disposables.push(gGeo, groundMat);

  // ————————————————— дороги —————————————————
  const roadMat = new THREE.MeshStandardMaterial({ map: asphaltTex, roughness: 0.92, color: 0x9aa090 });
  const makeRoad = (axis: "x" | "z", len: number) => {
    const steps = 60;
    for (let i = 0; i < steps; i++) {
      const t = (i / steps - 0.5) * len;
      const x = axis === "x" ? t : 0;
      const z = axis === "x" ? 0 : t;
      const y = heightAt(x, z);
      const seg = new THREE.Mesh(new THREE.PlaneGeometry(axis === "x" ? len / steps + 1.2 : 13, axis === "x" ? 13 : len / steps + 1.2), roadMat);
      seg.rotation.x = -Math.PI / 2;
      seg.position.set(x, y + 0.06, z);
      seg.receiveShadow = true;
      scene.add(seg);
      disposables.push(seg.geometry);
    }
  };
  makeRoad("x", MAP_SIZE - 30);
  makeRoad("z", MAP_SIZE - 30);
  mapShapes.push({ kind: "road", label: "Шоссе", x: 0, z: 0, w: MAP_SIZE, d: 13 });
  mapShapes.push({ kind: "road", label: "Проспект", x: 0, z: 0, w: 13, d: MAP_SIZE });

  // ————————————————— строительные примитивы —————————————————
  const concreteMat = new THREE.MeshStandardMaterial({ map: concreteTex, color: 0xb9b6a6, roughness: 0.95 });
  const darkMat = new THREE.MeshStandardMaterial({ color: 0x3b4038, roughness: 0.9 });
  const woodMat = new THREE.MeshStandardMaterial({ color: 0x6b533c, roughness: 0.95 });
  const metalMat = new THREE.MeshStandardMaterial({ color: 0x767a70, roughness: 0.5, metalness: 0.7 });
  const rustMat = new THREE.MeshStandardMaterial({ color: 0x8a4b32, roughness: 0.85, metalness: 0.3 });
  disposables.push(concreteMat, darkMat, woodMat, metalMat, rustMat);

  const box = (
    x: number,
    y: number,
    z: number,
    w: number,
    h: number,
    d: number,
    m: THREE.Material,
    kind: Collider["kind"] | null = "solid",
    scene_ = scene,
    ry = 0
  ) => {
    const geo = new THREE.BoxGeometry(w, h, d);
    const mesh = new THREE.Mesh(geo, m);
    mesh.position.set(x, y + h / 2, z);
    mesh.rotation.y = ry;
    mesh.castShadow = h < 12;
    mesh.receiveShadow = true;
    scene_.add(mesh);
    disposables.push(geo);
    if (kind) addCollider(x, y, z, w, h, d, kind, ry);
    return mesh;
  };

  const addCollider = (x: number, y: number, z: number, w: number, h: number, d: number, kind: Collider["kind"], ry = 0) => {
    if (Math.abs(ry) < 0.01) {
      colliders.push({
        min: new THREE.Vector3(x - w / 2, y, z - d / 2),
        max: new THREE.Vector3(x + w / 2, y + h, z + d / 2),
        kind,
        tag: "block",
      });
    } else {
      // повёрнутые — берём описанную с запасом (корректность важнее точности)
      const r = Math.max(w, d) / 2;
      colliders.push({
        min: new THREE.Vector3(x - r, y, z - r),
        max: new THREE.Vector3(x + r, y + h, z + r),
        kind,
        tag: "block",
      });
    }
  };

  // здание: стены с оконными проёмами (в них можно запрыгнуть), двери, этажи, лестницы
  const building = (
    cx: number,
    cz: number,
    w: number,
    d: number,
    floors: number,
    opts: { door?: "s" | "n" | "e" | "w" | "none"; color?: number; interior?: boolean; roof?: boolean; label?: string } = {}
  ) => {
    const baseY = heightAt(cx, cz);
    const fh = 3.2;
    const wallT = 0.4;
    const mat_ = opts.color
      ? new THREE.MeshStandardMaterial({ map: concreteTex, color: opts.color, roughness: 0.95 })
      : concreteMat;
    if (opts.color) disposables.push(mat_);
    for (let f = 0; f < floors; f++) {
      const y = baseY + f * fh;
      // пол этого этажа (у верхних этажей — проём под лестницу)
      if (f === 0) {
        box(cx, y, cz, w, 0.3, d, darkMat, "solid");
      } else {
        const holeX = cx + w / 2 - 2.6;
        const mainW = holeX - (cx - w / 2);
        box(cx - w / 2 + mainW / 2, y, cz, mainW, 0.3, d, darkMat, "solid");
        const stripZ0 = cz - d / 2 + 6;
        const stripD = cz + d / 2 - stripZ0;
        if (stripD > 1.5) box(holeX + 1.3, y, stripZ0 + stripD / 2, 2.6, 0.3, stripD, darkMat, "solid");
      }
      // четыре стены с проёмами
      const walls: [number, number, number, number][] = [
        [cx, cz + d / 2, w, 0], // south (z+)
        [cx, cz - d / 2, w, 0], // north
        [cx - w / 2, cz, d, 1], // west
        [cx + w / 2, cz, d, 1], // east
      ];
      walls.forEach(([wx, wz, len, axis], wi) => {
        const isDoorSide =
          (opts.door === "s" && wi === 0) ||
          (opts.door === "n" && wi === 1) ||
          (opts.door === "w" && wi === 2) ||
          (opts.door === "e" && wi === 3);
        const windows = Math.max(1, Math.floor(len / 3.4));
        const gapW = 1.5;
        const sill = 0.6;
        const head = 2.6;
        for (let i = 0; i < windows; i++) {
          const off = -len / 2 + (i + 0.5) * (len / windows);
          const isDoor = f === 0 && isDoorSide && i === Math.floor(windows / 2);
          // пилоны между проёмами
          const pillarW = len / windows - gapW;
          if (pillarW > 0.15) {
            const px = axis === 0 ? wx + off - (len / windows - gapW) / 2 - gapW / 2 + gapW / 2 : wx;
            const pz = axis === 0 ? wz : wz + off - (len / windows) / 2 + gapW / 2;
            box(
              axis === 0 ? wx + off - (len / windows - gapW) / 2 - gapW / 2 + gapW / 2 : wx - wallT / 2,
              y + 0.3,
              axis === 0 ? wz - wallT / 2 : pz,
              axis === 0 ? pillarW : wallT,
              fh - 0.6,
              axis === 0 ? wallT : pillarW,
              mat_,
              "solid"
            );
            void px;
          }
          // цоколь и перемычка
          const sillH = sill - 0.3;
          const headStart = head;
          const headH = fh - 0.3 - headStart;
          const midX = axis === 0 ? wx + off : wx;
          const midZ = axis === 0 ? wz : wz + off;
          if (!isDoor) {
            box(axis === 0 ? midX : midX, y + 0.3, axis === 0 ? midZ : midZ, axis === 0 ? len / windows : wallT, Math.max(0.05, sillH), axis === 0 ? wallT : len / windows, mat_, "vault");
          } else {
            // дверной проём: перемычка сверху, боковые нет
            box(midX, y + headStart, midZ, axis === 0 ? len / windows : wallT, headH, axis === 0 ? wallT : len / windows, mat_, null);
          }
          if (isDoor && headH > 0) {
            box(midX, y + headStart, midZ, axis === 0 ? len / windows : wallT, headH, axis === 0 ? wallT : len / windows, mat_, null);
          } else if (headH > 0.1) {
            box(midX, y + headStart, midZ, axis === 0 ? len / windows : wallT, headH, axis === 0 ? wallT : len / windows, mat_, "solid");
          }
        }
      });
      // лестница на верхний этаж (внутри)
      if (opts.interior !== false && f < floors - 1) {
        const sx = cx + w / 2 - 1.6;
        const sz = cz - d / 2 + 1.6;
        for (let s = 0; s < 9; s++) {
          box(sx, y + 0.3 + s * 0.34, sz + s * 0.4, 1.6, 0.34, 0.42, woodMat, "solid");
        }
      }
    }
    // крыша
    const topY = baseY + floors * fh;
    if (opts.roof !== false) box(cx, topY, cz, w, 0.35, d, darkMat, "solid");
    // вентиляция/антенны для читаемости силуэта
    box(cx + w / 4, topY + 0.35, cz - d / 4, 1.6, 1.2, 1.6, metalMat, null);
    mapShapes.push({ kind: "building", label: opts.label ?? "Здание", x: cx, z: cz, w, d });
    return { baseY, topY };
  };

  // мебель / укрытия внутри
  const furnish = (cx: number, cz: number, w: number, d: number, y: number, seed: number) => {
    const n = 3 + Math.floor(hash2(seed, 7) * 4);
    for (let i = 0; i < n; i++) {
      const a = hash2(seed + i, 3);
      const b = hash2(seed + i, 9);
      const px = cx + (a - 0.5) * (w - 3);
      const pz = cz + (b - 0.5) * (d - 3);
      const kind = Math.floor(hash2(seed + i, 11) * 4);
      if (kind === 0) {
        box(px, y, pz, 1.6, 0.8, 0.9, woodMat, "cover");
        addLoot(px, y + 0.8, pz, "shelf");
      } else if (kind === 1) {
        box(px, y, pz, 1.1, 0.5, 1.1, darkMat, "vault");
      } else if (kind === 2) {
        box(px, y, pz, 2.0, 0.45, 0.9, woodMat, "cover");
        addLoot(px, y + 0.45, pz, "crate");
      } else {
        // сломанное окно: осколки стекла
        const g = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 1.4), new THREE.MeshStandardMaterial({ color: 0x9fb4b0, transparent: true, opacity: 0.28, roughness: 0.1, metalness: 0.3, side: THREE.DoubleSide }));
        g.rotation.x = -Math.PI / 2;
        g.position.set(px, y + 0.02, pz);
        scene.add(g);
        water.push(g);
        disposables.push(g.geometry, g.material as THREE.Material);
      }
    }
  };

  const ITEM_POOL = [
    "rag",
    "alcohol",
    "scrap",
    "tape",
    "blade",
    "powder",
    "ammo9",
    "ammo556",
    "shell",
    "arrow",
    "food",
    "herb",
    "sugar",
    "fuel",
    "battery",
    // оружие встречается в мире и остаётся в слотах
    "rifle",
    "shotgun",
    "sniper",
    "bow",
    "bat",
    "axe",
    "ammo9",
    "rag",
    "scrap",
  ];
  const randItems = (n: number, seed: number) => {
    const out: string[] = [];
    for (let i = 0; i < n; i++) out.push(ITEM_POOL[Math.floor(hash2(seed, i * 13 + 5) * ITEM_POOL.length)]);
    return out;
  };

  function addLoot(x: number, y: number, z: number, kind: LootBox["kind"], seed = Math.random() * 9999) {
    const matLoot = kind === "car" ? rustMat : kind === "body" ? darkMat : kind === "safe" ? metalMat : woodMat;
    const geo =
      kind === "bag"
        ? new THREE.SphereGeometry(0.36, 10, 8)
        : new THREE.BoxGeometry(kind === "car" ? 1.4 : 0.7, kind === "car" ? 0.6 : 0.5, kind === "car" ? 2.4 : 0.55);
    const mesh = new THREE.Mesh(geo, matLoot);
    mesh.userData.noMerge = true;
    mesh.position.set(x, y + (kind === "car" ? 0.3 : 0.25), z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    scene.add(mesh);
    disposables.push(geo);
    const glintGeo = new THREE.SphereGeometry(0.09, 6, 5);
    const glintMat = new THREE.MeshBasicMaterial({ color: 0xe8e2d3, transparent: true, opacity: 0.9 });
    const glint = new THREE.Mesh(glintGeo, glintMat);
    glint.userData.noMerge = true;
    glint.position.copy(mesh.position).add(new THREE.Vector3(0, 0.5, 0));
    scene.add(glint);
    disposables.push(glintGeo, glintMat);
    loot.push({ pos: mesh.position.clone(), kind, items: randItems(1 + Math.floor(hash2(seed, 2) * 3), seed), searched: false, mesh, glint });
  }

  // ————————————————— квартал города —————————————————
  const cityC: [number, number, number, number, number][] = [
    [-40, -66, 16, 14, 3],
    [-18, -70, 14, 16, 4],
    [6, -72, 18, 14, 2],
    [30, -64, 15, 15, 3],
    [-44, -34, 17, 13, 3],
    [-20, -30, 13, 13, 2],
    [26, -34, 16, 18, 4],
    [48, -46, 14, 14, 2],
    [-70, -52, 15, 16, 2],
    [70, -70, 16, 14, 3],
    [58, -16, 13, 14, 2],
    [-58, -14, 14, 12, 3],
  ];
  cityC.forEach(([x, z, w, d, f], i) => {
    const doors: ("s" | "n" | "e" | "w")[] = ["s", "n", "e", "w"];
    const b = building(x, z, w, d, f, {
      door: doors[i % 4],
      interior: true,
      color: i % 3 === 0 ? 0x9c9684 : undefined,
      label: i === 0 ? "Отель «Риверсайд»" : "Жилой дом",
    });
    furnish(x, z, w - 1.5, d - 1.5, b.baseY + 0.3, i * 17);
    if (i === 0)
      markers.push({
        id: "sq2",
        kind: "quest",
        pos: new THREE.Vector3(x + w / 2 + 3, b.baseY + 0.4, z + d / 2 + 3),
        label: "Радио отеля «Риверсайд»",
      });
  });

  // блокпост (цель главы 1)
  box(64, heightAt(64, -52), -52, 2.4, 3.2, 0.5, metalMat, "solid");
  box(64, heightAt(64, -52), -58, 0.4, 2.6, 7, rustMat, "solid");
  const sand = new THREE.Mesh(new THREE.BoxGeometry(3, 1, 1), woodMat);
  sand.position.set(70, heightAt(70, -54) + 0.5, -54);
  scene.add(sand);
  colliders.push({ min: new THREE.Vector3(68.5, heightAt(70, -54), -55), max: new THREE.Vector3(71.5, heightAt(70, -54) + 1, -53), kind: "cover", tag: "block" });
  covers.push(new THREE.Vector3(70, heightAt(70, -54), -56));
  mapShapes.push({ kind: "poi", label: "Блокпост Элм-стрит", x: 64, z: -52, w: 14, d: 14 });

  // ————————————————— лесная мельница (хаб 2) —————————————————
  {
    const x = -58,
      z = 46;
    const b = building(x, z, 22, 16, 2, { door: "s", interior: true, color: 0x8e8877, label: "Мельница Харлоу" });
    furnish(x, z, 20, 14, b.baseY + 0.3, 77);
    // палатки и костёр
    for (let i = 0; i < 4; i++) {
      const tx = x + 14 + (i % 2) * 7;
      const tz = z - 8 + Math.floor(i / 2) * 8;
      const ty = heightAt(tx, tz);
      const cone = new THREE.Mesh(new THREE.ConeGeometry(2.2, 2.4, 6), new THREE.MeshStandardMaterial({ color: i % 2 ? 0x6a6a52 : 0x7b6b52, roughness: 0.95 }));
      cone.position.set(tx, ty + 1.2, tz);
      cone.castShadow = true;
      scene.add(cone);
      disposables.push(cone.geometry, cone.material as THREE.Material);
      colliders.push({ min: new THREE.Vector3(tx - 1.6, ty, tz - 1.6), max: new THREE.Vector3(tx + 1.6, ty + 2.4, tz + 1.6), kind: "solid", tag: "block" });
      addLoot(tx, ty + 0.1, tz + 1.6, "bag", i * 31);
    }
    makeCampfire(x + 6, z + 6, "Роза · костёр лагеря");
    markers.push({ id: "sq1", kind: "quest", pos: new THREE.Vector3(x + 12, heightAt(x + 12, z), z), label: "Караван Розы" });
    mapShapes.push({ kind: "poi", label: "Лагерь Харлоу-Милл", x, z, w: 40, d: 34 });
  }

  // ————————————————— плотина и туннель (хаб 3) —————————————————
  {
    const x = 12,
      z = 96;
    const y = heightAt(x, z);
    // стена плотины с реальным проёмом в туннель
    box(x - 14, y, z + 8, 18, 16, 6, concreteMat, "solid");
    box(x + 14, y, z + 8, 18, 16, 6, concreteMat, "solid");
    box(x, y + 6, z + 8, 12, 10, 6, concreteMat, "solid");
    box(x - 24, y, z + 4, 6, 10, 14, concreteMat, "solid");
    box(x + 24, y, z + 4, 6, 10, 14, concreteMat, "solid");
    // проход-портал
    box(x - 8, y, z + 8, 12, 8, 6.4, concreteMat, null);
    box(x + 8, y, z + 8, 12, 8, 6.4, concreteMat, null);
    box(x, y + 6, z + 8, 30, 4, 6.4, concreteMat, null);
    // туннель (труба из колец)
    for (let i = 0; i < 14; i++) {
      const tz = z + 14 + i * 5;
      const ty = heightAt(x, tz);
      const ring = new THREE.Mesh(new THREE.CylinderGeometry(5.4, 5.4, 5.2, 16, 1, true), new THREE.MeshStandardMaterial({ map: concreteTex, color: 0x8d8a7c, roughness: 1, side: THREE.BackSide }));
      ring.rotation.x = Math.PI / 2;
      ring.position.set(x, ty + 4, tz);
      scene.add(ring);
      disposables.push(ring.geometry, ring.material as THREE.Material);
      colliders.push({ min: new THREE.Vector3(x - 5.6, ty, tz - 2.6), max: new THREE.Vector3(x - 4.4, ty + 6, tz + 2.6), kind: "solid", tag: "block" });
      colliders.push({ min: new THREE.Vector3(x + 4.4, ty, tz - 2.6), max: new THREE.Vector3(x + 5.6, ty + 6, tz + 2.6), kind: "solid", tag: "block" });
      if (i % 3 === 1) addLoot(x + (i % 2 ? 3 : -3), ty + 0.1, tz, "body", i * 7);
    }
    markers.push({ id: "diary", kind: "note", pos: new THREE.Vector3(x + 3, heightAt(x + 3, z + 40) + 0.4, z + 40), label: "Радиодневник · 04:12" });
    mapShapes.push({ kind: "poi", label: "Плотина Кейнс-Рок", x, z, w: 60, d: 40 });
  }

  // ————————————————— медицинский корпус (хаб 4) —————————————————
  {
    const x = 86,
      z = 60;
    const b = building(x, z, 34, 26, 2, { door: "w", interior: true, color: 0xa8a493, label: "Медицинский корпус" });
    furnish(x, z, 31, 23, b.baseY + 0.3, 101);
    furnish(x, z, 31, 23, b.baseY + 3.5, 202);
    box(x + 6, b.baseY + 0.3, z, 3, 1.4, 1.6, metalMat, "cover");
    addLoot(x + 6, b.baseY + 1.7, z, "safe", 55);
    markers.push({ id: "arch", kind: "objective", pos: new THREE.Vector3(x - 8, b.baseY + 0.4, z - 6), label: "Архив лаборатории" });
    mapShapes.push({ kind: "poi", label: "Медицинский корпус", x, z, w: 46, d: 36 });
  }

  // ————————————————— зимняя долина (хаб 5) —————————————————
  {
    const x = -86,
      z = -70;
    for (let i = 0; i < 5; i++) {
      const hx = x + (i % 3) * 12 - 12;
      const hz = z + Math.floor(i / 3) * 14;
      const hb = building(hx, hz, 9, 8, 1, { door: i % 2 ? "s" : "e", interior: true, color: 0x7d7461, label: "Хижины охотников" });
      furnish(hx, hz, 7.5, 6.5, hb.baseY + 0.3, 300 + i);
    }
    makeCampfire(x + 4, z + 16, "Охотничий отряд");
    markers.push({ id: "med", kind: "objective", pos: new THREE.Vector3(x + 6, heightAt(x + 6, z + 4), z + 4), label: "Антибиотики" });
    mapShapes.push({ kind: "poi", label: "Долина Купера", x, z, w: 52, d: 40 });
  }

  // ————————————————— тюрьма (хаб 6) —————————————————
  {
    const x = 44,
      z = -112;
    const y = heightAt(x, z);
    // северная стена с воротами (проём 12 м)
    box(x - 18, y, z - 24, 24, 7, 2, concreteMat, "solid");
    box(x + 18, y, z - 24, 24, 7, 2, concreteMat, "solid");
    box(x, y + 5, z - 24, 12, 2, 2.4, rustMat, null);
    box(x, y, z + 24, 60, 7, 2, concreteMat, "solid");
    box(x - 30, y, z, 2, 7, 48, concreteMat, "solid");
    box(x + 30, y, z, 2, 7, 48, concreteMat, "solid");
    const b1 = building(x - 14, z + 6, 18, 14, 2, { door: "n", interior: true, label: "Восточный блок" });
    furnish(x - 14, z + 6, 16, 12, b1.baseY + 0.3, 411);
    const b2 = building(x + 16, z + 4, 16, 12, 1, { door: "n", interior: true, label: "Амбулатория" });
    furnish(x + 16, z + 4, 14, 10, b2.baseY + 0.3, 412);
    // наблюдательные вышки
    for (const tx of [x - 26, x + 26]) {
      box(tx, y, z - 20, 3, 9, 3, concreteMat, "solid");
      box(tx, y + 9, z - 20, 5, 0.4, 5, metalMat, "solid");
    }
    markers.push({ id: "rescue", kind: "objective", pos: new THREE.Vector3(x - 14, b1.baseY + 0.4, z + 10), label: "Клетка Дейла" });
    mapShapes.push({ kind: "poi", label: "Тюрьма Санта-Ана", x, z, w: 66, d: 54 });
  }

  // ————————————————— церковь (финал) —————————————————
  {
    const x = -6,
      z = 132;
    const b = building(x, z, 26, 44, 2, { door: "s", interior: true, color: 0xa39b86, label: "Церковь Святого Марка" });
    // алтарь
    box(x, b.baseY + 0.3, z - 16, 6, 1.2, 3, woodMat, "cover");
    box(x, b.baseY + 1.5, z - 18, 2.4, 2.4, 1, rustMat, "solid");
    // колокольня
    box(x + 10, b.topY, z - 14, 7, 12, 7, concreteMat, "solid");
    box(x + 10, b.topY + 12, z - 14, 8.4, 1, 8.4, darkMat, "solid");
    // ряды скамей
    for (let i = 0; i < 8; i++) {
      box(x - 5, b.baseY + 0.3, z + 14 - i * 4, 8, 0.5, 1.1, woodMat, "cover");
      box(x + 5, b.baseY + 0.3, z + 14 - i * 4, 8, 0.5, 1.1, woodMat, "cover");
    }
    mapShapes.push({ kind: "poi", label: "Церковь Святого Марка", x, z, w: 40, d: 56 });
  }

  function makeCampfire(x: number, z: number, label: string) {
    const y = heightAt(x, z);
    const stones = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.2, 0.4, 10), darkMat);
    stones.position.set(x, y + 0.2, z);
    scene.add(stones);
    disposables.push(stones.geometry);
    const light = new THREE.PointLight(0xff9040, 14, 26, 2);
    light.position.set(x, y + 1.4, z);
    light.castShadow = false;
    scene.add(light);
    campfires.push({ light, pos: new THREE.Vector3(x, y + 1, z) });
    const flames = new THREE.Mesh(
      new THREE.ConeGeometry(0.5, 1.2, 7),
      new THREE.MeshBasicMaterial({ color: 0xff7a2a, transparent: true, opacity: 0.85 })
    );
    flames.userData.noMerge = true;
    flames.position.set(x, y + 0.9, z);
    scene.add(flames);
    disposables.push(flames.geometry, flames.material as THREE.Material);
    markers.push({ id: "fire_" + label, kind: "camp", pos: new THREE.Vector3(x, y, z), label });
    addLoot(x + 2, y, z + 1, "crate", x * 3 + z);
    covers.push(new THREE.Vector3(x, y, z));
  }

  // ————————————————— машины, заборы, бочки —————————————————
  for (let i = 0; i < 42; i++) {
    const along = i % 2 === 0;
    const t = (hash2(i, 44) - 0.5) * (MAP_SIZE - 60);
    const off = (hash2(i, 55) - 0.5) * 9;
    const x = along ? t : off;
    const z = along ? off : t;
    if (Math.abs(x) > MAP_SIZE / 2 - 20 || Math.abs(z) > MAP_SIZE / 2 - 20) continue;
    let nearHub = false;
    for (const h of HUBS) if (Math.hypot(x - h.x, z - h.z) < h.r * 0.5) nearHub = true;
    if (nearHub && i % 3 !== 0) continue;
    const y = heightAt(x, z);
    const ry = along ? (hash2(i, 66) - 0.5) * 0.4 : Math.PI / 2 + (hash2(i, 66) - 0.5) * 0.4;
    const bodyGeo = new THREE.BoxGeometry(2.1, 1.0, 4.6);
    const bodyM = new THREE.Mesh(bodyGeo, new THREE.MeshStandardMaterial({ color: [0x6b3f34, 0x3f4b52, 0x585a4b, 0x7b7365][i % 4], roughness: 0.72, metalness: 0.35 }));
    bodyM.position.set(x, y + 0.8, z);
    bodyM.rotation.y = ry;
    bodyM.castShadow = true;
    bodyM.receiveShadow = true;
    scene.add(bodyM);
    disposables.push(bodyGeo, bodyM.material as THREE.Material);
    const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.8, 2.2), new THREE.MeshStandardMaterial({ color: 0x1d211f, roughness: 0.35, metalness: 0.5 }));
    cabin.position.set(x, y + 1.6, z);
    cabin.rotation.y = ry;
    scene.add(cabin);
    disposables.push(cabin.geometry, cabin.material as THREE.Material);
    addCollider(x, y, z, 4.9, 2, 4.9, "cover", ry);
    covers.push(new THREE.Vector3(x, y, z));
    if (i % 4 === 0) addLoot(x + Math.cos(ry) * 1.6, y, z + Math.sin(ry) * 1.6, "car", i * 13);
    if (i % 5 === 0) {
      const glass = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 1.6), new THREE.MeshStandardMaterial({ color: 0xbfd0cc, transparent: true, opacity: 0.3, roughness: 0.05, side: THREE.DoubleSide }));
      glass.rotation.x = -Math.PI / 2;
      glass.position.set(x + 3, y + 0.03, z + 3);
      scene.add(glass);
      water.push(glass);
      disposables.push(glass.geometry, glass.material as THREE.Material);
    }
  }

  // бочки и ящики вдоль дорог
  for (let i = 0; i < 60; i++) {
    const x = (hash2(i, 101) - 0.5) * (MAP_SIZE - 70);
    const z = (hash2(i, 202) - 0.5) * (MAP_SIZE - 70);
    const y = heightAt(x, z);
    const r = 0.55;
    const geo = new THREE.CylinderGeometry(r, r, 1.2, 10);
    const m = new THREE.Mesh(geo, i % 3 === 0 ? rustMat : metalMat);
    m.position.set(x, y + 0.6, z);
    m.castShadow = true;
    scene.add(m);
    disposables.push(geo);
    colliders.push({ min: new THREE.Vector3(x - r, y, z - r), max: new THREE.Vector3(x + r, y + 1.2, z + r), kind: "cover", tag: "barrel" });
    covers.push(new THREE.Vector3(x, y, z));
    if (i % 4 === 0) addLoot(x, y + 1.2, z, "crate", i * 5);
  }

  // ————————————————— лес —————————————————
  const treeCount = quality === "high" ? 620 : 300;
  const trunkGeo = new THREE.CylinderGeometry(0.22, 0.42, 1, 7);
  const canopyGeo = new THREE.IcosahedronGeometry(1, 1);
  const trunkMat = new THREE.MeshStandardMaterial({ color: 0x4a3d30, roughness: 1 });
  const canopyMat = new THREE.MeshStandardMaterial({ color: 0x51663c, roughness: 0.95 });
  const trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, treeCount);
  const canopies = new THREE.InstancedMesh(canopyGeo, canopyMat, treeCount);
  trunks.castShadow = true;
  canopies.castShadow = true;
  const dummy = new THREE.Object3D();
  const col = new THREE.Color();
  let placed = 0;
  for (let i = 0; i < treeCount * 8 && placed < treeCount; i++) {
    const x = (hash2(i, 7.3) - 0.5) * (MAP_SIZE - 40);
    const z = (hash2(i, 13.7) - 0.5) * (MAP_SIZE - 40);
    let skip = false;
    for (const h of HUBS) if (Math.hypot(x - h.x, z - h.z) < h.r * 0.85) skip = true;
    if (Math.abs(x) < 12 || Math.abs(z) < 12) skip = true;
    if (skip) continue;
    const y = heightAt(x, z);
    const hgt = 6 + hash2(i, 3) * 8;
    dummy.position.set(x, y + hgt / 2, z);
    dummy.scale.set(1, hgt, 1);
    dummy.rotation.set(0, hash2(i, 5) * 6.28, (hash2(i, 6) - 0.5) * 0.12);
    dummy.updateMatrix();
    trunks.setMatrixAt(placed, dummy.matrix);
    dummy.position.set(x, y + hgt * 0.92, z);
    const cr = 2.2 + hash2(i, 8) * 2.4;
    dummy.scale.set(cr, cr * 0.75, cr);
    dummy.rotation.set(hash2(i, 9), hash2(i, 10) * 6.28, 0);
    dummy.updateMatrix();
    canopies.setMatrixAt(placed, dummy.matrix);
    col.setHSL(0.24 + hash2(i, 11) * 0.05, 0.3, 0.2 + hash2(i, 12) * 0.12);
    canopies.setColorAt(placed, col);
    colliders.push({ min: new THREE.Vector3(x - 0.45, y, z - 0.45), max: new THREE.Vector3(x + 0.45, y + hgt, z + 0.45), kind: "solid", tag: "tree" });
    placed++;
  }
  trunks.count = placed;
  canopies.count = placed;
  trunks.instanceMatrix.needsUpdate = true;
  canopies.instanceMatrix.needsUpdate = true;
  if (canopies.instanceColor) canopies.instanceColor.needsUpdate = true;
  scene.add(trunks, canopies);
  disposables.push(trunkGeo, canopyGeo, trunkMat, canopyMat);

  // кусты — карточки с альфа-каналом
  const bushGeo = new THREE.PlaneGeometry(2.4, 1.9);
  const bushMat = new THREE.MeshStandardMaterial({ map: foliageTex, alphaTest: 0.42, transparent: false, side: THREE.DoubleSide, roughness: 0.95, color: 0xa8b48c });
  const bushes = new THREE.InstancedMesh(bushGeo, bushMat, 500);
  let bc = 0;
  for (let i = 0; i < 2400 && bc < 500; i++) {
    const x = (hash2(i, 21.1) - 0.5) * (MAP_SIZE - 50);
    const z = (hash2(i, 27.4) - 0.5) * (MAP_SIZE - 50);
    let skip = false;
    for (const h of HUBS) if (Math.hypot(x - h.x, z - h.z) < h.r * 0.55) skip = true;
    if (Math.abs(x) < 9 || Math.abs(z) < 9) skip = true;
    if (skip) continue;
    const y = heightAt(x, z);
    dummy.position.set(x, y + 0.9, z);
    dummy.scale.setScalar(0.8 + hash2(i, 31) * 0.9);
    dummy.rotation.set(0, hash2(i, 33) * 6.28, 0);
    dummy.updateMatrix();
    bushes.setMatrixAt(bc, dummy.matrix);
    bc++;
  }
  bushes.count = bc;
  bushes.instanceMatrix.needsUpdate = true;
  scene.add(bushes);
  disposables.push(bushGeo, bushMat);
  // перекрестья для объёма
  const bush2 = bushes.clone();
  bush2.rotation.y = Math.PI / 2;
  scene.add(bush2);

  // ————————————————— трава (ветер в вершинном шейдере) —————————————————
  const grassBlade = makeBladeTexture();
  const grassGeo = new THREE.PlaneGeometry(0.55, 0.5, 1, 3);
  grassGeo.translate(0, 0.25, 0);
  const grassMat = new THREE.MeshStandardMaterial({
    map: grassBlade,
    alphaTest: 0.35,
    side: THREE.DoubleSide,
    color: 0x93a16a,
    roughness: 1,
  });
  const grassCount = quality === "high" ? 14000 : 5000;
  const grass = new THREE.InstancedMesh(grassGeo, grassMat, grassCount);
  let gc = 0;
  for (let i = 0; i < grassCount * 3 && gc < grassCount; i++) {
    const x = (hash2(i, 41.3) - 0.5) * (MAP_SIZE - 60);
    const z = (hash2(i, 47.9) - 0.5) * (MAP_SIZE - 60);
    if (Math.abs(x) < 8 && Math.abs(z) < 8) continue;
    let skip = false;
    for (const h of HUBS) if (Math.hypot(x - h.x, z - h.z) < h.r * 0.4) skip = true;
    if (skip) continue;
    const y = heightAt(x, z);
    dummy.position.set(x, y, z);
    dummy.scale.setScalar(0.7 + hash2(i, 51) * 1.3);
    dummy.rotation.set(0, hash2(i, 53) * 6.28, 0);
    dummy.updateMatrix();
    grass.setMatrixAt(gc, dummy.matrix);
    gc++;
  }
  grass.count = gc;
  grass.instanceMatrix.needsUpdate = true;
  scene.add(grass);
  disposables.push(grassGeo);
  const windUniform = { value: 0 };
  grassMat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = windUniform;
    shader.vertexShader = "uniform float uTime;\n" + shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace(
      "#include <begin_vertex>",
      `#include <begin_vertex>
       float sway = sin(uTime * 1.6 + instanceMatrix[3][0] * 0.35 + instanceMatrix[3][2] * 0.25) * 0.16;
       transformed.x += sway * uv.y * uv.y;`
    );
  };
  (grassMat as any).__wind = windUniform;

  // ————————————————— лужи —————————————————
  const puddleMat = new THREE.MeshStandardMaterial({ color: 0x2b3330, roughness: 0.06, metalness: 0.85, transparent: true, opacity: 0.9 });
  for (let i = 0; i < 70; i++) {
    const x = (hash2(i, 61.1) - 0.5) * (MAP_SIZE - 70);
    const z = (hash2(i, 67.7) - 0.5) * (MAP_SIZE - 70);
    const y = heightAt(x, z);
    const r = 1 + hash2(i, 71) * 3.4;
    const g = new THREE.CircleGeometry(r, 12);
    const p = new THREE.Mesh(g, puddleMat);
    p.rotation.x = -Math.PI / 2;
    p.position.set(x, y + 0.05, z);
    scene.add(p);
    water.push(p);
    disposables.push(g);
  }

  // ————————————————— небо —————————————————
  const skyGeo = new THREE.SphereGeometry(900, 32, 16);
  const skyMat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    uniforms: {
      top: { value: new THREE.Color(0x39423f) },
      horizon: { value: new THREE.Color(0x8f9683) },
      bottom: { value: new THREE.Color(0x1b1f1c) },
      sunDir: { value: new THREE.Vector3(0.4, 0.5, -0.6) },
      sunCol: { value: new THREE.Color(0xd9c9a0) },
    },
    vertexShader: `varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: `
      uniform vec3 top; uniform vec3 horizon; uniform vec3 bottom; uniform vec3 sunDir; uniform vec3 sunCol;
      varying vec3 vP;
      void main(){
        float h = vP.y;
        vec3 c = mix(horizon, top, clamp(h*1.6,0.0,1.0));
        c = mix(bottom, c, clamp((h+0.18)*3.0,0.0,1.0));
        float sd = max(0.0, dot(normalize(vP), normalize(sunDir)));
        c += sunCol * pow(sd, 48.0) * 0.7 + sunCol * pow(sd, 6.0) * 0.12;
        gl_FragColor = vec4(c,1.0);
      }`,
  });
  const sky = new THREE.Mesh(skyGeo, skyMat);
  scene.add(sky);
  disposables.push(skyGeo, skyMat);

  // ————————————————— свет —————————————————
  const hemi = new THREE.HemisphereLight(0xa8b3a0, 0x2a2a24, 0.75);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xffe6c4, 2.1);
  sun.position.set(70, 90, -50);
  sun.castShadow = true;
  sun.shadow.mapSize.set(quality === "high" ? 2048 : 1024, quality === "high" ? 2048 : 1024);
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far = 320;
  const S = 90;
  sun.shadow.camera.left = -S;
  sun.shadow.camera.right = S;
  sun.shadow.camera.top = S;
  sun.shadow.camera.bottom = -S;
  sun.shadow.bias = -0.0012;
  sun.shadow.normalBias = 0.04;
  scene.add(sun, sun.target);

  // ————————————————— осадки —————————————————
  const mkPrecip = (count: number, size: number, color: number, streak: boolean) => {
    const g = new THREE.BufferGeometry();
    const arr = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      arr[i * 3] = (Math.random() - 0.5) * 90;
      arr[i * 3 + 1] = Math.random() * 60;
      arr[i * 3 + 2] = (Math.random() - 0.5) * 90;
    }
    g.setAttribute("position", new THREE.BufferAttribute(arr, 3));
    const m = new THREE.PointsMaterial({
      color,
      size,
      transparent: true,
      opacity: streak ? 0.55 : 0.85,
      depthWrite: false,
      sizeAttenuation: true,
    });
    const pts = new THREE.Points(g, m);
    pts.visible = false;
    scene.add(pts);
    disposables.push(g, m);
    return pts;
  };
  const rain = mkPrecip(quality === "high" ? 5000 : 2000, 0.14, 0xa9bcc4, true);
  const snow = mkPrecip(quality === "high" ? 4000 : 1600, 0.3, 0xf2f4f0, false);

  // ————————————————— точки для ИИ и миникарты —————————————————
  for (let i = 0; i < 700; i++) {
    const x = (hash2(i, 81.1) - 0.5) * (MAP_SIZE - 50);
    const z = (hash2(i, 87.7) - 0.5) * (MAP_SIZE - 50);
    const y = heightAt(x, z);
    let blocked = false;
    for (const c of colliders) {
      if (x > c.min.x - 1 && x < c.max.x + 1 && z > c.min.z - 1 && z < c.max.z + 1) {
        blocked = true;
        break;
      }
    }
    if (!blocked) walkable.push(new THREE.Vector3(x, y, z));
  }
  for (let i = 0; i < 160; i++) {
    const c = covers[Math.floor(hash2(i, 91) * covers.length)];
    if (c) covers.push(c.clone());
  }

  // записки/дневники как лут
  for (let i = 0; i < 12; i++) {
    const w = walkable[Math.floor(hash2(i, 95) * walkable.length)];
    if (w) addLoot(w.x, w.y + 0.6, w.z, "body", 900 + i);
  }
  markers.push({ id: "sq3", kind: "quest", pos: new THREE.Vector3(-40, heightAt(-40, 90), 90), label: "Белый олень" });
  markers.push({ id: "sq4", kind: "quest", pos: new THREE.Vector3(12, heightAt(12, 84), 84), label: "Генератор плотины" });

  // ——————— сливаем статику: тысячи ящиков → десятки вызовов отрисовки ———————
  for (const w of water) w.userData.noMerge = true;
  mergeStatic(scene);

  const surfaceAt = (x: number, z: number): Surface => {
    if (Math.abs(x) < 7 || Math.abs(z) < 7) return "asphalt";
    for (const c of colliders) {
      if (x > c.min.x && x < c.max.x && z > c.min.z && z < c.max.z) return c.tag === "tree" ? "grass" : "concrete";
    }
    for (const w of water) {
      if (Math.abs(w.position.x - x) < 3 && Math.abs(w.position.z - z) < 3) return "water";
    }
    return "grass";
  };

  const indoorAt = (x: number, z: number) => {
    for (const s of mapShapes) {
      if (s.kind === "building" || s.kind === "poi") {
        if (Math.abs(x - s.x) < s.w / 2 && Math.abs(z - s.z) < s.d / 2) return true;
      }
    }
    return false;
  };

  return {
    colliders,
    loot,
    markers,
    walkable,
    covers,
    water,
    campfires,
    sun,
    hemi,
    sky,
    rain,
    snow,
    grassMat,
    mapShapes,
    heightAt,
    surfaceAt,
    indoorAt,
  };
}

/** Слияние статических мешей по материалу. Персонажи, лут и вода исключены. */
function mergeStatic(scene: THREE.Scene) {
  scene.updateMatrixWorld(true);
  const marked = (o: THREE.Object3D) => {
    let p: THREE.Object3D | null = o;
    while (p) {
      if (p.userData && p.userData.noMerge) return true;
      p = p.parent;
    }
    return false;
  };
  const groups = new Map<string, { mat: THREE.Material; meshes: THREE.Mesh[] }>();
  scene.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!(m as any).isMesh) return;
    if ((m as any).isInstancedMesh || (m as any).isSkinnedMesh) return;
    if (marked(m)) return;
    const mat = m.material as THREE.Material | THREE.Material[];
    if (!mat || Array.isArray(mat)) return;
    if ((m.geometry.attributes as any).color) return;
    const key = (mat as any).uuid;
    let g = groups.get(key);
    if (!g) {
      g = { mat, meshes: [] };
      groups.set(key, g);
    }
    g.meshes.push(m);
  });

  for (const { mat, meshes } of groups.values()) {
    if (meshes.length < 2) continue;
    const geos: THREE.BufferGeometry[] = [];
    let ok = true;
    for (const m of meshes) {
      const g2 = m.geometry.clone();
      g2.applyMatrix4(m.matrixWorld);
      geos.push(g2);
    }
    const merged = mergeGeometries(geos, false);
    for (const g2 of geos) g2.dispose();
    if (!merged) {
      ok = false;
    }
    if (!ok) continue;
    const mesh = new THREE.Mesh(merged!, mat);
    mesh.castShadow = meshes.some((m) => m.castShadow);
    mesh.receiveShadow = meshes.some((m) => m.receiveShadow);
    mesh.userData.noMerge = true;
    scene.add(mesh);
    for (const m of meshes) m.parent?.remove(m);
  }
}

function makeBladeTexture(): THREE.Texture {
  const c = document.createElement("canvas");
  c.width = 64;
  c.height = 64;
  const g = c.getContext("2d")!;
  g.clearRect(0, 0, 64, 64);
  for (let i = 0; i < 14; i++) {
    const x = 4 + Math.random() * 56;
    const w = 2 + Math.random() * 3;
    const h = 26 + Math.random() * 34;
    const bend = (Math.random() - 0.5) * 14;
    const grad = g.createLinearGradient(0, 64, 0, 64 - h);
    grad.addColorStop(0, "#3f4a2c");
    grad.addColorStop(1, "#8fa066");
    g.fillStyle = grad;
    g.beginPath();
    g.moveTo(x, 64);
    g.quadraticCurveTo(x + bend, 64 - h * 0.6, x + bend * 1.4, 64 - h);
    g.lineTo(x + w + bend * 1.4, 64 - h);
    g.quadraticCurveTo(x + w + bend, 64 - h * 0.6, x + w, 64);
    g.closePath();
    g.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
