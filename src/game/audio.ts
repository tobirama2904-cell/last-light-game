/**
 * LAST LIGHT — процедурный звуковой движок.
 * Никаких внешних файлов: весь саундтрек, эмбиент и SFX синтезируются в WebAudio,
 * поэтому сборка остаётся автономной, а музыка адаптируется к игровой ситуации в реальном времени.
 */

type tension = number; // 0..1

export class AudioEngine {
  ctx: AudioContext | null = null;
  private master!: GainNode;
  private musicBus!: GainNode;
  private sfxBus!: GainNode;
  private ambBus!: GainNode;
  private verb!: ConvolverNode;
  private verbSend!: GainNode;
  private noiseBuf!: AudioBuffer;

  private rainGain: GainNode | null = null;
  private windGain: GainNode | null = null;
  private heartGain: GainNode | null = null;

  private step = 0;
  private nextTime = 0;
  private timer: number | null = null;
  private tension: tension = 0;
  private calm = 1;
  private combat = 0;

  private lastSpeak = 0;
  private echoFilter: BiquadFilterNode | null = null;
  muted = false;
  started = false;

  /** режим эхолокации: низкочастотный срез + подчёркнутое сердце */
  setEcho(on: boolean) {
    if (!this.ctx || !this.echoFilter) return;
    const t = this.ctx.currentTime;
    this.echoFilter.frequency.setTargetAtTime(on ? 380 : 20000, t, 0.25);
    this.musicBus.gain.setTargetAtTime(on ? 0.12 : 0.55, t, 0.4);
    this.ambBus.gain.setTargetAtTime(on ? 0.25 : 0.7, t, 0.4);
  }

  async ensure() {
    if (this.ctx) {
      if (this.ctx.state === "suspended") await this.ctx.resume();
      return this.ctx;
    }
    const Ctor: typeof AudioContext =
      (window as any).AudioContext || (window as any).webkitAudioContext;
    const ctx = new Ctor();
    this.ctx = ctx;

    this.master = ctx.createGain();
    this.master.gain.value = 0.9;
    // фильтр «эхолокации»: мир схлопывается до сердца и щелчков
    this.echoFilter = ctx.createBiquadFilter();
    this.echoFilter.type = "lowpass";
    this.echoFilter.frequency.value = 20000;
    this.echoFilter.Q.value = 0.7;
    this.master.connect(this.echoFilter);
    this.echoFilter.connect(ctx.destination);

    this.musicBus = ctx.createGain();
    this.musicBus.gain.value = 0.55;
    this.musicBus.connect(this.master);

    this.sfxBus = ctx.createGain();
    this.sfxBus.gain.value = 0.95;
    this.sfxBus.connect(this.master);

    this.ambBus = ctx.createGain();
    this.ambBus.gain.value = 0.7;
    this.ambBus.connect(this.master);

    // импульсная характеристика для общей "влажной" сцены
    const len = Math.floor(ctx.sampleRate * 2.4);
    const imp = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = imp.getChannelData(c);
      for (let i = 0; i < len; i++) {
        const t = i / len;
        d[i] = (Math.random() * 2 - 1) * Math.pow(1 - t, 2.6) * (i < 600 ? i / 600 : 1);
      }
    }
    this.verb = ctx.createConvolver();
    this.verb.buffer = imp;
    this.verbSend = ctx.createGain();
    this.verbSend.gain.value = 0.32;
    this.verbSend.connect(this.verb);
    this.verb.connect(this.master);

    const nlen = Math.floor(ctx.sampleRate * 2);
    const nb = ctx.createBuffer(1, nlen, ctx.sampleRate);
    const nd = nb.getChannelData(0);
    let last = 0;
    for (let i = 0; i < nlen; i++) {
      const w = Math.random() * 2 - 1;
      last = (last + 0.02 * w) / 1.02;
      nd[i] = last * 3.2;
    }
    this.noiseBuf = nb;

