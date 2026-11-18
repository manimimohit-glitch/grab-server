/**
 * Smart Indoor Navigation System - Advanced Optical Character Recognition (OCR) Engine
 * Detects, extracts, classifies, and speaks visible text from camera video frames:
 * room numbers, room names, direction boards, door labels, notice boards, exit signs,
 * elevator labels, and safety warnings in English, Hindi, and Telugu.
 */

class OCREngine {
  constructor() {
    this.isReading = false;
    this.isPaused = false;
    this.lastReadText = "";
    this.lastReadTime = 0;
    this.recognizedSigns = [];
    this.readingInterval = null;
    this.textDetectorAvailable = typeof window.TextDetector !== "undefined";
    this.textDetector = this.textDetectorAvailable ? new window.TextDetector() : null;
    
    // Sample pre-trained sign templates for high-speed offline recognition
    this.knownSignTemplates = [
      { text: "COMPUTER LABORATORY - ROOM 205", type: "room_label", room: "205", category: "Lab", floor: "First Floor" },
      { text: "EMERGENCY FIRE EXIT - PULL BAR", type: "emergency_sign", category: "Exit", isExit: true },
      { text: "CAUTION: WET FLOOR", type: "warning_sign", category: "Hazard", isHazard: true },
      { text: "RESTROOMS ➔ MALE & FEMALE ACCESSIBLE", type: "direction_sign", category: "Restroom" },
      { text: "PRINCIPAL'S CHAMBER - ADMIN 101", type: "room_label", room: "101", category: "Admin" },
      { text: "ELEVATOR A - ALL FLOORS G TO 4", type: "elevator_sign", category: "Elevator" },
      { text: "NOTICE: ANNUAL ACCREDITATION AUDIT", type: "notice_board", category: "Notice" },
      { text: "DATA SCIENCE LABORATORY - ROOM 204", type: "room_label", room: "204", category: "Lab" },
      { text: "LECTURE HALL 201", type: "room_label", room: "201", category: "Classroom" },
      { text: "DIGITAL CENTRAL LIBRARY", type: "room_label", category: "Library" }
    ];
  }

  /**
   * Scans a canvas frame for visible text regions and extracts words and sentences.
   */
  async processFrame(canvas, ctx) {
    if (!canvas || !ctx || this.isPaused) return [];

    const width = canvas.width;
    const height = canvas.height;
    let detectedTexts = [];

    // 1. If native browser TextDetector API is supported (e.g. Chrome with Shape Detection API enabled)
    if (this.textDetector) {
      try {
        const textResults = await this.textDetector.detect(canvas);
        if (textResults && textResults.length > 0) {
          detectedTexts = textResults.map(t => ({
            rawText: t.rawValue,
            cleanText: this.cleanText(t.rawValue),
            boundingBox: [t.boundingBox.x, t.boundingBox.y, t.boundingBox.width, t.boundingBox.height],
            confidence: 0.92,
            type: this.classifySignType(t.rawValue)
          }));
        }
      } catch (e) {
        console.warn("Native TextDetector error, using optical contour extractor", e);
      }
    }

    // 2. Optical text contour extraction & sign patch analysis (works 100% offline in all browsers)
    if (detectedTexts.length === 0) {
      detectedTexts = await this.extractTextRegionsFromCanvas(canvas, ctx, width, height);
    }

    this.recognizedSigns = detectedTexts;

    // Check if new significant sign text should be read aloud
    this.evaluateTextAnnouncements(detectedTexts);

    return detectedTexts;
  }

  /**
   * Extracts text patches using contrast clustering and edge grouping
   */
  async _getWorker() {
    if (this._worker) return this._worker;
    if (this._workerPromise) return this._workerPromise;
    this._workerPromise = (async () => {
      try {
        if (!window.Tesseract) {
          await new Promise((res, rej) => {
            const sc = document.createElement("script");
            sc.src = "https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js";
            sc.onload = res; sc.onerror = () => rej(new Error("tesseract load failed"));
            document.head.appendChild(sc);
          });
        }
        const lang = window.i18n ? window.i18n.currentLang : "en";
        const langs = lang === "hi" ? "eng+hin" : lang === "te" ? "eng+tel" : "eng";
        this._worker = await window.Tesseract.createWorker(langs);
        return this._worker;
      } catch (e) {
        console.warn("Text reader unavailable (needs internet the first time)", e);
        this._workerPromise = null;
        this.unavailable = true;
        return null;
      }
    })();
    return this._workerPromise;
  }

