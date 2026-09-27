/**
 * Процедурные PBR-текстуры. Без внешних файлов: кирпич, ржавчина, дерево,
 * штукатурка, грибница, карта окружения — всё рисуется в canvas.
 */
import * as THREE from "three";

function canvas(size = 512) {
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const g = c.getContext("2d", { willReadFrequently: false })!;
  return { c, g, size };
}

function noise(g: CanvasRenderingContext2D, size: number, alpha = 0.12, scale = 1) {
  const img = g.getImageData(0, 0, size, size);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const n = (Math.random() - 0.5) * 255 * alpha * scale;
    d[i] = Math.max(0, Math.min(255, d[i] + n));
    d[i + 1] = Math.max(0, Math.min(255, d[i + 1] + n));
    d[i + 2] = Math.max(0, Math.min(255, d[i + 2] + n));
  }
  g.putImageData(img, 0, 0);
}

function tex(c: HTMLCanvasElement, repeat = 4): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat, repeat);
  t.anisotropy = 4;
  t.needsUpdate = true;
  return t;
}

export function makeBrick(size = 512): THREE.CanvasTexture {
  const { c, g } = canvas(size);
  g.fillStyle = "#6a5a4c";
  g.fillRect(0, 0, size, size);
  const bh = 28,
    bw = 62,
    mort = 5;
  for (let y = 0, row = 0; y < size + bh; y += bh + mort, row++) {
    const off = row % 2 ? bw / 2 : 0;
    for (let x = -bw; x < size + bw; x += bw + mort) {
      const shade = 90 + Math.random() * 50;
      const r = shade + 30 + Math.random() * 25;
      const gr = shade - 10;
      const b = shade - 25;
      g.fillStyle = `rgb(${r | 0},${gr | 0},${b | 0})`;
      g.fillRect(x + off, y, bw, bh);
      if (Math.random() < 0.12) {
        g.fillStyle = "rgba(124,138,90,0.35)";
        g.fillRect(x + off + 4, y + 8, 18, 10);
      }
    }
  }
  g.fillStyle = "rgba(14,18,16,0.18)";
  for (let i = 0; i < 40; i++) {
    g.fillRect(Math.random() * size, Math.random() * size, 40 + Math.random() * 80, 3);
  }
  noise(g, size, 0.16);
  return tex(c, 3);
}

export function makeRust(size = 512): THREE.CanvasTexture {
  const { c, g } = canvas(size);
  g.fillStyle = "#3a322c";
  g.fillRect(0, 0, size, size);
  for (let i = 0; i < 80; i++) {
    const x = Math.random() * size,
      y = Math.random() * size;
    const r = 20 + Math.random() * 90;
    const grd = g.createRadialGradient(x, y, 0, x, y, r);
    grd.addColorStop(0, `rgba(${140 + Math.random() * 80 | 0},${50 + Math.random() * 30 | 0},30,0.85)`);
    grd.addColorStop(1, "rgba(40,30,24,0)");
    g.fillStyle = grd;
    g.beginPath();
    g.arc(x, y, r, 0, Math.PI * 2);
    g.fill();
  }
  g.strokeStyle = "rgba(20,18,16,0.4)";
  g.lineWidth = 3;
  for (let i = 0; i < 8; i++) {
    g.beginPath();
    g.moveTo(0, i * 64 + 10);
    g.lineTo(size, i * 64 + 10);
    g.stroke();
  }
  noise(g, size, 0.2);
  return tex(c, 2);
}

export function makeWood(size = 512): THREE.CanvasTexture {
  const { c, g } = canvas(size);
  const plank = 64;
  for (let y = 0; y < size; y += plank) {
    const base = 70 + Math.random() * 30;
    g.fillStyle = `rgb(${base + 20 | 0},${base | 0},${base - 20 | 0})`;
    g.fillRect(0, y, size, plank - 2);
    g.fillStyle = "rgba(20,16,12,0.35)";
    g.fillRect(0, y + plank - 2, size, 2);
    g.strokeStyle = "rgba(30,22,16,0.25)";
    for (let i = 0; i < 18; i++) {
      g.beginPath();
      const yy = y + 6 + Math.random() * (plank - 12);
      g.moveTo(0, yy);
      g.bezierCurveTo(size * 0.3, yy + (Math.random() - 0.5) * 8, size * 0.7, yy + (Math.random() - 0.5) * 8, size, yy);
      g.stroke();
    }
  }
  noise(g, size, 0.12);
  return tex(c, 2);
}

export function makePlaster(size = 512): THREE.CanvasTexture {
  const { c, g } = canvas(size);
  g.fillStyle = "#cfc6b4";
  g.fillRect(0, 0, size, size);
  g.fillStyle = "rgba(90,90,80,0.15)";
  for (let i = 0; i < 12; i++) {
    g.beginPath();
    g.ellipse(Math.random() * size, Math.random() * size, 40 + Math.random() * 80, 20 + Math.random() * 40, Math.random(), 0, Math.PI * 2);
    g.fill();
  }
  g.strokeStyle = "rgba(40,40,36,0.35)";
  g.lineWidth = 1;
  for (let i = 0; i < 9; i++) {
    g.beginPath();
    g.moveTo(Math.random() * size, 0);
    g.lineTo(Math.random() * size, size);
    g.stroke();
  }
  noise(g, size, 0.1);
  return tex(c, 2);
}

export function makeFungus(size = 512): THREE.CanvasTexture {
  const { c, g } = canvas(size);
  g.fillStyle = "#c4b089";
  g.fillRect(0, 0, size, size);
  for (let i = 0; i < 50; i++) {
    const x = Math.random() * size,
      y = Math.random() * size;
    const r = 12 + Math.random() * 50;
    const grd = g.createRadialGradient(x - r * 0.2, y - r * 0.2, 2, x, y, r);
    grd.addColorStop(0, "#e8d9b0");
    grd.addColorStop(0.5, "#b07a42");
    grd.addColorStop(1, "#5a4030");
    g.fillStyle = grd;
    g.beginPath();
    g.ellipse(x, y, r, r * 0.7, Math.random(), 0, Math.PI * 2);
    g.fill();
  }
  noise(g, size, 0.18);
  return tex(c, 1);
}

/** Equirectangular небо — для IBL. */
export function makeEnvMap(): THREE.CanvasTexture {
  const w = 1024,
    h = 512;
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const g = c.getContext("2d")!;
  const grd = g.createLinearGradient(0, 0, 0, h);
  grd.addColorStop(0, "#6a7368");
  grd.addColorStop(0.42, "#9aa090");
  grd.addColorStop(0.52, "#8a8676");
  grd.addColorStop(1, "#2a2e28");
  g.fillStyle = grd;
  g.fillRect(0, 0, w, h);
  // облака
  g.fillStyle = "rgba(232,226,211,0.18)";
  for (let i = 0; i < 40; i++) {
    g.beginPath();
    g.ellipse(Math.random() * w, Math.random() * h * 0.45, 80 + Math.random() * 160, 18 + Math.random() * 28, 0, 0, Math.PI * 2);
    g.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.mapping = THREE.EquirectangularReflectionMapping;
  t.needsUpdate = true;
  return t;
}

export function makeRoughness(size = 256, mean = 0.85): THREE.CanvasTexture {
  const { c, g } = canvas(size);
  const img = g.createImageData(size, size);
  for (let i = 0; i < img.data.length; i += 4) {
    const v = Math.max(0, Math.min(255, (mean + (Math.random() - 0.5) * 0.35) * 255));
    img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
    img.data[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(4, 4);
  return t;
}
