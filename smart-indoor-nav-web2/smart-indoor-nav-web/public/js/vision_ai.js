/**
 * Smart Indoor Navigation - AI Vision Engine (v2)
 * - TensorFlow.js + COCO-SSD (MobileNet V2, most accurate bundled variant), loaded lazily
 * - Detection runs on the same canvas that is drawn, so boxes always line up
 * - Frame-to-frame tracking: stable detections only, approaching-object detection
 * - Spoken alerts for every stable detection (priority + cooldown + de-duplication)
 * - Honest offline fallback (no invented objects); demo scenes only when explicitly selected
 */

const TFJS_URL = "https://cdn.jsdelivr.net/npm/@tensorflow/tfjs@4.22.0/dist/tf.min.js";
const COCO_URL = "https://cdn.jsdelivr.net/npm/@tensorflow-models/coco-ssd@2.2.3/dist/coco-ssd.min.js";

// label -> [friendly name, real height (m), category]
const OBJECT_INFO = {
  "person": ["Person", 1.65, "human_animal"], "bicycle": ["Bicycle", 1.0, "floor_object"],
  "car": ["Car", 1.5, "general"], "motorcycle": ["Motorcycle", 1.1, "general"],
  "bus": ["Bus", 3.0, "general"], "truck": ["Truck", 2.5, "general"],
  "bench": ["Bench", 0.85, "furniture"], "chair": ["Chair", 0.9, "furniture"],
  "couch": ["Sofa", 0.85, "furniture"], "bed": ["Bed", 0.6, "furniture"],
  "dining table": ["Table", 0.75, "furniture"], "potted plant": ["Potted plant", 0.6, "floor_object"],
  "toilet": ["Toilet", 0.4, "structure"], "sink": ["Sink", 0.2, "structure"],
  "tv": ["Display screen", 0.5, "office_edu"], "laptop": ["Laptop", 0.25, "office_edu"],
  "refrigerator": ["Refrigerator", 1.7, "furniture"], "backpack": ["Backpack", 0.45, "floor_object"],
  "handbag": ["Handbag", 0.3, "floor_object"], "suitcase": ["Suitcase", 0.6, "floor_object"],
  "umbrella": ["Umbrella", 0.9, "floor_object"], "bottle": ["Water bottle", 0.25, "floor_object"],
  "dog": ["Dog", 0.5, "human_animal"], "cat": ["Cat", 0.3, "human_animal"],
  "cell phone": ["Mobile phone", 0.15, "general"], "fire hydrant": ["Fire hydrant", 0.7, "hazard"],
  "book": ["Book", 0.22, "general"], "clock": ["Clock", 0.3, "general"], "vase": ["Vase", 0.3, "general"],
  "keyboard": ["Keyboard", 0.04, "office_edu"], "oven": ["Oven", 0.6, "furniture"],
  "microwave": ["Microwave", 0.3, "furniture"],
  // demo-scene / future-model labels
  "door": ["Doorway", 2.1, "structure"], "stairs": ["Staircase", 1.4, "structure"],
  "wet floor": ["Wet floor sign", 0.65, "hazard"], "shoe": ["Shoes", 0.12, "floor_object"],
  "cable": ["Cable on floor", 0.05, "hazard"], "dustbin": ["Dustbin", 0.45, "floor_object"],
  "desk": ["Desk", 0.75, "furniture"], "obstacle": ["Obstacle", 0.5, "general"],
  "glass door": ["Glass door", 2.1, "structure"], "elevator": ["Elevator", 2.1, "structure"],
  "fire extinguisher": ["Fire extinguisher", 0.5, "hazard"], "pillar": ["Pillar", 2.5, "structure"],
  "step": ["Step", 0.2, "structure"]
};
const IGNORED_LABELS = new Set(["cup", "fork", "knife", "spoon", "bowl", "remote", "toothbrush", "hair drier", "scissors", "mouse"]);
const MOVING = new Set(["person", "dog", "cat", "bicycle", "motorcycle", "car", "bus", "truck"]);