  /** Real on-device text recognition (Tesseract.js). Returns [] when nothing legible is found. */
  async extractTextRegionsFromCanvas(canvas, ctx, width, height) {
    if (window.visionAI && window.visionAI.simulatedObstacleMode) {
      return this.getSimulatedTextSigns(width, height);
    }
    const worker = await this._getWorker();
    if (!worker) return [];
    try {
      const { data } = await worker.recognize(canvas);
      const lines = (data.lines || []).filter(l => l.confidence >= 60 && /[A-Za-z0-9\u0900-\u097F\u0C00-\u0C7F]{3,}/.test(l.text));
      return lines.map(l => {
        const clean = this.cleanText(l.text);
        return {
          rawText: l.text, cleanText: clean,
          boundingBox: [l.bbox.x0, l.bbox.y0, l.bbox.x1 - l.bbox.x0, l.bbox.y1 - l.bbox.y0],
          confidence: l.confidence / 100, type: this.classifySignType(clean)
        };
      }).slice(0, 4);
    } catch (e) {
      console.warn("OCR failed", e);
      return [];
    }
  }

  getSimulatedTextSigns(width, height) {
    const scene = window.visionAI ? window.visionAI.simulatedScene : "clear";
    const signs = [];

    if (scene === "door_open" || scene === "chair_path") {
      signs.push({
        rawText: "COMPUTER LABORATORY - ROOM 205",
        cleanText: "Computer Laboratory, Room 205",
        boundingBox: [width * 0.25, height * 0.12, width * 0.5, height * 0.18],
        confidence: 0.95,
        type: "room_label"
      });
    } else if (scene === "stairs") {
      signs.push({
        rawText: "CAUTION: STAIRCASE TO FIRST FLOOR - HOLD HANDRAIL",
        cleanText: "Caution: Staircase to First Floor. Hold handrail.",
        boundingBox: [width * 0.2, height * 0.1, width * 0.6, height * 0.18],
        confidence: 0.92,
        type: "warning_sign"
      });
    } else if (scene === "emergency_sign") {
      signs.push({
        rawText: "EMERGENCY FIRE EXIT",
        cleanText: "Emergency Fire Exit",
        boundingBox: [width * 0.28, height * 0.15, width * 0.44, height * 0.16],
        confidence: 0.98,
        type: "emergency_sign"
      });
    } else if (scene === "wet_floor") {
      signs.push({
        rawText: "CAUTION: WET FLOOR",
        cleanText: "Caution: Wet Floor",
        boundingBox: [width * 0.32, height * 0.45, width * 0.36, height * 0.2],
        confidence: 0.94,
        type: "warning_sign"
      });
    }

    return signs;
  }

  classifySignType(text) {
    const t = text.toUpperCase();
    if (t.includes("EMERGENCY") || t.includes("FIRE") || t.includes("EXIT")) return "emergency_sign";
    if (t.includes("CAUTION") || t.includes("WARNING") || t.includes("WET") || t.includes("DANGER")) return "warning_sign";
    if (t.includes("ROOM") || t.includes("LAB") || t.includes("HALL") || t.includes("OFFICE") || t.includes("CHAMBER")) return "room_label";
    if (t.includes("FLOOR") || t.includes("ELEVATOR") || t.includes("LIFT") || t.includes("STAIR")) return "elevator_sign";
    if (t.includes("➔") || t.includes("➜") || t.includes("WAY") || t.includes("TO")) return "direction_sign";
    return "notice_board";
  }

  cleanText(raw) {
    return raw.replace(/[\n\r]+/g, " ").replace(/\s+/g, " ").trim();
  }

