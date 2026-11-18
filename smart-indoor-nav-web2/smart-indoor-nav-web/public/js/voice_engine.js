/**
 * Smart Indoor Navigation System - Voice & Acoustic Audio Engine
 * Handles Text-to-Speech (multilingual), Speech-to-Text Recognition,
 * 3D Binaural Stereo Sound Cues, Distance Sonar, and Haptic Feedback.
 */

class VoiceAudioEngine {
  constructor() {
    this.synth = window.speechSynthesis;
    this.recognition = null;
    this.isListening = false;
    this.audioCtx = null;
    this.sonarInterval = null;
    
    // User preferences
    this.rate = parseFloat(localStorage.getItem("smartnav_rate") || "1.0");
    this.pitch = parseFloat(localStorage.getItem("smartnav_pitch") || "1.0");
    this.volume = parseFloat(localStorage.getItem("smartnav_volume") || "1.0");
    this.vibrationEnabled = localStorage.getItem("smartnav_vibration") !== "false";
    
    this.initAudioContext();
    this.initSpeechRecognition();
  }

  initAudioContext() {
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (AudioContext) {
        this.audioCtx = new AudioContext();
      }
    } catch (e) {
      console.warn("Web Audio API not supported", e);
    }
  }

  ensureAudioContext() {
    if (this.audioCtx && this.audioCtx.state === "suspended") {
      this.audioCtx.resume();
    }
  }

  initSpeechRecognition() {
    const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (SpeechRec) {
      this.recognition = new SpeechRec();
      this.recognition.continuous = false;
      this.recognition.interimResults = false;
      this.recognition.lang = window.i18n ? window.i18n.getLangCode() : "en-US";

      this.recognition.onstart = () => {
        this.isListening = true;
        this.playTone(660, 0.1, 0); // Gentle start beep
        if (window.onVoiceStateChange) window.onVoiceStateChange(true);
      };

      this.recognition.onresult = (event) => {
        const transcript = event.results[0][0].transcript.trim();
        console.log("Voice recognized:", transcript);
        this.playTone(880, 0.15, 0); // Confirmation beep
        if (window.onVoiceCommand) {
          window.onVoiceCommand(transcript);
        }
      };

      this.recognition.onerror = (event) => {
        console.warn("Speech recognition error:", event.error);
        this.isListening = false;
        if (window.onVoiceStateChange) window.onVoiceStateChange(false);
      };

      this.recognition.onend = () => {
        this.isListening = false;
        if (window.onVoiceStateChange) window.onVoiceStateChange(false);
      };
    } else {
      console.warn("Speech Recognition not supported in this browser.");
    }
  }

  startListening() {
    if (!this.recognition) {
      this.speak("Speech recognition is not supported in this browser. Please use touch controls.");
      return;
    }
    try {
      this.ensureAudioContext();
      this.recognition.lang = window.i18n ? window.i18n.getLangCode() : "en-US";
      this.recognition.start();
    } catch (e) {
      console.warn("Recognition already active or failed to start", e);
    }
  }

  stopListening() {
    if (this.recognition && this.isListening) {
      this.recognition.stop();
      this.isListening = false;
      if (window.onVoiceStateChange) window.onVoiceStateChange(false);
    }
  }

  isSpeaking() {
    try {
      if (window.AndroidTTS) return window.AndroidTTS.isSpeaking();
    } catch (e) { /* fall through */ }
    return !!(this.synth && this.synth.speaking);
  }

  speak(text, priority = false, onEndCallback = null) {
    if (window.AndroidTTS) {
      try {
        const lc = window.i18n ? window.i18n.getLangCode() : "en-US";
        window.AndroidTTS.speak(String(text), lc, this.rate, this.pitch, !!priority);
        const live = document.getElementById("screen-reader-live");
        if (live) live.textContent = text;
        if (onEndCallback) {
          const poll = () => { if (this.isSpeaking()) setTimeout(poll, 250); else onEndCallback(); };
          setTimeout(poll, 400);
        }
        return;
      } catch (e) { console.warn("Native TTS failed, using web speech", e); }
    }
    if (!this.synth) return;
    
    // If priority, cancel existing speech immediately
    if (priority) {
      this.synth.cancel();
    }

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = this.rate;
    utterance.pitch = this.pitch;
    utterance.volume = this.volume;
    
    const langCode = window.i18n ? window.i18n.getLangCode() : "en-US";
    utterance.lang = langCode;

    // Pick best matching voice
    const voices = this.synth.getVoices();
    const matchingVoice = voices.find(v => v.lang.startsWith(langCode.slice(0, 2)));
    if (matchingVoice) {
      utterance.voice = matchingVoice;
    }

    if (onEndCallback) {
      utterance.onend = onEndCallback;
    }

    // Accessibility ARIA live announcement update
    const liveRegion = document.getElementById("screen-reader-live");
    if (liveRegion) {
      liveRegion.textContent = text;
    }

    this.synth.speak(utterance);
  }

  stopSpeaking() {
    if (window.AndroidTTS) { try { window.AndroidTTS.stop(); } catch (e) { /* ignore */ } }
    if (this.synth) {
      this.synth.cancel();
    }
  }

  /**
   * Generates a synthesized audio tone with stereo panning.
   * pan: -1.0 (full left ear) to +1.0 (full right ear), 0 = center
   */
  playTone(freq = 440, duration = 0.2, pan = 0, type = "sine") {
    try {
      this.ensureAudioContext();
      if (!this.audioCtx) return;

      const osc = this.audioCtx.createOscillator();
      const gain = this.audioCtx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, this.audioCtx.currentTime);

      gain.gain.setValueAtTime(0.15 * this.volume, this.audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, this.audioCtx.currentTime + duration);

      // Stereo panner
      if (this.audioCtx.createStereoPanner) {
        const panner = this.audioCtx.createStereoPanner();
        panner.pan.setValueAtTime(Math.max(-1, Math.min(1, pan)), this.audioCtx.currentTime);
        osc.connect(panner);
        panner.connect(gain);
      } else {
        osc.connect(gain);
      }

      gain.connect(this.audioCtx.destination);
      osc.start();
      osc.stop(this.audioCtx.currentTime + duration);
    } catch (e) {
      console.warn("Audio tone generation failed", e);
    }
  }

  playTurnSound(direction) {
    if (direction === "turn_left") {
      this.playTone(520, 0.25, -0.85); // Panned left
      this.vibrate([100, 60, 100]);
    } else if (direction === "turn_right") {
      this.playTone(520, 0.25, 0.85); // Panned right
      this.vibrate([100, 60, 100]);
    } else if (direction === "arrival") {
      // Fanfare
      this.playTone(523, 0.15, 0);
      setTimeout(() => this.playTone(659, 0.15, 0), 120);
      setTimeout(() => this.playTone(784, 0.35, 0), 240);
      this.vibrate([200, 100, 200, 100, 400]);
    } else {
      this.playTone(440, 0.15, 0);
      this.vibrate([60]);
    }
  }

  playObstacleAlert(dist = 2.0) {
    // Urgent alarm double buzz
    this.playTone(850, 0.12, 0, "sawtooth");
    setTimeout(() => this.playTone(950, 0.15, 0, "sawtooth"), 100);
    this.vibrate([150, 50, 150, 50, 200]);
  }

  playEmergencySiren() {
    this.playTone(900, 0.4, 0, "sawtooth");
    setTimeout(() => this.playTone(600, 0.4, 0, "sawtooth"), 400);
    this.vibrate([400, 100, 400, 100, 400]);
  }

  startDistanceSonar(getDistanceMetersFn) {
    this.stopDistanceSonar();
    this.sonarInterval = setInterval(() => {
      const dist = getDistanceMetersFn();
      if (dist === null || dist === undefined || dist <= 0.5) return;
      // Frequency ramps up from 350Hz (far) to 900Hz (close)
      const freq = Math.min(1000, Math.max(350, 1000 - dist * 35));
      this.playTone(freq, 0.08, 0, "sine");
    }, 1800);
  }

  stopDistanceSonar() {
    if (this.sonarInterval) {
      clearInterval(this.sonarInterval);
      this.sonarInterval = null;
    }
  }

  vibrate(pattern) {
    if (this.vibrationEnabled && "vibrate" in navigator) {
      try {
        navigator.vibrate(pattern);
      } catch (e) {
        // Ignored
      }
    }
  }

  updateSettings(rate, pitch, volume, vibrationEnabled) {
    this.rate = rate;
    this.pitch = pitch;
    this.volume = volume;
    this.vibrationEnabled = vibrationEnabled;
    localStorage.setItem("smartnav_rate", rate);
    localStorage.setItem("smartnav_pitch", pitch);
    localStorage.setItem("smartnav_volume", volume);
    localStorage.setItem("smartnav_vibration", vibrationEnabled);
  }
}

window.voiceEngine = new VoiceAudioEngine();