class AdvancedVisionAIEngine {
  constructor() {
    this.videoElement = null;
    this.canvasElement = null;
    this.ctx = null;
    this.isStreaming = false;
    this.running = false;
    this.isDetecting = false;
    this._loopToken = 0;
    this.currentMode = "obstacle";
    this.announcementFrequency = "all"; // 'all' | 'medium' | 'minimal'

    this.tfModel = null;
    this.isTfLoaded = false;
    this.modelName = "";
    this._modelPromise = null;

    this.trackedObjects = new Map();
    this.nextTrackId = 1;
    this.announcedObjectsHistory = new Map();
    this.lastSpokenAlertTime = 0;
    this.lastDetections = [];

    this.lastDiagnosticWarning = 0;
    this.isLowLight = false;
    this.isObstructed = false;
    this._small = document.createElement("canvas");
    this._small.width = 64; this._small.height = 48;
    this._sctx = this._small.getContext("2d", { willReadFrequently: true });
    this._prevSmall = null;
    this._heurHits = 0;

    this._lastOcr = 0; this._ocrBusy = false; this._lastEnvSpeak = 0;
    this._fps = 0; this._frames = 0; this._fpsT = Date.now();

    this.simulatedObstacleMode = false;
    this.simulatedScene = "chair_path";
  }

  setStatus(text, kind) {
    const el = document.getElementById("vision-status");
    if (el) { el.textContent = text; el.dataset.kind = kind || "info"; }
  }

  _loadScript(src) {
    return new Promise((resolve, reject) => {
      if (document.querySelector(`script[data-src="${src}"]`)) return resolve();
      const s = document.createElement("script");
      s.src = src; s.async = true; s.dataset.src = src;
      const timer = setTimeout(() => reject(new Error("timeout " + src)), 20000);
      s.onload = () => { clearTimeout(timer); resolve(); };
      s.onerror = () => { clearTimeout(timer); s.remove(); reject(new Error("failed " + src)); };
      document.head.appendChild(s);
    });
  }

  /** Loads TF.js + COCO-SSD once. Resolves true when the neural model is ready. */
  loadModel() {
    if (this.isTfLoaded) return Promise.resolve(true);
    if (this._modelPromise) return this._modelPromise;
    this._modelPromise = (async () => {
      try {
        this.setStatus("Loading AI model…", "loading");
        if (!window.tf) await this._loadScript(TFJS_URL);
        if (!window.cocoSsd) await this._loadScript(COCO_URL);
        try { await window.tf.setBackend("webgl"); } catch (e) { /* use default backend */ }
        await window.tf.ready();
        try {
          this.tfModel = await window.cocoSsd.load({ base: "mobilenet_v2" });
          this.modelName = "MobileNet V2";
        } catch (e) {
          this.tfModel = await window.cocoSsd.load({ base: "lite_mobilenet_v2" });
          this.modelName = "MobileNet Lite";
        }
        this.isTfLoaded = true;
        this.setStatus(`AI ready • ${this.modelName}`, "ok");
        return true;
      } catch (e) {
        console.warn("AI model unavailable (offline?)", e);
        this.setStatus("Offline • basic obstacle mode", "warn");
        this._modelPromise = null; // allow retry next time
        return false;
      }
    })();
    return this._modelPromise;
  }

  async init(videoElement, canvasElement) {
    this.videoElement = videoElement;
    this.canvasElement = canvasElement;
    if (canvasElement) this.ctx = canvasElement.getContext("2d", { willReadFrequently: true });
    this.loadModel(); // background; camera starts immediately
  }