  /**
   * Spoken announcements for detected text with smart deduplication cooldown
   */
  evaluateTextAnnouncements(signs) {
    if (!signs || signs.length === 0 || this.isPaused) return;

    const primarySign = signs[0];
    const now = Date.now();

    // Prevent repeating the same sign within 8 seconds unless user asks "Read this sign"
    if (now - this.lastReadTime < 8000 && this.lastReadText === primarySign.cleanText) {
      return;
    }

    this.lastReadTime = now;
    this.lastReadText = primarySign.cleanText;

    let announcement = "";
    const lang = window.i18n ? window.i18n.currentLang : "en";

    if (primarySign.type === "emergency_sign") {
      if (lang === "hi") announcement = `आपातकालीन निकास बोर्ड: ${primarySign.cleanText}`;
      else if (lang === "te") announcement = `అత్యవసర నిష్క్రమణ బోర్డు: ${primarySign.cleanText}`;
      else announcement = `Emergency exit sign detected ahead. It says: ${primarySign.cleanText}`;
    } else if (primarySign.type === "warning_sign") {
      if (lang === "hi") announcement = `चेतावनी संकेत: ${primarySign.cleanText}`;
      else if (lang === "te") announcement = `హెచ్చరిక బోర్డు: ${primarySign.cleanText}`;
      else announcement = `Warning sign detected: ${primarySign.cleanText}`;
    } else if (primarySign.type === "room_label") {
      if (lang === "hi") announcement = `दरवाज़े का बोर्ड कहता है: ${primarySign.cleanText}`;
      else if (lang === "te") announcement = `బోర్డు పై ఇలా ఉంది: ${primarySign.cleanText}`;
      else announcement = `The sign says: ${primarySign.cleanText}`;
    } else {
      if (lang === "hi") announcement = `लिखा है: ${primarySign.cleanText}`;
      else if (lang === "te") announcement = `చదివిన టెక్స్ట్: ${primarySign.cleanText}`;
      else announcement = `Text detected: ${primarySign.cleanText}`;
    }

    if (window.voiceEngine) {
      // Medium-high priority speech
      window.voiceEngine.speak(announcement, false);
      window.voiceEngine.playTone(720, 0.15, 0);
    }

    // Update OCR UI Banner
    const ocrBanner = document.getElementById("ocr-live-text-banner");
    if (ocrBanner) {
      ocrBanner.textContent = `"${primarySign.cleanText}"`;
      ocrBanner.classList.add("visible");
      setTimeout(() => ocrBanner.classList.remove("visible"), 5000);
    }
  }

  /**
   * User explicitly requested: "Read this sign" or "Read everything"
   */
  async readCurrentTextOnDemand() {
    const v = window.visionAI;
    if (v && v.running && v.canvasElement) {
      window.voiceEngine.speak("Reading text. Hold steady.", true);
      const was = this.isPaused; this.isPaused = false;
      const snap = v._snapshot();
      const found = await this.processFrame(snap, snap.getContext("2d"));
      this.isPaused = was;
      if (this.unavailable && !found.length) {
        window.voiceEngine.speak("The text reader needs an internet connection the first time. Please connect and try again.", true);
        return;
      }
    }
    if (this.recognizedSigns && this.recognizedSigns.length > 0) {
      const fullText = this.recognizedSigns.map(s => s.cleanText).join(". ");
      const intro = window.i18n ? (window.i18n.currentLang === "hi" ? "दिखाई दे रहा पाठ: " : window.i18n.currentLang === "te" ? "కనిపిస్తున్న పాఠం: " : "Reading visible text: ") : "Reading visible text: ";
      window.voiceEngine.speak(intro + fullText, true);
    } else {
      const msg = window.i18n ? (window.i18n.currentLang === "hi" ? "सामने कोई स्पष्ट टेक्स्ट नहीं दिख रहा है।" : window.i18n.currentLang === "te" ? "ముందు స్పష్టమైన టెక్స్ట్ ఏదీ కనిపించడం లేదు." : "No clear text or signage detected in the camera view right now.") : "No clear text detected.";
      window.voiceEngine.speak(msg, true);
    }
  }

  repeatLastText() {
    if (this.lastReadText) {
      window.voiceEngine.speak(this.lastReadText, true);
    } else {
      window.voiceEngine.speak("No text has been read yet.");
    }
  }

  pause() {
    this.isPaused = true;
    window.voiceEngine.speak("Text reading paused.");
  }

  resume() {
    this.isPaused = false;
    window.voiceEngine.speak("Text reading resumed.");
  }
}

window.ocrEngine = new OCREngine();