    this.buildAmbience();
    this.startSequencer();
    this.started = true;
    return ctx;
  }

  setMuted(v: boolean) {
    this.muted = v;
    if (this.master) this.master.gain.value = v ? 0 : 0.9;
    if (v && "speechSynthesis" in window) window.speechSynthesis.cancel();
  }

  /** положение слушателя (камеры) */
  listener(px: number, py: number, pz: number, fx: number, fy: number, fz: number) {
    const ctx = this.ctx;
    if (!ctx) return;
    const L = ctx.listener as any;
    if (L.positionX) {
      const t = ctx.currentTime;
      L.positionX.setTargetAtTime(px, t, 0.05);
      L.positionY.setTargetAtTime(py, t, 0.05);
      L.positionZ.setTargetAtTime(pz, t, 0.05);
      L.forwardX.setTargetAtTime(fx, t, 0.05);
      L.forwardY.setTargetAtTime(fy, t, 0.05);
      L.forwardZ.setTargetAtTime(fz, t, 0.05);
      L.upX.setTargetAtTime(0, t, 0.05);
      L.upY.setTargetAtTime(1, t, 0.05);
      L.upZ.setTargetAtTime(0, t, 0.05);
    } else if ((L as any).setPosition) {
      (L as any).setPosition(px, py, pz);
      (L as any).setOrientation(fx, fy, fz, 0, 1, 0);
    }
  }

  /** позиционный узел для 3D-звуков */
  private panner(x: number, y: number, z: number, ref = 12) {
    const ctx = this.ctx!;
    const p = ctx.createPanner();
    p.panningModel = "equalpower";
    p.distanceModel = "inverse";
    p.refDistance = ref;
    p.maxDistance = 260;
    p.rolloffFactor = 1;
    if ((p as any).positionX) {
      (p as any).positionX.value = x;
      (p as any).positionY.value = y;
      (p as any).positionZ.value = z;
    } else {
      (p as any).setPosition(x, y, z);
    }
    return p;
  }

  private noise(dur: number, gain: number, type: BiquadFilterType, freq: number, q = 1, dest?: AudioNode) {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    src.loop = true;
    src.playbackRate.value = 0.6 + Math.random() * 0.8;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    const g = ctx.createGain();
    const t = ctx.currentTime;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, gain), t + Math.min(0.02, dur * 0.3));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(dest ?? this.sfxBus);
    src.start(t, Math.random() * 1.5);
    src.stop(t + dur + 0.05);
    return g;
  }

  private tone(
    freq: number,
    dur: number,
    gain: number,
    type: OscillatorType = "sine",
    bend = 1,
    dest?: AudioNode,
    pannerNode?: AudioNode
  ) {
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    o.type = type;
    const g = ctx.createGain();
    const t = ctx.currentTime;
    o.frequency.setValueAtTime(freq, t);
    if (bend !== 1) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq * bend), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, gain), t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g);
    g.connect(pannerNode ?? dest ?? this.sfxBus);
    if (!pannerNode) g.connect(this.verbSend);
    o.start(t);
    o.stop(t + dur + 0.05);
    return g;
  }

  // ————————————————————————— АМБИЕНТ —————————————————————————
  private buildAmbience() {
    const ctx = this.ctx!;
    // ветер
    const w = ctx.createBufferSource();
    w.buffer = this.noiseBuf;
    w.loop = true;
    const wf = ctx.createBiquadFilter();
    wf.type = "bandpass";
    wf.frequency.value = 420;
    wf.Q.value = 0.6;
    this.windGain = ctx.createGain();
    this.windGain.gain.value = 0.16;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.07;
    const lfoG = ctx.createGain();
    lfoG.gain.value = 220;
    lfo.connect(lfoG).connect(wf.frequency);
    w.connect(wf).connect(this.windGain).connect(this.ambBus);
    w.start();
    lfo.start();

    // дождь
    const r = ctx.createBufferSource();
    r.buffer = this.noiseBuf;
    r.loop = true;
    r.playbackRate.value = 1.7;
    const rf = ctx.createBiquadFilter();
    rf.type = "highpass";
    rf.frequency.value = 1400;
    this.rainGain = ctx.createGain();
    this.rainGain.gain.value = 0;
    r.connect(rf).connect(this.rainGain).connect(this.ambBus);
    r.start();

    // сердцебиение (напряжение/адреналин)
    this.heartGain = ctx.createGain();
    this.heartGain.gain.value = 0;
    this.heartGain.connect(this.master);
  }

  setWeather(rain: number, wind = 0.5) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.rainGain?.gain.setTargetAtTime(rain * 0.34, t, 1.2);
    this.windGain?.gain.setTargetAtTime(0.07 + wind * 0.2, t, 1.5);
  }

  heartbeat(intensity: number) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.heartGain!.gain.setTargetAtTime(intensity * 0.5, t, 0.4);
    if (intensity > 0.05 && (!this._hb || t > this._hb)) {
      this.tone(52, 0.18, 0.5 * intensity, "sine", 0.55);
      window.setTimeout(() => this.tone(46, 0.16, 0.36 * intensity, "sine", 0.6), 190);
      this._hb = t + 0.85 - intensity * 0.3;
    }
  }
  private _hb = 0;

  // ————————————————————————— SFX —————————————————————————
  shot(kind: string, x: number, y: number, z: number) {
    if (!this.ctx) return;
    const p = this.panner(x, y, z, 14);
    p.connect(this.sfxBus);
    const heavy = kind === "rifle" || kind === "shotgun" || kind === "sniper";
    this.noise(heavy ? 0.34 : 0.18, heavy ? 1.4 : 0.9, "lowpass", heavy ? 1800 : 3200, 0.8, p);
    this.tone(heavy ? 90 : 160, heavy ? 0.3 : 0.14, 0.7, "square", 0.35, undefined, p);
    const tail = ctxDelay(this.ctx, p, kind === "sniper" ? 0.7 : 0.35);
    void tail;
  }

  reload(kind: string) {
    if (!this.ctx) return;
    this.noise(0.07, 0.4, "bandpass", 2600, 3);
    window.setTimeout(() => this.tone(420, 0.05, 0.25, "square", 1.6), 180);
    window.setTimeout(() => this.noise(0.05, 0.35, "highpass", 3800), kind === "pump" ? 520 : 380);
  }

  meleeHit(flesh: boolean) {
    if (!this.ctx) return;
    if (flesh) {
      this.noise(0.16, 0.8, "lowpass", 700, 1.2);
      this.tone(70, 0.2, 0.5, "sine", 0.5);
    } else {
      this.noise(0.1, 0.6, "bandpass", 1500, 2);
      this.tone(320, 0.12, 0.3, "square", 0.4);
    }
  }

  footstep(surface: "grass" | "concrete" | "wood" | "glass" | "water" | "metal" | "asphalt", volume = 0.4) {
    if (!this.ctx) return;
    const map: Record<string, [BiquadFilterType, number, number]> = {
      grass: ["bandpass", 900, 0.7],
      concrete: ["lowpass", 2400, 0.8],
      asphalt: ["lowpass", 2200, 0.8],
      wood: ["bandpass", 500, 1.4],
      glass: ["highpass", 5200, 1],
      water: ["bandpass", 1200, 0.5],
      metal: ["bandpass", 2200, 3],
    };
    const [t, f, q] = map[surface] ?? map.concrete;
    this.noise(surface === "glass" ? 0.14 : 0.09, volume, t, f, q);
    if (surface === "glass") this.tone(3100, 0.09, 0.18, "triangle", 1.7);
  }

  clicker(x: number, y: number, z: number) {
    if (!this.ctx) return;
    const p = this.panner(x, y, z, 9);
    p.connect(this.sfxBus);
    const n = 3 + Math.floor(Math.random() * 4);
    for (let i = 0; i < n; i++) {
      window.setTimeout(() => this.tone(900 + Math.random() * 1400, 0.045, 0.4, "square", 0.6, undefined, p), i * 70);
    }
  }

  growl(x: number, y: number, z: number, big = false) {
    if (!this.ctx) return;
    const p = this.panner(x, y, z, 12);
    p.connect(this.sfxBus);
    this.tone(big ? 62 : 96, big ? 1.1 : 0.7, 0.55, "sawtooth", 0.6, undefined, p);
    this.noise(big ? 1.0 : 0.6, 0.3, "lowpass", 500, 1, p);
  }

  humanVoice(x: number, y: number, z: number, kind: "shout" | "pain" | "alert" | "talk") {
    if (!this.ctx) return;
    const p = this.panner(x, y, z, 14);
    p.connect(this.sfxBus);
    if (kind === "pain") {
      this.tone(220, 0.35, 0.4, "sawtooth", 0.5, undefined, p);
    } else if (kind === "alert") {
      this.tone(330, 0.28, 0.45, "square", 0.9, undefined, p);
      this.noise(0.3, 0.35, "bandpass", 1400, 2, p);
    } else {
      this.tone(180, 0.5, 0.28, "sawtooth", 1.2, undefined, p);
    }
  }

  craft() {
    if (!this.ctx) return;
    this.noise(0.12, 0.3, "bandpass", 1800, 2);
    window.setTimeout(() => this.tone(660, 0.14, 0.22, "triangle", 1.4), 120);
  }

  pickup() {
    if (!this.ctx) return;
    this.tone(520, 0.1, 0.2, "triangle", 1.5);
    window.setTimeout(() => this.tone(780, 0.12, 0.16, "triangle", 1.3), 80);
  }

  hurt() {
    if (!this.ctx) return;
    this.noise(0.3, 0.6, "lowpass", 900, 1);
    this.tone(120, 0.4, 0.4, "sawtooth", 0.5);
  }

  /** птицы утром, вороны днём — живой мир */
  bird() {
    if (!this.ctx || this.muted) return;
    const base = 1700 + Math.random() * 1600;
    const n = 2 + Math.floor(Math.random() * 4);
    for (let i = 0; i < n; i++) {
      window.setTimeout(() => this.tone(base * (1 + (i % 2) * 0.18), 0.07, 0.075, "sine", 1.25), i * (70 + Math.random() * 60));
    }
  }

  /** волки вдалеке ночью */
  wolfHowl() {
    if (!this.ctx || this.muted) return;
    const p = this.panner((Math.random() - 0.5) * 200, 4, (Math.random() - 0.5) * 200, 60);
    p.connect(this.sfxBus);
    this.tone(210, 2.6, 0.16, "sawtooth", 1.7, undefined, p);
    window.setTimeout(() => this.tone(190, 3.2, 0.12, "sawtooth", 1.5, undefined, p), 900);
  }

  /** ворона — предупреждает, что вас заметили */
  crow() {
    if (!this.ctx || this.muted) return;
    for (let i = 0; i < 3; i++) window.setTimeout(() => this.tone(620 - i * 60, 0.16, 0.16, "sawtooth", 0.7), i * 190);
  }

  thunder() {
    if (!this.ctx) return;
    this.noise(2.4, 0.85, "lowpass", 240, 0.8);
    window.setTimeout(() => this.noise(1.6, 0.5, "lowpass", 160, 0.7), 320);
  }

  fire() {
    if (!this.ctx) return;
    this.noise(0.5, 0.24, "bandpass", 700, 0.6);
  }

  radio(x: number, y: number, z: number, on: boolean) {
    if (!this.ctx) return;
    if (!on) return;
    const p = this.panner(x, y, z, 16);
    p.connect(this.sfxBus);
    for (let i = 0; i < 5; i++) {
      window.setTimeout(() => this.tone(300 + i * 90, 0.16, 0.12, "square", 1, undefined, p), i * 130);
    }
  }

  ui(kind: "hover" | "select" | "back") {
    if (!this.ctx) return;
    if (kind === "hover") this.tone(880, 0.05, 0.09, "square", 1);
    if (kind === "select") this.tone(440, 0.12, 0.16, "square", 1.5);
    if (kind === "back") this.tone(330, 0.1, 0.13, "square", 0.7);
  }

  // ————————————————————————— АДАПТИВНАЯ МУЗЫКА —————————————————————————
  setTension(v: tension, combat: number, calm: number) {
    this.tension = Math.max(0, Math.min(1, v));
    this.combat = Math.max(0, Math.min(1, combat));
    this.calm = Math.max(0, Math.min(1, calm));
    if (this.ctx) this.musicBus.gain.setTargetAtTime(0.4 + this.tension * 0.3, this.ctx.currentTime, 1.5);
  }

  private scale = [0, 3, 5, 7, 10, 12];
  private root = 110; // A2

  private startSequencer() {
    const ctx = this.ctx!;
    this.nextTime = ctx.currentTime + 0.15;
    this.timer = window.setInterval(() => this.tick(), 40);
  }

  private tick() {
    const ctx = this.ctx;
    if (!ctx) return;
    const bpm = 62 + this.combat * 34;
    const spb = 60 / bpm / 2; // восьмые
    while (this.nextTime < ctx.currentTime + 0.35) {
      this.schedule(this.step, this.nextTime, spb);
      this.step++;
      this.nextTime += spb;
    }
  }

  private schedule(step: number, time: number, spb: number) {
    const ctx = this.ctx!;
    const beat = step % 16;
    const bar = Math.floor(step / 16);

    // — дрон / пэд (всегда, громкость от "спокойствия")
    if (beat === 0) {
      const padGain = 0.045 + (1 - this.tension) * 0.05;
      const chord = [0, 7, 12, this.calm > 0.5 ? 15 : 10];
      for (let i = 0; i < chord.length; i++) {
        const f = this.root * Math.pow(2, chord[i] / 12) * (i === 0 ? 0.5 : 1);
        const o = ctx.createOscillator();
        o.type = i === 0 ? "sine" : "triangle";
        o.frequency.value = f * (1 + (i - 1.5) * 0.002);
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.0001, time);
        g.gain.linearRampToValueAtTime(padGain / chord.length, time + 1.2);
        g.gain.linearRampToValueAtTime(0.0001, time + 4.2);
        const f2 = ctx.createBiquadFilter();
        f2.type = "lowpass";
        f2.frequency.value = 700 + this.tension * 1400;
        o.connect(f2).connect(g).connect(this.musicBus);
        g.connect(this.verbSend);
        o.start(time);
        o.stop(time + 4.4);
      }
    }

    // — меланхоличная мелодия (только в тишине / сюжете)
    if (this.calm > 0.45 && (beat === 3 || beat === 11)) {
      const n = this.scale[(bar * 3 + beat) % this.scale.length];
      const f = this.root * 2 * Math.pow(2, n / 12);
      this.pluck(f, time, 0.13);
      this.pluck(f * 1.5, time + spb * 0.5, 0.06);
    }

    // — напряжение: низкие пульсы
    if (this.tension > 0.2 && beat % 4 === 0) {
      const o = ctx.createOscillator();
      o.type = "sine";
      o.frequency.setValueAtTime(72, time);
      o.frequency.exponentialRampToValueAtTime(44, time + 0.5);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, time);
      g.gain.exponentialRampToValueAtTime(0.16 * this.tension, time + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, time + 0.55);
      o.connect(g).connect(this.musicBus);
      o.start(time);
      o.stop(time + 0.6);
    }

    // — бой: ритм и струнные
    if (this.combat > 0.25) {
      if (beat % 4 === 0) this.drum(time, "kick", 0.5 * this.combat);
      if (beat % 8 === 4) this.drum(time, "snare", 0.3 * this.combat);
      if (beat % 2 === 0) this.drum(time, "hat", 0.12 * this.combat);
      if (beat === 0 || beat === 6 || beat === 10) {
        const n = this.scale[(bar + beat) % this.scale.length];
        const f = this.root * Math.pow(2, n / 12);
        const o = ctx.createOscillator();
        o.type = "sawtooth";
        o.frequency.setValueAtTime(f, time);
        o.frequency.linearRampToValueAtTime(f * 1.02, time + spb * 2);
        const g = ctx.createGain();
        const fl = ctx.createBiquadFilter();
        fl.type = "lowpass";
        fl.frequency.value = 900 + this.combat * 2200;
        g.gain.setValueAtTime(0.0001, time);
        g.gain.exponentialRampToValueAtTime(0.09 * this.combat, time + 0.03);
        g.gain.exponentialRampToValueAtTime(0.0001, time + spb * 3);
        o.connect(fl).connect(g).connect(this.musicBus);
        g.connect(this.verbSend);
        o.start(time);
        o.stop(time + spb * 3.2);
      }
    }
  }

  private pluck(f: number, time: number, gain: number) {
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    o.type = "triangle";
    o.frequency.value = f;
    const o2 = ctx.createOscillator();
    o2.type = "sine";
    o2.frequency.value = f * 2;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, time);
    g.gain.exponentialRampToValueAtTime(gain, time + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, time + 1.6);
    const g2 = ctx.createGain();
    g2.gain.value = 0.35;
    o.connect(g);
    o2.connect(g2).connect(g);
    g.connect(this.musicBus);
    g.connect(this.verbSend);
    o.start(time);
    o2.start(time);
    o.stop(time + 1.7);
    o2.stop(time + 1.7);
  }

  private drum(time: number, kind: "kick" | "snare" | "hat", gain: number) {
    const ctx = this.ctx!;
    if (kind === "kick") {
      const o = ctx.createOscillator();
      o.frequency.setValueAtTime(130, time);
      o.frequency.exponentialRampToValueAtTime(42, time + 0.14);
      const g = ctx.createGain();
      g.gain.setValueAtTime(gain, time);
      g.gain.exponentialRampToValueAtTime(0.0001, time + 0.3);
      o.connect(g).connect(this.musicBus);
      o.start(time);
      o.stop(time + 0.32);
    } else {
      const src = ctx.createBufferSource();
      src.buffer = this.noiseBuf;
      const f = ctx.createBiquadFilter();
      f.type = kind === "snare" ? "bandpass" : "highpass";
      f.frequency.value = kind === "hat" ? 7000 : 1900;
      const g = ctx.createGain();
      g.gain.setValueAtTime(gain, time);
      g.gain.exponentialRampToValueAtTime(0.0001, time + (kind === "snare" ? 0.22 : 0.06));
      src.connect(f).connect(g).connect(this.musicBus);
      src.start(time, Math.random());
      src.stop(time + 0.3);
    }
  }

  // ————————————————————————— РЕЧЬ —————————————————————————
  speak(text: string, pitch = 1, rate = 1, volume = 1) {
    if (this.muted) return;
    if (!("speechSynthesis" in window)) return;
    const now = performance.now();
    if (now - this.lastSpeak < 120) return;
    this.lastSpeak = now;
    try {
      const u = new SpeechSynthesisUtterance(text.replace(/[«»]/g, ""));
      const voices = window.speechSynthesis.getVoices();
      const en = voices.filter((v) => v.lang.startsWith("en"));
      const pick =
        en.find((v) => /male|david|alex|fred|george/i.test(v.name)) ||
        en.find((v) => /Google US English|Samantha|Karen/i.test(v.name)) ||
        en[0];
      if (pick) u.voice = pick;
      u.lang = "en-US";
      u.pitch = pitch;
      u.rate = rate;
      u.volume = Math.max(0, Math.min(1, volume));
      window.speechSynthesis.speak(u);
    } catch {
      /* голос недоступен — субтитры остаются */
    }
  }

  stopSpeech() {
    if ("speechSynthesis" in window) window.speechSynthesis.cancel();
  }

  stop() {
    if (this.timer) window.clearInterval(this.timer);
    this.timer = null;
    this.stopSpeech();
    if (this.ctx) {
      this.ctx.close();
      this.ctx = null;
      this.started = false;
    }
  }
}

function ctxDelay(_ctx: AudioContext, dest: AudioNode, time: number) {
  void time;
  void dest;
  return null;
}

export const audio = new AudioEngine();