  async startCamera() {
    if (this.running) return { success: true, simulated: this.simulatedObstacleMode };
    this.trackedObjects.clear();
    this.announcedObjectsHistory.clear();
    this.lastDetections = [];
    const v = this.videoElement;
    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) throw new Error("Camera API unavailable");
      let stream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30 } },
          audio: false
        });
      } catch (e) {
        stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
      }
      try {
        const track = stream.getVideoTracks()[0];
        const caps = track.getCapabilities ? track.getCapabilities() : {};
        if (caps.focusMode && caps.focusMode.includes("continuous")) {
          await track.applyConstraints({ advanced: [{ focusMode: "continuous" }] });
        }
      } catch (e) { /* optional */ }
      v.srcObject = stream;
      await v.play();
      await new Promise(r => { if (v.videoWidth) r(); else v.onloadedmetadata = () => r(); });
      const cw = 640;
      this.canvasElement.width = cw;
      this.canvasElement.height = Math.round(cw * (v.videoHeight / v.videoWidth)) || 480;
      this.isStreaming = true;
      this.simulatedObstacleMode = false;
    } catch (err) {
      console.warn("Camera unavailable, demo mode", err);
      this.isStreaming = false;
      this.simulatedObstacleMode = true;
      this.canvasElement.width = 640; this.canvasElement.height = 480;
      this.setStatus("No camera • demo scenes", "warn");
      if (window.voiceEngine) window.voiceEngine.speak("Camera is not available. Showing demo scenes instead.", true);
    }
    this.running = true;
    this.isDetecting = true;
    this._runLoop(++this._loopToken);
    if (window.advancedAI) window.advancedAI.start(this);
    return { success: true, simulated: this.simulatedObstacleMode };
  }

  stopCamera() {
    if (window.advancedAI) window.advancedAI.stop();
    this.running = false;
    this.isDetecting = false;
    this._loopToken++;
    const v = this.videoElement;
    if (v && v.srcObject) {
      v.srcObject.getTracks().forEach(t => t.stop());
      v.srcObject = null;
    }
    this.isStreaming = false;
    this.trackedObjects.clear();
    this.lastDetections = [];
    if (this.ctx && this.canvasElement) this.ctx.clearRect(0, 0, this.canvasElement.width, this.canvasElement.height);
  }

  setCameraMode(mode) {
    if (!["obstacle", "ocr", "environment"].includes(mode)) return;
    this.currentMode = mode;
    const names = { obstacle: "Obstacle detection mode", ocr: "Text reading mode", environment: "Environment understanding mode" };
    if (window.voiceEngine) window.voiceEngine.speak(`${names[mode]} activated.`, true);
    document.querySelectorAll(".cam-mode-btn").forEach(btn => {
      const on = btn.getAttribute("data-mode") === mode;
      btn.classList.toggle("active", on);
      btn.setAttribute("aria-selected", on ? "true" : "false");
    });
  }

  setSimulatedScene(sceneType) {
    if (sceneType === "live") {
      this.simulatedObstacleMode = false;
      this.trackedObjects.clear();
      if (!this.isStreaming) { this.stopCamera(); this.startCamera(); }
      else this.setStatus(this.isTfLoaded ? `AI ready • ${this.modelName}` : "Offline • basic obstacle mode", this.isTfLoaded ? "ok" : "warn");
      return;
    }
    this.simulatedScene = sceneType;
    this.simulatedObstacleMode = true; // picking a demo scene explicitly opts into demo mode
    this.announcedObjectsHistory.clear();
    this.trackedObjects.clear();
    this.setStatus("Demo scene • " + sceneType.replace(/_/g, " "), "warn");
  }

  async _runLoop(token) {
    while (this.running && token === this._loopToken) {
      const t0 = performance.now();
      try { await this.processVisionFrame(); } catch (e) { console.warn("frame error", e); }
      const spent = performance.now() - t0;
      await new Promise(r => setTimeout(r, Math.max(40, 120 - spent)));
    }
  }

  async processVisionFrame() {
    if (!this.ctx || !this.canvasElement) return;
    const w = this.canvasElement.width, h = this.canvasElement.height;
    let objects = [];
    let signs = [];

    if (this.simulatedObstacleMode || !this.isStreaming) {
      objects = this.generateSimulatedDetections(w, h);
      this.renderSimulatedBackdrop(w, h, objects);
    } else {
      if (this.videoElement.readyState < 2) return;
      this.ctx.drawImage(this.videoElement, 0, 0, w, h);
      this.performCameraDiagnostics(w, h);
      if (this.isObstructed) {
        objects = [];
      } else if (this.isTfLoaded && this.tfModel) {
        const preds = await this.tfModel.detect(this.canvasElement, 20, 0.45);
        objects = preds
          .filter(p => !IGNORED_LABELS.has(p.class))
          .map(p => this.enrichDetection(p.class, p.score, p.bbox, w, h));
      } else {
        objects = this.analyzeHeuristicObjects(w, h);
        if (!this.isTfLoaded && !this._modelPromise) this.loadModel(); // retry when network returns
      }
    }

    if (this.isStreaming && !this.simulatedObstacleMode && window.advancedAI) {
      objects = window.advancedAI.refine(objects, w, h);
    }

    // frame counter / FPS
    this._frames++;
    const now = Date.now();
    if (now - this._fpsT >= 1000) {
      this._fps = this._frames; this._frames = 0; this._fpsT = now;
      const f = document.getElementById("vision-fps");
      if (f) f.textContent = this._fps + " FPS";
    }

    // OCR (throttled, never blocks the detection loop)
    if ((this.currentMode === "ocr" || this.currentMode === "environment") && window.ocrEngine) {
      if (!this._ocrBusy && now - this._lastOcr > 1800) {
        this._ocrBusy = true; this._lastOcr = now;
        const snap = this.simulatedObstacleMode ? this.canvasElement : this._snapshot();
        Promise.resolve(window.ocrEngine.processFrame(snap, snap.getContext("2d")))
          .catch(() => {}).finally(() => { this._ocrBusy = false; });
      }
      signs = window.ocrEngine.recognizedSigns || [];
    }

    this.trackObjectDynamics(objects);
    this.lastDetections = objects;
    this.renderSpatialHUD(objects, signs, w, h);
    this.updateLiveSummary(objects);

    if (this.currentMode !== "ocr") this.dispatchVoiceAnnouncements(objects, signs);
    if (this.currentMode === "environment") this.maybeDescribeEnvironment(objects, signs);
  }

  _snapshot() {
    const c = this._snapCanvas || (this._snapCanvas = document.createElement("canvas"));
    c.width = this.canvasElement.width; c.height = this.canvasElement.height;
    c.getContext("2d").drawImage(this.canvasElement, 0, 0);
    return c;
  }

  performCameraDiagnostics(w, h) {
    this._sctx.drawImage(this.canvasElement, 0, 0, 64, 48);
    const d = this._sctx.getImageData(0, 0, 64, 48).data;
    let sum = 0, sq = 0, n = d.length / 4;
    for (let i = 0; i < d.length; i += 4) {
      const l = (d[i] + d[i + 1] + d[i + 2]) / 3; sum += l; sq += l * l;
    }
    const mean = sum / n, sd = Math.sqrt(Math.max(0, sq / n - mean * mean));
    this.isLowLight = mean < 28;
    this.isObstructed = sd < 5 && mean < 70;
    const now = Date.now();
    if ((this.isLowLight || this.isObstructed) && now - this.lastDiagnosticWarning > 12000 && window.voiceEngine) {
      this.lastDiagnosticWarning = now;
      window.voiceEngine.speak(this.isObstructed
        ? "The camera looks blocked. Please uncover the lens."
        : "Camera visibility is limited due to low lighting. Please turn on lights.", true);
    }
  }

  enrichDetection(rawLabel, score, bbox, frameW, frameH) {
    const [bx, by, bw, bh] = bbox;
    const cx = bx + bw / 2, bottomY = by + bh;
    let position = "center";
    if (cx < frameW * 0.35) position = "left";
    else if (cx > frameW * 0.65) position = "right";

    let elevation = "eye_level";
    if (bottomY >= frameH * 0.60 && by > frameH * 0.15) elevation = "floor";
    else if (by <= frameH * 0.12 && bh < frameH * 0.40) elevation = "overhead";

    const info = OBJECT_INFO[rawLabel.toLowerCase()] || [this.formatLabel(rawLabel), 0.5, "general"];
    const focal = frameH * 1.1; // ≈ 48° vertical field of view
    let dist = (focal * info[1]) / Math.max(bh, 12);
    const truncated = by <= 2 || bottomY >= frameH - 2; // object cut off by the frame => it is closer
    if (truncated) dist = Math.min(dist, 1.2);
    dist = Math.max(0.3, Math.min(8, Math.round(dist * 10) / 10));

    const intersectsPath = cx >= frameW * 0.30 && cx <= frameW * 0.70 && dist <= 4.0;
    return {
      label: info[0], rawLabel, score, bbox, distance: dist, position, elevation, intersectsPath,
      priority: this.classifyHazardPriority(rawLabel, dist, intersectsPath, elevation),
      type: info[2], isApproaching: false, sizeDistance: dist, truncated
    };
  }

  classifyHazardPriority(label, distance, intersectsPath, elevation) {
    const l = label.toLowerCase();
    if (l.includes("stair") || l === "step" || l.includes("glass door") || l.includes("wet floor") || l.includes("hole") || l.includes("cable") ||
        (intersectsPath && distance <= 1.8) || (elevation === "overhead" && distance <= 2.5)) return "high";
    if (intersectsPath || distance <= 2.8 || ["door", "chair", "person", "bench", "dustbin"].some(k => l.includes(k))) return "medium";
    return "low";
  }

  formatLabel(raw) {
    const s = String(raw).replace(/_/g, " ");
    return s.charAt(0).toUpperCase() + s.slice(1);
  }

  /** Offline fallback: reports only a generic obstacle when a persistent texture/edge change blocks the floor ahead. */
  analyzeHeuristicObjects(w, h) {
    this._sctx.drawImage(this.canvasElement, 0, 0, 64, 48);
    const d = this._sctx.getImageData(0, 0, 64, 48).data;
    let edges = 0, minX = 64, maxX = 0, maxY = 0, minY = 48;
    for (let y = 24; y < 46; y++) {
      for (let x = 18; x < 46; x++) {
        const i = (y * 64 + x) * 4, j = i + 4;
        const a = (d[i] + d[i + 1] + d[i + 2]) / 3, b = (d[j] + d[j + 1] + d[j + 2]) / 3;
        if (Math.abs(a - b) > 38) { edges++; minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y); }
      }
    }
    this._heurHits = edges > 70 ? Math.min(this._heurHits + 1, 6) : Math.max(0, this._heurHits - 1);
    if (this._heurHits < 3) return [];
    const bbox = [minX / 64 * w, minY / 48 * h, Math.max(24, (maxX - minX) / 64 * w), Math.max(24, (maxY - minY) / 48 * h)];
    const det = this.enrichDetection("obstacle", 0.5, bbox, w, h);
    det.label = "Possible obstacle";
    det.distance = Math.round((0.6 + (1 - (bbox[1] + bbox[3]) / h) * 5) * 10) / 10;
    det.intersectsPath = true;
    det.priority = det.distance <= 1.8 ? "high" : "medium";
    return [det];
  }

  trackObjectDynamics(detections) {
    const now = Date.now();
    const used = new Set();
    for (const d of detections) {
      const cx = d.bbox[0] + d.bbox[2] / 2, cy = d.bbox[1] + d.bbox[3] / 2;
      let best = null, bestDist = Math.max(60, d.bbox[2] * 0.6);
      for (const [id, t] of this.trackedObjects) {
        if (used.has(id) || t.raw !== d.rawLabel) continue;
        const dd = Math.hypot(cx - t.x, cy - t.y);
        if (dd < bestDist) { bestDist = dd; best = t; }
      }
      if (best) {
        used.add(best.id);
        best.hist.push({ t: now, h: d.bbox[3], dist: d.distance });
        best.hist = best.hist.filter(p => now - p.t < 2500);
        const first = best.hist[0];
        if (MOVING.has(d.rawLabel) && best.hist.length >= 3 && now - first.t > 500 &&
            d.bbox[3] > first.h * 1.12 && d.distance < first.dist - 0.25) d.isApproaching = true;
        Object.assign(best, { x: cx, y: cy, hits: best.hits + 1, last: now, dist: d.distance });
        d.track = best;
      } else {
        const t = { id: this.nextTrackId++, raw: d.rawLabel, x: cx, y: cy, hits: 1, last: now,
                    dist: d.distance, hist: [{ t: now, h: d.bbox[3], dist: d.distance }],
                    lastAnnounced: 0, lastAnnouncedDist: 99, saidApproach: false };
        this.trackedObjects.set(t.id, t);
        used.add(t.id);
        d.track = t;
      }
      d.stable = d.track.hits >= 2 || this.simulatedObstacleMode;
    }
    for (const [id, t] of this.trackedObjects) if (now - t.last > 1500) this.trackedObjects.delete(id);
  }

  generateSimulatedDetections(w, h) {
    const s = this.simulatedScene;
    const detections = [];

    if (s === "chair_path") {
      detections.push(this.enrichDetection("chair", 0.94, [w * 0.36, h * 0.44, w * 0.28, h * 0.48], w, h));
    } else if (s === "shoes_cable") {
      detections.push(this.enrichDetection("shoe", 0.91, [w * 0.38, h * 0.72, w * 0.16, h * 0.18], w, h));
      detections.push(this.enrichDetection("cable", 0.88, [w * 0.25, h * 0.82, w * 0.45, h * 0.12], w, h));
    } else if (s === "dustbin_side") {
      detections.push(this.enrichDetection("dustbin", 0.93, [w * 0.12, h * 0.52, w * 0.20, h * 0.38], w, h));
    } else if (s === "wet_floor") {
      detections.push(this.enrichDetection("wet floor", 0.96, [w * 0.34, h * 0.45, w * 0.32, h * 0.42], w, h));
    } else if (s === "stairs") {
      detections.push(this.enrichDetection("stairs", 0.95, [w * 0.18, h * 0.42, w * 0.64, h * 0.52], w, h));
    } else if (s === "person_approaching") {
      const p = this.enrichDetection("person", 0.95, [w * 0.38, h * 0.22, w * 0.26, h * 0.72], w, h);
      p.isApproaching = true;
      detections.push(p);
    } else if (s === "classroom_scene") {
      detections.push(this.enrichDetection("desk", 0.92, [w * 0.15, h * 0.45, w * 0.35, h * 0.45], w, h));
      detections.push(this.enrichDetection("chair", 0.89, [w * 0.55, h * 0.48, w * 0.26, h * 0.44], w, h));
      detections.push(this.enrichDetection("laptop", 0.90, [w * 0.22, h * 0.40, w * 0.18, h * 0.15], w, h));
    } else if (s === "door_open") {
      detections.push(this.enrichDetection("door", 0.94, [w * 0.32, h * 0.18, w * 0.36, h * 0.76], w, h));
    } else if (s === "unidentified_low") {
      // Open-vocabulary / unknown object requirement
      detections.push({
        label: "Unidentified Object",
        rawLabel: "unknown",
        score: 0.68,
        bbox: [w * 0.40, h * 0.68, w * 0.22, h * 0.24],
        distance: 1.0,
        position: "center",
        elevation: "floor",
        intersectsPath: true,
        priority: "medium",
        type: "general",
        isApproaching: false
      });
    }

    return detections;
  }

  renderSimulatedBackdrop(w, h, detections) {
    const g = this.ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, "#0a1830"); g.addColorStop(0.55, "#10294d"); g.addColorStop(1, "#050b16");
    this.ctx.fillStyle = g; this.ctx.fillRect(0, 0, w, h);
    this.ctx.strokeStyle = "rgba(94,234,212,0.25)"; this.ctx.lineWidth = 2;
    this.ctx.beginPath();
    this.ctx.moveTo(w * 0.35, h * 0.4); this.ctx.lineTo(w * 0.15, h);
    this.ctx.moveTo(w * 0.65, h * 0.4); this.ctx.lineTo(w * 0.85, h);
    this.ctx.stroke();
    this.ctx.fillStyle = "rgba(255,255,255,0.7)";
    this.ctx.font = "bold 14px sans-serif";
    this.ctx.fillText("DEMO SCENE • " + this.currentMode.toUpperCase(), 14, 24);
  }

  renderSpatialHUD(detections, signs, w, h) {
    const ctx = this.ctx;
    const fs = Math.max(13, Math.round(w / 46));
    ctx.save();
    ctx.setLineDash([6, 6]);
    ctx.strokeStyle = "rgba(255,255,255,0.22)"; ctx.lineWidth = 1.5;
    ctx.strokeRect(w * 0.30, h * 0.35, w * 0.40, h * 0.65);
    ctx.setLineDash([]);

    for (const d of detections) {
      const [bx, by, bw, bh] = d.bbox;
      let col = "#5eead4";
      if (d.priority === "high") col = "#ff5d6c";
      else if (d.intersectsPath) col = "#fbbf24";
      ctx.strokeStyle = col; ctx.lineWidth = d.intersectsPath ? 4 : 2.5;
      const c = Math.min(22, bw / 3, bh / 3);
      ctx.beginPath();
      [[bx, by, 1, 1], [bx + bw, by, -1, 1], [bx, by + bh, 1, -1], [bx + bw, by + bh, -1, -1]].forEach(([x, y, sx, sy]) => {
        ctx.moveTo(x, y + sy * c); ctx.lineTo(x, y); ctx.lineTo(x + sx * c, y);
      });
      ctx.stroke();
      ctx.globalAlpha = 0.9; ctx.lineWidth = 1; ctx.strokeRect(bx, by, bw, bh); ctx.globalAlpha = 1;

      const text = `${d.label} • ${d.distance} m • ${d.position}${d.isApproaching ? " • APPROACHING" : ""}`;
      ctx.font = `700 ${fs}px sans-serif`;
      const tw = ctx.measureText(text).width + 14, th = fs + 10;
      const ty = by - th - 2 < 0 ? by + 2 : by - th - 2;
      ctx.fillStyle = "rgba(6,12,24,0.88)";
      ctx.beginPath(); ctx.roundRect ? ctx.roundRect(bx, ty, tw, th, 8) : ctx.rect(bx, ty, tw, th); ctx.fill();
      ctx.fillStyle = col; ctx.fillText(text, bx + 7, ty + fs + 1);
    }

    for (const s of signs) {
      const [sx, sy, sw, sh] = s.boundingBox;
      ctx.strokeStyle = "#34d399"; ctx.lineWidth = 3; ctx.strokeRect(sx, sy, sw, sh);
      const t = "" + s.cleanText;
      ctx.font = `700 ${fs}px sans-serif`;
      const tw = Math.min(w - sx, ctx.measureText(t).width + 14);
      ctx.fillStyle = "rgba(6,12,24,0.9)"; ctx.fillRect(sx, Math.max(0, sy - fs - 10), tw, fs + 10);
      ctx.fillStyle = "#34d399"; ctx.fillText(t, sx + 7, Math.max(fs, sy - 7));
    }
    ctx.restore();
  }

  updateLiveSummary(objects) {
    const el = document.getElementById("detect-count");
    if (el) el.textContent = objects.length ? `${objects.length} object${objects.length > 1 ? "s" : ""}` : "Clear";
  }

  dispatchVoiceAnnouncements(objects) {
    if (!objects || !objects.length || !window.voiceEngine) return;
    let cands = objects.filter(o => o.stable);
    if (this.announcementFrequency === "minimal") cands = cands.filter(o => o.priority === "high");
    else if (this.announcementFrequency === "medium") cands = cands.filter(o => o.priority !== "low");
    if (!cands.length) return;

    const weight = { high: 3, medium: 2, low: 1 };
    cands.sort((a, b) => (weight[b.priority] - weight[a.priority]) || (a.distance - b.distance));

    const now = Date.now();
    for (const o of cands) {
      const t = o.track;
      const cooldown = o.priority === "high" ? 4000 : 9000;
      const due = !t.lastAnnounced || now - t.lastAnnounced > cooldown ||
                  t.dist < t.lastAnnouncedDist - 0.8 || (o.isApproaching && !t.saidApproach);
      if (!due) continue;
      const gap = o.priority === "high" ? 900 : 2200;
      if (now - this.lastSpokenAlertTime < gap) return;
      if (o.priority !== "high" && window.voiceEngine.isSpeaking()) return;

      t.lastAnnounced = now; t.lastAnnouncedDist = o.distance;
      if (o.isApproaching) t.saidApproach = true;
      this.lastSpokenAlertTime = now;
      const message = this.generateNaturalSpokenSentence(o);
      const pan = o.position === "left" ? -0.7 : o.position === "right" ? 0.7 : 0;
      if (o.priority === "high") {
        window.voiceEngine.playObstacleAlert(o.distance);
        window.voiceEngine.speak(message, true);
      } else {
        window.voiceEngine.playTone(600, 0.1, pan);
        window.voiceEngine.speak(message, false);
      }
      const banner = document.getElementById("obstacle-live-banner");
      if (banner) {
        banner.textContent = message;
        banner.className = `obstacle-live-banner visible priority-${o.priority}`;
        clearTimeout(this._bannerTimer);
        this._bannerTimer = setTimeout(() => banner.classList.remove("visible"), 4500);
      }
      return; // one announcement per frame
    }
  }

  maybeDescribeEnvironment(objects, signs) {
    const now = Date.now();
    if (now - this._lastEnvSpeak < 15000 || !window.sceneUnderstanding || !objects.some(o => o.stable)) return;
    if (window.voiceEngine.isSpeaking()) return;
    this._lastEnvSpeak = now;
    const node = window.app && window.app.findNearestNodeToUser ? window.app.findNearestNodeToUser() : null;
    const text = window.sceneUnderstanding.synthesizeSceneDescription(objects, signs, node);
    const box = document.getElementById("scene-description-box");
    if (box) box.textContent = text;
    window.voiceEngine.speak(text, false);
  }

  generateNaturalSpokenSentence(obj) {
    const lang = window.i18n ? window.i18n.currentLang : "en";
    const name = obj.label;
    const dist = obj.distance;
    const pos = obj.position; // 'left', 'center', 'right'

    // Approaching object (e.g. Person approaching from the front)
    if (obj.isApproaching) {
      if (lang === "hi") return `सावधान! व्यक्ति सामने से आपकी ओर आ रहा है, दूरी लगभग ${dist} मीटर।`;
      if (lang === "te") return `హెచ్చరిక! ఎదురుగా ఒక వ్యక్తి మీ వైపు వస్తున్నారు, దూరం సుమారు ${dist} మీటర్లు.`;
      return `Warning! Person approaching from the front, approximately ${dist} meters away.`;
    }

    // Floor hazard or wet floor
    if (String(obj.rawLabel).includes("wet floor")) {
      if (lang === "hi") return `सावधान! आगे लगभग ${dist} मीटर पर गीला फर्श है। कृपया धीरे चलें।`;
      if (lang === "te") return `హెచ్చరిక! ముందు సుమారు ${dist} మీటర్లలో తడి నేల ఉంది. దయచేసి నెమ్మదిగా నడవండి.`;
      return `Warning! Wet floor detected approximately ${dist} meters ahead. Please proceed carefully.`;
    }

    // Stairs ahead
    if (String(obj.rawLabel).includes("stair")) {
      if (lang === "hi") return `सावधान! सीढ़ियां ठीक सामने लगभग ${dist} मीटर आगे हैं। रेलिंग पकड़ें।`;
      if (lang === "te") return `హెచ్చరిక! మెట్లు నేరుగా ముందు సుమారు ${dist} మీటర్ల దూరంలో ఉన్నాయి. హ్యాండ్‌రైల్ పట్టుకోండి.`;
      return `Warning! Stairs detected approximately ${dist} meters ahead. Stop and proceed carefully.`;
    }

    // Open floor obstacle directly in walking path
    if (obj.intersectsPath) {
      if (lang === "hi") return `${name} सीधे आपके चलने के रास्ते में लगभग ${dist} मीटर आगे है।`;
      if (lang === "te") return `${name} నేరుగా మీ నడక దారిలో సుమారు ${dist} మీటర్ల ముందు ఉంది.`;
      return `${name} detected directly in your walking path approximately ${dist} meters ahead.`;
    }

    // Directional announcement
    let posText = "ahead on your right";
    let posHi = "दाईं तरफ";
    let posTe = "కుడివైపున";

    if (pos === "left") {
      posText = "ahead on your left";
      posHi = "बाईं तरफ";
      posTe = "ఎడమవైపున";
    } else if (pos === "center") {
      posText = "straight ahead";
      posHi = "ठीक सामने";
      posTe = "నేరుగా ముందు";
    }

    if (obj.elevation === "floor") {
      if (lang === "hi") return `फर्श पर ${name} लगभग ${dist} मीटर आगे ${posHi} है।`;
      if (lang === "te") return `నేలపై ${name} సుమారు ${dist} మీటర్ల దూరంలో ${posTe} ఉంది.`;
      return `${name} detected on the floor approximately ${dist} meters ${posText}.`;
    }

    if (lang === "hi") return `${name} लगभग ${dist} मीटर आगे ${posHi} है।`;
    if (lang === "te") return `${name} సుమారు ${dist} మీటర్ల దూరంలో ${posTe} ఉంది.`;
    return `${name} detected approximately ${dist} meters ${posText}.`;
  }
}

window.visionAI = new AdvancedVisionAIEngine();
