/**
 * Advanced AI layer (optional, runs on top of the fast COCO-SSD detector):
 *  - Depth: Depth-Anything-small (Transformers.js) -> metric distances calibrated from objects of known size,
 *           plus detection of unlabeled obstacles / walls directly ahead.
 *  - Hazards: OWL-ViT open-vocabulary detector for indoor hazards COCO does not know
 *           (stairs, glass doors, wet-floor signs, cables, elevators, pillars, fire extinguishers).
 * Models download once from the CDN / Hugging Face and are cached by the WebView.
 */
(function () {
  const LIB_URL = "https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.5.1";
  const LABELS = ["staircase", "step", "door", "glass door", "wet floor sign", "cable on the floor", "elevator", "fire extinguisher", "pillar"];
  const RAW = { "staircase": "stairs", "step": "step", "door": "door", "glass door": "glass door", "wet floor sign": "wet floor",
                "cable on the floor": "cable", "elevator": "elevator", "fire extinguisher": "fire extinguisher", "pillar": "pillar" };
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const median = (a) => { if (!a.length) return null; const s = a.slice().sort((x, y) => x - y); return s[s.length >> 1]; };
  const round1 = (x) => Math.round(x * 10) / 10;

  class AdvancedAI {
    constructor() {
      this.enabled = localStorage.getItem("smartnav_adv") !== "0";
      this.v = null; this.running = false; this.token = 0; this.fails = 0;
      this._lib = null; this.depthPipe = null; this.hazPipe = null;
      this.depth = null; this.cal = null; this.samples = [];
      this.hazards = []; this.obsCount = 0; this.obsDet = null;
      this.lastDepth = 0; this.lastHaz = 0;
      this._c = document.createElement("canvas"); this._c.width = 320; this._c.height = 240;
    }

    setStatus(text, kind) {
      const el = document.getElementById("adv-status");
      if (el) { el.textContent = text; el.dataset.kind = kind || "info"; el.style.display = text ? "" : "none"; }
    }

    lib() {
      if (!this._lib) {
        this._lib = import(LIB_URL).then(m => {
          m.env.allowLocalModels = false;
          try { m.env.backends.onnx.wasm.proxy = true; } catch (e) { /* optional */ }
          return m;
        }).catch(e => { this._lib = null; throw e; });
      }
      return this._lib;
    }

    async loadPipe(task, model, name) {
      const m = await this.lib();
      return m.pipeline(task, model, {
        progress_callback: (p) => {
          if (p && p.status === "progress" && typeof p.progress === "number") {
            this.setStatus(`Downloading ${name} ${Math.round(p.progress)}%`, "loading");
          }
        }
      });
    }

    setEnabled(on) {
      this.enabled = !!on;
      localStorage.setItem("smartnav_adv", on ? "1" : "0");
      if (!on) { this.stop(); this.setStatus("", "info"); }
      else if (this.v && this.v.running) { this.fails = 0; this.start(this.v); }
    }

    stop() {
      this.running = false; this.token++;
      this.hazards = []; this.depth = null; this.obsDet = null; this.obsCount = 0;
    }

    async start(vision) {
      this.v = vision;
      if (!this.enabled || this.running) return;
      this.running = true;
      const tok = ++this.token;
      this.setStatus("Advanced AI starting…", "loading");
      while (this.running && tok === this.token && this.enabled) {
        try { await this.step(); this.fails = 0; }
        catch (e) {
          console.warn("Advanced AI error", e);
          this.fails++;
          if (this.fails >= 3) {
            this.setStatus("Advanced AI unavailable (needs internet once)", "warn");
            this.running = false;
            return;
          }
          await sleep(3000);
        }
        await sleep(300);
      }
    }

    async step() {
      const v = this.v;
      if (!v || v.simulatedObstacleMode || !v.isStreaming || v.videoElement.readyState < 2) return;
      const now = Date.now();
      if (!this.depthPipe) this.depthPipe = await this.loadPipe("depth-estimation", "Xenova/depth-anything-small-hf", "depth AI");
      if (now - this.lastHaz > 6000 && this.depth) {
        if (!this.hazPipe) this.hazPipe = await this.loadPipe("zero-shot-object-detection", "Xenova/owlvit-base-patch32", "hazard AI");
        await this.runHazards();
        this.lastHaz = Date.now();
        this.setStatus("Advanced AI • depth + hazards", "ok");
      } else if (now - this.lastDepth > 1500) {
        await this.runDepth();
        this.lastDepth = Date.now();
        if (!this.hazPipe) this.setStatus("Advanced AI • depth", "ok");
      }
    }

    frame() {
      this._c.getContext("2d").drawImage(this.v.videoElement, 0, 0, 320, 240);
      return this._c.toDataURL("image/jpeg", 0.75);
    }

    async runDepth() {
      const out = await this.depthPipe(this.frame());
      const t = out.predicted_depth;
      const h = t.dims[t.dims.length - 2], w = t.dims[t.dims.length - 1];
      this.depth = { data: t.data, w, h, t: Date.now() };
      this.updateCalibration();
      this.updateDepthObstacle();
    }

    async runHazards() {
      const out = await this.hazPipe(this.frame(), LABELS, { threshold: 0.2, percentage: true });
      const items = (out || []).map(o => {
        let { xmin, ymin, xmax, ymax } = o.box;
        if (xmax > 1.5 || ymax > 1.5) { xmin /= 320; xmax /= 320; ymin /= 240; ymax /= 240; }
        return { raw: RAW[o.label] || o.label, score: o.score,
                 n: [clamp(xmin, 0, 1), clamp(ymin, 0, 1), clamp(xmax - xmin, 0.02, 1), clamp(ymax - ymin, 0.02, 1)] };
      }).sort((a, b) => b.score - a.score);
      const kept = [];
      for (const it of items) {
        if (kept.some(k => k.raw === it.raw && this.iou(k.n, it.n) > 0.4)) continue;
        kept.push(it);
        if (kept.length >= 6) break;
      }
      const t = Date.now();
      this.hazards = kept.map(k => Object.assign(k, { t }));
    }

    iou(a, b) {
      const x0 = Math.max(a[0], b[0]), y0 = Math.max(a[1], b[1]);
      const x1 = Math.min(a[0] + a[2], b[0] + b[2]), y1 = Math.min(a[1] + a[3], b[1] + b[3]);
      const inter = Math.max(0, x1 - x0) * Math.max(0, y1 - y0);
      return inter / (a[2] * a[3] + b[2] * b[3] - inter + 1e-9);
    }

    /** raw depth value at normalized coords (0..1) */
    s(xn, yn) {
      const D = this.depth;
      const x = clamp(Math.round(xn * (D.w - 1)), 0, D.w - 1), y = clamp(Math.round(yn * (D.h - 1)), 0, D.h - 1);
      return D.data[y * D.w + x];
    }

    /** median raw depth in the lower-central part of a normalized box */
    regionDepth(n) {
      const vals = [];
      for (let i = 0; i < 5; i++) for (let j = 0; j < 5; j++) {
        vals.push(this.s(n[0] + n[2] * (0.3 + 0.1 * i), n[1] + n[3] * (0.5 + 0.1 * j)));
      }
      return median(vals);
    }

    /** Depth-Anything gives relative inverse depth: s = a/d + b. Fit a,b from objects of known size. */
    updateCalibration() {
      const v = this.v, W = v.canvasElement.width, H = v.canvasElement.height;
      const fresh = [];
      for (const d of (v.lastDetections || [])) {
        if (!d.track || d.track.hits < 3 || d.score < 0.6 || d.truncated || d.sizeDistance == null) continue;
        if (d.sizeDistance < 0.7 || d.sizeDistance > 6 || d.rawLabel === "obstacle") continue;
        const n = [d.bbox[0] / W, d.bbox[1] / H, d.bbox[2] / W, d.bbox[3] / H];
        const s = this.regionDepth(n);
        if (s > 0) fresh.push({ inv: 1 / d.sizeDistance, s });
      }
      this.samples = this.samples.concat(fresh).slice(-24);
      const sm = this.samples;
      if (!sm.length) return;
      let a = median(sm.map(p => p.s / p.inv)), b = 0;
      if (sm.length >= 4) {
        const mi = sm.reduce((t, p) => t + p.inv, 0) / sm.length, ms = sm.reduce((t, p) => t + p.s, 0) / sm.length;
        let sxx = 0, sxy = 0;
        for (const p of sm) { sxx += (p.inv - mi) ** 2; sxy += (p.inv - mi) * (p.s - ms); }
        if (sxx > 0.02) {
          const fa = sxy / sxx, fb = ms - fa * mi;
          if (fa > 0 && Math.abs(fb) < 0.6 * Math.max(...sm.map(p => p.s))) { a = fa; b = fb; }
        }
      }
      if (a > 0) this.cal = { a, b };
    }

    toMeters(sv) {
      if (!this.cal || sv == null) return null;
      const x = sv - this.cal.b;
      if (x <= this.cal.a / 12) return 12;
      return clamp(this.cal.a / x, 0.3, 12);
    }

    /** Finds unlabeled obstacles (and walls) directly ahead from the depth map. */
    updateDepthObstacle() {
      if (!this.cal) { this.obsCount = 0; return; }
      const b = this.cal.b;
      let flagged = 0, total = 0, minX = 1, maxX = 0, minY = 1, maxY = 0;
      const vals = [];
      for (let yn = 0.45; yn <= 0.951; yn += 0.05) {
        const row = [];
        for (let xn = 0.05; xn <= 0.951; xn += 0.05) row.push(this.s(xn, yn));
        const ref = median(row);
        for (let xn = 0.30; xn <= 0.701; xn += 0.05) {
          const sv = this.s(xn, yn);
          total++;
          if (sv - b > 1.4 * (ref - b) && sv - b > 0) {
            flagged++; vals.push(sv);
            minX = Math.min(minX, xn); maxX = Math.max(maxX, xn); minY = Math.min(minY, yn); maxY = Math.max(maxY, yn);
          }
        }
      }
      let dist = null, box = null, label = "Unidentified obstacle";
      if (flagged / total >= 0.3) {
        dist = this.toMeters(median(vals));
        box = [minX, minY, maxX - minX + 0.05, maxY - minY + 0.05];
      } else {
        const mid = [];
        for (let yn = 0.30; yn <= 0.551; yn += 0.05) for (let xn = 0.30; xn <= 0.701; xn += 0.05) mid.push(this.s(xn, yn));
        const wd = this.toMeters(median(mid));
        if (wd != null && wd <= 1.2) { dist = wd; box = [0.3, 0.3, 0.4, 0.3]; label = "Wall or obstacle"; }
      }
      if (dist != null && dist <= 3.0) this.obsCount++; else this.obsCount = 0;
      if (this.obsCount >= 2) this.obsDet = { t: Date.now(), dist: round1(dist), box, label };
    }

    /** Called by the vision loop each frame: merges hazards, refines distances with depth, adds depth-found obstacles. */
    refine(objects, w, h) {
      if (!this.enabled || !this.running) return objects;
      const v = this.v, now = Date.now();
      const out = objects.slice();
      for (const hz of this.hazards) {
        if (now - hz.t > 6000) continue;
        const d = v.enrichDetection(hz.raw, hz.score, [hz.n[0] * w, hz.n[1] * h, hz.n[2] * w, hz.n[3] * h], w, h);
        d.fromHazardAI = true;
        out.push(d);
      }
      if (this.depth && this.cal && now - this.depth.t < 5000) {
        for (const d of out) {
          const n = [d.bbox[0] / w, d.bbox[1] / h, d.bbox[2] / w, d.bbox[3] / h];
          const dd = this.toMeters(this.regionDepth(n));
          if (dd == null || d.rawLabel === "obstacle") continue;
          const size = d.sizeDistance != null ? d.sizeDistance : dd;
          d.depthDistance = round1(dd);
          d.distance = round1(clamp(0.5 * size + 0.5 * dd, 0.3, 8));
          const cx = d.bbox[0] + d.bbox[2] / 2;
          d.intersectsPath = cx >= w * 0.30 && cx <= w * 0.70 && d.distance <= 4.0;
          d.priority = v.classifyHazardPriority(d.rawLabel, d.distance, d.intersectsPath, d.elevation);
        }
      }
      const o = this.obsDet;
      if (o && now - o.t < 3000 && !out.some(d => d.intersectsPath && Math.abs(d.distance - o.dist) < 0.8)) {
        const d = v.enrichDetection("obstacle", 0.6, [o.box[0] * w, o.box[1] * h, o.box[2] * w, o.box[3] * h], w, h);
        d.label = o.label; d.distance = o.dist; d.intersectsPath = true;
        d.priority = o.dist <= 1.8 ? "high" : "medium";
        out.push(d);
      }
      return out;
    }
  }

  window.advancedAI = new AdvancedAI();
  window.addEventListener("DOMContentLoaded", () => {
    const t = document.getElementById("adv-ai-toggle");
    if (t) {
      t.checked = window.advancedAI.enabled;
      t.addEventListener("change", (e) => window.advancedAI.setEnabled(e.target.checked));
    }
  });
})();
