/**
 * Smart Indoor Navigation System - Main Application Controller
 * Manages screen routing, voice commands, turn-by-turn execution,
 * hardware simulation, accessibility features, and offline caching.
 */

class SmartNavApp {
  constructor() {
    this.currentScreen = "screen-splash";
    this.activeBuildingId = "bld_college_01";
    this.activeBuildingData = null;
    this.selectedDestinationNode = null;
    this.activeRoute = null;
    this.currentInstructionIndex = 0;
    this.isNavPaused = false;
    this.mapRenderer = null;
    this.userRole = "guest";
    this.accessibleMode = true; // avoid stairs by default for accessibility
    
    // Voice command aliases mapping
    this.initVoiceHook();
    this.bindDOM();
  }

  async init() {
    console.log("Initializing Smart Indoor Nav application...");
    
    // Check if building data is cached or fetch from server
    await this.loadBuilding(this.activeBuildingId);

    // Initialize Map Renderer
    const canvas = document.getElementById("nav-map-canvas");
    if (canvas) {
      this.mapRenderer = new window.IndoorMapRenderer(canvas);
      if (this.activeBuildingData) {
        this.mapRenderer.setBuildingData(this.activeBuildingData);
      }
      this.mapRenderer.onNodeClick = (node) => {
        window.voiceEngine.speak(`${node.name}. ${node.audio_description || ""}`);
      };
    }

    // Connect positioning callbacks
    window.positioningClient.onPositionUpdate = (pos) => {
      if (this.mapRenderer) {
        this.mapRenderer.setUserPosition(pos);
      }
      this.updateLocationBadge(pos);
    };

    window.positioningClient.onOffRouteDetected = (pos, deviationDist) => {
      this.handleOffRoute(pos, deviationDist);
    };

    // Auto-advance splash after 2.5 seconds or on click
    setTimeout(() => {
      if (this.currentScreen === "screen-splash") {
        this.showScreen(window.auth && window.auth.user ? "screen-home" : "screen-auth");
        window.voiceEngine.speak(window.i18n.get("welcomeSpeech"));
      }
    }, 2500);

    // Apply saved high contrast
    if (localStorage.getItem("smartnav_theme") === "light") {
      document.body.classList.add("theme-light");
    }
  }

  bindDOM() {
    // Navigation / Screen transitions
    document.querySelectorAll("[data-navigate]").forEach(btn => {
      btn.addEventListener("click", () => {
        const target = btn.getAttribute("data-navigate");
        this.showScreen(target);
      });
    });

    // Language buttons
    document.querySelectorAll(".lang-btn").forEach(btn => {
      btn.addEventListener("click", () => {
        const lang = btn.getAttribute("data-lang");
        this.switchLanguage(lang);
      });
    });

    // Mic button
    const micBtn = document.getElementById("main-mic-button");
    if (micBtn) {
      micBtn.addEventListener("click", () => {
        window.voiceEngine.startListening();
      });
    }

    // Accessibility form controls
    const voiceRateSlider = document.getElementById("setting-voice-rate");
    if (voiceRateSlider) {
      voiceRateSlider.value = window.voiceEngine.rate;
      voiceRateSlider.addEventListener("input", (e) => {
        window.voiceEngine.updateSettings(
          parseFloat(e.target.value),
          window.voiceEngine.pitch,
          window.voiceEngine.volume,
          window.voiceEngine.vibrationEnabled
        );
      });
    }

    const contrastToggle = document.getElementById("setting-high-contrast");
    if (contrastToggle) {
      contrastToggle.addEventListener("change", (e) => {
        if (e.target.checked) {
          document.body.classList.remove("theme-light");
          localStorage.setItem("smartnav_theme", "dark");
        } else {
          document.body.classList.add("theme-light");
          localStorage.setItem("smartnav_theme", "light");
        }
      });
    }

    const stairsToggle = document.getElementById("setting-avoid-stairs");
    if (stairsToggle) {
      stairsToggle.checked = this.accessibleMode;
      stairsToggle.addEventListener("change", (e) => {
        this.accessibleMode = e.target.checked;
      });
    }

    // Destination search box
    const destSearch = document.getElementById("destination-search-input");
    if (destSearch) {
      destSearch.addEventListener("input", (e) => {
        this.filterDestinations(e.target.value);
      });
    }

    // Camera selector for AI Obstacle Screen
    const obsSceneSelect = document.getElementById("obstacle-scene-select");
    if (obsSceneSelect) {
      obsSceneSelect.addEventListener("change", (e) => {
        window.visionAI.setSimulatedScene(e.target.value);
      });
    }

    // Camera Mode switcher buttons (Obstacle / OCR / Environment)
    document.querySelectorAll(".cam-mode-btn").forEach(btn => {
      btn.addEventListener("click", () => {
        const mode = btn.getAttribute("data-mode");
        window.visionAI.setCameraMode(mode);
      });
    });

    // OCR Action buttons
    const btnOcrRead = document.getElementById("btn-ocr-read-now");
    if (btnOcrRead) {
      btnOcrRead.addEventListener("click", () => {
        if (window.ocrEngine) window.ocrEngine.readCurrentTextOnDemand();
      });
    }

    const btnOcrRepeat = document.getElementById("btn-ocr-repeat");
    if (btnOcrRepeat) {
      btnOcrRepeat.addEventListener("click", () => {
        if (window.ocrEngine) window.ocrEngine.repeatLastText();
      });
    }

    const btnOcrToggle = document.getElementById("btn-ocr-toggle");
    if (btnOcrToggle) {
      btnOcrToggle.addEventListener("click", () => {
        if (!window.ocrEngine) return;
        if (window.ocrEngine.isPaused) {
          window.ocrEngine.resume();
          btnOcrToggle.innerHTML = icon("pause") + " Pause";
        } else {
          window.ocrEngine.pause();
          btnOcrToggle.innerHTML = icon("play") + " Resume";
        }
      });
    }

    const simToggle = document.getElementById("setting-show-sim");
    if (simToggle) {
      simToggle.checked = localStorage.getItem("smartnav_sim") === "1";
      document.body.classList.toggle("show-sim", simToggle.checked);
      simToggle.addEventListener("change", (e) => {
        document.body.classList.toggle("show-sim", e.target.checked);
        localStorage.setItem("smartnav_sim", e.target.checked ? "1" : "0");
      });
    }

    // Scene description on-demand button
    const btnDescribeScene = document.getElementById("btn-describe-scene");
    if (btnDescribeScene) {
      btnDescribeScene.addEventListener("click", () => {
        this.describeCurrentScene();
      });
    }
  }

  showScreen(screenId) {
    console.log("Navigating to screen:", screenId);
    document.querySelectorAll(".app-screen").forEach(s => s.classList.remove("active"));
    const target = document.getElementById(screenId);
    if (target) {
      target.classList.add("active");
      this.currentScreen = screenId;
      window.scrollTo(0, 0);

      // On-screen entry hooks
      if (screenId === "screen-navigation") {
        this.resizeMapCanvas();
      } else if (screenId === "screen-obstacle-detection") {
        const vid = document.getElementById("obstacle-video");
        const can = document.getElementById("obstacle-canvas");
        window.visionAI.init(vid, can).then(() => window.visionAI.startCamera());
      }
      if (screenId !== "screen-obstacle-detection" && window.visionAI && window.visionAI.running) {
        window.visionAI.stopCamera();
        if (window.voiceEngine) window.voiceEngine.stopSpeaking();
      }

      if (screenId === "screen-destinations") {
        this.renderDestinationList();
      }

      if (screenId === "screen-buildings") {
        this.renderBuildingsList();
      }

      if (screenId === "screen-admin") {
        this.renderAdminPanel();
      }
    }
  }

  async loadBuilding(buildingId) {
    this.activeBuildingId = buildingId;
    let data = window.offlineStore.getBuildingData(buildingId);

    if (!data) {
      try {
        const res = await fetch(`/api/buildings/${buildingId}/full`);
        if (res.ok) {
          data = await res.json();
          window.offlineStore.saveBuildingData(buildingId, data);
        }
      } catch (e) {
        console.warn("Backend not reached, checking offline cache", e);
      }
    }

    if (data) {
      this.activeBuildingData = data;
      const bldName = data.building ? data.building.name : "Engineering College";
      document.querySelectorAll(".active-building-name").forEach(el => el.textContent = bldName);
      if (this.mapRenderer) {
        this.mapRenderer.setBuildingData(data);
      }
    }
  }

  initVoiceHook() {
    window.onVoiceStateChange = (active) => {
      const micBtn = document.getElementById("main-mic-button");
      const statusText = document.getElementById("voice-status-text");
      if (active) {
        if (micBtn) micBtn.classList.add("listening");
        if (statusText) statusText.textContent = window.i18n.get("voiceActive");
      } else {
        if (micBtn) micBtn.classList.remove("listening");
        if (statusText) statusText.textContent = "";
      }
    };

    window.onVoiceCommand = (rawText) => {
      this.processVoiceCommand(rawText);
    };
  }

  processVoiceCommand(command) {
    const text = command.toLowerCase().trim();
    console.log("Processing voice command:", text);

    // 1. Emergency Commands
    if (text.includes("emergency") || text.includes("danger") || text.includes("fire") || text.includes("help") || text.includes("bachao") || text.includes("aapaat")) {
      this.triggerEmergencyMode();
      return;
    }

    // 2. Language Switch Commands
    if (text.includes("hindi") || text.includes("हिंदी")) {
      this.switchLanguage("hi");
      return;
    }
    if (text.includes("telugu") || text.includes("తెలుగు")) {
      this.switchLanguage("te");
      return;
    }
    if (text.includes("english")) {
      this.switchLanguage("en");
      return;
    }

    // 3. Location Inquiry
    if (text.includes("where am i") || text.includes("my location") || text.includes("kahan hu") || text.includes("ekkadunnanu")) {
      this.announceCurrentLocation();
      return;
    }

    // 4. Smart Camera Modes Switching
    if (text.includes("obstacle mode") || text.includes("switch to obstacle")) {
      this.showScreen("screen-obstacle-detection");
      if (window.visionAI) window.visionAI.setCameraMode("obstacle");
      return;
    }
    if (text.includes("text mode") || text.includes("read mode") || text.includes("ocr mode") || text.includes("reading mode") || text.includes("switch to text")) {
      this.showScreen("screen-obstacle-detection");
      if (window.visionAI) window.visionAI.setCameraMode("ocr");
      return;
    }
    if (text.includes("environment mode") || text.includes("switch to environment")) {
      this.showScreen("screen-obstacle-detection");
      if (window.visionAI) window.visionAI.setCameraMode("environment");
      return;
    }

    // 5. OCR & Sign Reading Commands
    if (text.includes("read this sign") || text.includes("read sign") || text.includes("read everything") || text.includes("padho") || text.includes("chaduvu")) {
      this.showScreen("screen-obstacle-detection");
      if (window.ocrEngine) window.ocrEngine.readCurrentTextOnDemand();
      return;
    }
    if (text.includes("stop reading") || text.includes("pause reading")) {
      if (window.ocrEngine) window.ocrEngine.pause();
      return;
    }
    if (text.includes("resume reading") || text.includes("continue reading")) {
      if (window.ocrEngine) window.ocrEngine.resume();
      return;
    }
    if (text.includes("repeat sign") || text.includes("repeat text")) {
      if (window.ocrEngine) window.ocrEngine.repeatLastText();
      return;
    }

    // 6. Spatial Query & Scene Understanding Commands
    if (text.includes("describe what is in front of me") || text.includes("describe scene") || text.includes("what is in front of me") || text.includes("describe surroundings") || text.includes("scan surroundings")) {
      this.showScreen("screen-obstacle-detection");
      this.describeCurrentScene();
      return;
    }
    if (text.includes("is there an obstacle ahead") || text.includes("obstacle ahead") || text.includes("any obstacle")) {
      this.showScreen("screen-obstacle-detection");
      this.checkObstacleDirectlyAhead();
      return;
    }
    if (text.includes("tell me what is on my left") || text.includes("what is on my left") || text.includes("left side")) {
      this.showScreen("screen-obstacle-detection");
      this.describeSide("left");
      return;
    }
    if (text.includes("tell me what is on my right") || text.includes("what is on my right") || text.includes("right side")) {
      this.showScreen("screen-obstacle-detection");
      this.describeSide("right");
      return;
    }

    // 7. General Camera Activation
    if (text.includes("scan") || text.includes("camera") || text.includes("obstacle")) {
      this.showScreen("screen-obstacle-detection");
      window.voiceEngine.speak("Opening AI Obstacle Detection Camera. Point your phone forward.");
      return;
    }

    // 8. Repeat Turn Instruction
    if (text.includes("repeat instruction") || (text.includes("repeat") && this.currentScreen === "screen-navigation")) {
      this.repeatCurrentInstruction();
      return;
    }

    // 6. Navigation Control (Pause/Resume)
    if (text.includes("pause") || text.includes("stop guidance")) {
      this.pauseNavigation();
      return;
    }
    if (text.includes("resume") || text.includes("continue guidance")) {
      this.resumeNavigation();
      return;
    }

    // 7. Destination Matching (e.g. "Take me to Computer Lab 205", "Principal Office", "Washroom", "Library")
    if (this.activeBuildingData && this.activeBuildingData.nodes) {
      let matchedNode = null;

      // Extract destination keyword
      let cleanQuery = text.replace(/take me to|navigate to|go to|find|le chalo|vellu/gi, "").trim();

      for (const node of this.activeBuildingData.nodes) {
        const nName = node.name.toLowerCase();
        const nCode = (node.code || "").toLowerCase();

        if (nName.includes(cleanQuery) || cleanQuery.includes(nName) || (nCode && cleanQuery.includes(nCode))) {
          matchedNode = node;
          break;
        }
      }

      // Check facilities for general queries like "washroom", "restroom", "water"
      if (!matchedNode && (text.includes("washroom") || text.includes("restroom") || text.includes("toilet") || text.includes("shauchalay"))) {
        matchedNode = this.activeBuildingData.nodes.find(n => n.node_type === "facility" && n.id.includes("restroom"));
      }

      if (!matchedNode && (text.includes("water") || text.includes("drinking") || text.includes("paani"))) {
        matchedNode = this.activeBuildingData.nodes.find(n => n.node_type === "facility" && n.id.includes("water"));
      }

      if (matchedNode) {
        window.voiceEngine.speak(`Searching for ${matchedNode.name}. Calculating accessible route now.`);
        this.startNavigationTo(matchedNode.id);
        return;
      }
    }

    window.voiceEngine.speak(`Command heard: ${command}. If you want to navigate, say: Take me to, followed by the room name.`);
  }

  async startNavigationTo(destNodeId) {
    if (!this.activeBuildingData) return;

    const destNode = this.activeBuildingData.nodes.find(n => n.id === destNodeId);
    if (!destNode) return;

    this.selectedDestinationNode = destNode;

    // Determine starting node based on user's current estimated location
    const startNode = this.findNearestNodeToUser();
    const startNodeId = startNode ? startNode.id : "n_c_main_gate";

    window.voiceEngine.speak(window.i18n.get("recalculating"));

    // Route calculation (via Backend or local offline solver)
    let route = null;
    try {
      const resp = await fetch("/api/route", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          building_id: this.activeBuildingId,
          start_node_id: startNodeId,
          end_node_id: destNodeId,
          accessible_only: this.accessibleMode,
          avoid_blocked: true
        })
      });
      if (resp.ok) {
        route = await resp.json();
      }
    } catch (e) {
      console.warn("Backend unavailable, calculating offline route locally");
    }

    if (!route || !route.success) {
      // Offline fallback
      route = window.offlineStore.calculateLocalRoute(
        this.activeBuildingId, startNodeId, destNodeId, this.accessibleMode
      );
    }

    if (route && route.success) {
      this.activeRoute = route;
      this.currentInstructionIndex = 0;
      this.isNavPaused = false;

      this.showScreen("screen-navigation");
      this.updateNavigationUI();

      if (this.mapRenderer) {
        this.mapRenderer.setActiveRoute(route);
      }

      // Announce first instruction
      const firstInst = route.instructions[0];
      const speechText = this.getLocalizedInstruction(firstInst);
      window.voiceEngine.speak(speechText, true);
      window.voiceEngine.playTurnSound(firstInst.type);

      // Start distance sonar audio cues
      window.voiceEngine.startDistanceSonar(() => {
        return this.getDistanceToCurrentTarget();
      });
    } else {
      window.voiceEngine.speak("Unable to calculate a safe route to that destination. Please choose another location.");
    }
  }

  getLocalizedInstruction(inst) {
    if (!inst) return "";
    const lang = window.i18n.currentLang;
    if (lang === "hi" && inst.instruction_hi) return inst.instruction_hi;
    if (lang === "te" && inst.instruction_te) return inst.instruction_te;
    return inst.instruction;
  }

  updateNavigationUI() {
    if (!this.activeRoute || !this.activeRoute.instructions) return;

    const inst = this.activeRoute.instructions[this.currentInstructionIndex];
    if (!inst) return;

    // Direction Icon
    const iconEl = document.getElementById("nav-turn-icon");
    if (iconEl) {
      const names = { turn_left: "left", turn_right: "right", elevator: "elevator", stairs: "stairs", arrival: "flag" };
      iconEl.innerHTML = icon(names[inst.type] || "up");
    }

    // Direction Text
    const textEl = document.getElementById("nav-instruction-text");
    if (textEl) {
      textEl.textContent = this.getLocalizedInstruction(inst);
    }

    // Distance Meters
    const distEl = document.getElementById("nav-distance-text");
    if (distEl) {
      distEl.textContent = `${inst.distance_meters}m`;
    }

    // Step progress
    const stepEl = document.getElementById("nav-step-progress");
    if (stepEl) {
      stepEl.textContent = window.i18n.get("stepProgress", {
        curr: this.currentInstructionIndex + 1,
        total: this.activeRoute.instructions.length
      });
    }

    // Target Destination Banner
    const destNameEl = document.getElementById("nav-dest-name");
    if (destNameEl && this.selectedDestinationNode) {
      destNameEl.textContent = this.selectedDestinationNode.name;
    }
  }

  advanceStep() {
    if (!this.activeRoute || !this.activeRoute.instructions) return;
    if (this.currentInstructionIndex < this.activeRoute.instructions.length - 1) {
      this.currentInstructionIndex++;
      this.updateNavigationUI();

      const inst = this.activeRoute.instructions[this.currentInstructionIndex];
      const speechText = this.getLocalizedInstruction(inst);
      window.voiceEngine.speak(speechText, true);
      window.voiceEngine.playTurnSound(inst.type);

      if (inst.type === "arrival") {
        window.voiceEngine.stopDistanceSonar();
        this.saveHistoryRecord(this.selectedDestinationNode.name, this.activeRoute.total_distance_meters);
      }
    }
  }

  repeatCurrentInstruction() {
    if (!this.activeRoute || !this.activeRoute.instructions) return;
    const inst = this.activeRoute.instructions[this.currentInstructionIndex];
    if (inst) {
      const speechText = this.getLocalizedInstruction(inst);
      window.voiceEngine.speak(speechText, true);
      window.voiceEngine.playTurnSound(inst.type);
    }
  }

  pauseNavigation() {
    this.isNavPaused = true;
    window.voiceEngine.stopDistanceSonar();
    window.voiceEngine.speak(window.i18n.get("navPaused"));
    const btn = document.getElementById("nav-pause-btn");
    if (btn) btn.textContent = window.i18n.get("resume");
  }

  resumeNavigation() {
    this.isNavPaused = false;
    window.voiceEngine.startDistanceSonar(() => this.getDistanceToCurrentTarget());
    window.voiceEngine.speak(window.i18n.get("navResumed"));
    const btn = document.getElementById("nav-pause-btn");
    if (btn) btn.textContent = window.i18n.get("pause");
    this.repeatCurrentInstruction();
  }

  handleOffRoute(pos, deviationDist) {
    console.warn("Deviated from route! Recalculating...");
    window.voiceEngine.speak(window.i18n.get("wrongRouteDetected"), true);
    window.voiceEngine.playTone(400, 0.3, 0, "square");
    window.voiceEngine.vibrate([200, 100, 200]);

    if (this.selectedDestinationNode) {
      // Recalculate route from current position
      setTimeout(() => {
        this.startNavigationTo(this.selectedDestinationNode.id);
      }, 1000);
    }
  }

  async triggerEmergencyMode() {
    this.showScreen("screen-emergency");
    window.voiceEngine.playEmergencySiren();
    window.voiceEngine.speak(window.i18n.get("emergencyActive"), true);

    const userPos = window.positioningClient.currentPosition;
    try {
      const resp = await fetch("/api/emergency", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          building_id: this.activeBuildingId,
          current_floor_id: userPos.floor_id,
          current_x: userPos.x,
          current_y: userPos.y
        })
      });
      const data = await resp.json();
      if (data.success && data.data && data.data.route) {
        const exitName = data.data.exit_details.name;
        const exitMsg = window.i18n.get("exitGuidance", { exitName: exitName });
        setTimeout(() => window.voiceEngine.speak(exitMsg), 2500);

        const banner = document.getElementById("emergency-route-guidance");
        if (banner) {
          banner.textContent = `${exitName} • ${data.data.route.total_distance_meters}m ahead.`;
        }
      }
    } catch (e) {
      console.warn("Emergency API offline", e);
    }
  }

  findNearestNodeToUser() {
    if (!this.activeBuildingData || !this.activeBuildingData.nodes) return null;
    const pos = window.positioningClient.currentPosition;
    let closest = null;
    let minDist = Infinity;

    for (const n of this.activeBuildingData.nodes) {
      if (n.floor_id === pos.floor_id && n.is_blocked === 0) {
        const d = Math.hypot(n.x - pos.x, n.y - pos.y);
        if (d < minDist) {
          minDist = d;
          closest = n;
        }
      }
    }
    return closest;
  }

  getDistanceToCurrentTarget() {
    if (!this.activeRoute || !this.activeRoute.instructions) return null;
    const inst = this.activeRoute.instructions[this.currentInstructionIndex];
    if (!inst) return null;
    const pos = window.positioningClient.currentPosition;
    return Math.hypot(inst.target_x - pos.x, inst.target_y - pos.y);
  }

  announceCurrentLocation() {
    const nearestNode = this.findNearestNodeToUser();
    if (nearestNode) {
      const floor = (this.activeBuildingData.floors || []).find(f => f.id === nearestNode.floor_id);
      const floorName = floor ? floor.floor_name : "Current Floor";
      const locText = `You are near ${nearestNode.name} on ${floorName}. ${nearestNode.audio_description || ""}`;
      window.voiceEngine.speak(locText, true);
    } else {
      window.voiceEngine.speak("Estimating your location. Please hold the phone steady.");
    }
  }

  updateLocationBadge(pos) {
    const badge = document.getElementById("home-location-badge");
    if (badge) {
      const nearest = this.findNearestNodeToUser();
      const nodeName = nearest ? nearest.name : "Main Lobby";
      badge.innerHTML = icon("pin") + "<span></span>";
      badge.lastChild.textContent = ` ${nodeName} (${Math.round(pos.confidence * 100)}% accuracy)`;
    }
  }

  switchLanguage(lang) {
    window.i18n.setLanguage(lang);
    document.querySelectorAll(".lang-btn").forEach(b => {
      if (b.getAttribute("data-lang") === lang) b.classList.add("selected");
      else b.classList.remove("selected");
    });
    // Re-render UI labels
    this.refreshLocalizedStrings();
    window.voiceEngine.speak(window.i18n.get("welcomeSpeech"), true);
  }

  refreshLocalizedStrings() {
    document.querySelectorAll("[data-i18n]").forEach(el => {
      const key = el.getAttribute("data-i18n");
      el.textContent = window.i18n.get(key);
    });
    document.querySelectorAll("[data-i18n-aria]").forEach(el => {
      const key = el.getAttribute("data-i18n-aria");
      el.setAttribute("aria-label", window.i18n.get(key));
    });
  }

  renderDestinationList(filterQuery = "") {
    const container = document.getElementById("destinations-container");
    if (!container || !this.activeBuildingData || !this.activeBuildingData.nodes) return;

    container.innerHTML = "";
    const q = filterQuery.toLowerCase().trim();

    // Group nodes by category
    const validNodes = this.activeBuildingData.nodes.filter(n => n.node_type !== "corridor" && n.is_blocked === 0);

    const filtered = validNodes.filter(n => {
      return n.name.toLowerCase().includes(q) || (n.code && n.code.toLowerCase().includes(q));
    });

    if (filtered.length === 0) {
      container.innerHTML = `<p class="no-results">No destinations found matching "${filterQuery}". Try voice search.</p>`;
      return;
    }

    for (const node of filtered) {
      const card = document.createElement("button");
      card.className = "destination-card";
      card.setAttribute("aria-label", `${node.name}. Tap to start navigation.`);

      const kinds = { room: "door", facility: "users", elevator: "elevator", stairs: "stairs", exit: "siren" };
      const glyph = icon(kinds[node.node_type] || "pin");

      card.innerHTML = `
        <div class="dest-icon">${glyph}</div>
        <div class="dest-info">
          <div class="dest-title">${node.name}</div>
          <div class="dest-desc">${node.audio_description || node.code || ""}</div>
        </div>
        <div class="dest-action">Go ${icon("chevron")}</div>
      `;

      card.addEventListener("click", () => {
        this.startNavigationTo(node.id);
      });

      container.appendChild(card);
    }
  }

  filterDestinations(query) {
    this.renderDestinationList(query);
  }

  renderBuildingsList() {
    const container = document.getElementById("buildings-container");
    if (!container) return;
    container.innerHTML = `
      <button class="building-card active" onclick="window.app.selectBuilding('bld_college_01')">
        <div class="bld-icon">${icon("cap")}</div>
        <div class="bld-details">
          <h3>Apex Engineering College</h3>
          <p>4-story Academic Block • Labs, Elevators, Classrooms, Restrooms</p>
        </div>
        <span class="badge">Active</span>
      </button>
      <button class="building-card" onclick="window.app.selectBuilding('bld_hospital_02')">
        <div class="bld-icon">${icon("hospital")}</div>
        <div class="bld-details">
          <h3>CareCity Multi-Speciality Hospital</h3>
          <p>OPD, Emergency Trauma, Pharmacy, Diagnostics</p>
        </div>
      </button>
    `;
  }

  selectBuilding(buildingId) {
    this.loadBuilding(buildingId);
    window.voiceEngine.speak("Selected " + (buildingId.includes("college") ? "Engineering College" : "Hospital"));
    this.showScreen("screen-home");
  }

  renderAdminPanel() {
    const listEl = document.getElementById("admin-node-list");
    if (!listEl || !this.activeBuildingData || !this.activeBuildingData.nodes) return;

    listEl.innerHTML = "";
    for (const node of this.activeBuildingData.nodes) {
      if (node.node_type === "corridor" || node.node_type === "room") {
        const item = document.createElement("div");
        item.className = "admin-node-item";
        item.innerHTML = `
          <span>${node.name} (${node.code || node.id})</span>
          <button class="btn-toggle-block ${node.is_blocked ? 'blocked' : 'clear'}" onclick="window.app.toggleBlockNode('${node.id}')">
            ${node.is_blocked ? icon("ban") + " Blocked" : icon("check") + " Open"}
          </button>
        `;
        listEl.appendChild(item);
      }
    }
  }

  async toggleBlockNode(nodeId) {
    const node = this.activeBuildingData.nodes.find(n => n.id === nodeId);
    if (!node) return;
    const newState = !node.is_blocked;
    node.is_blocked = newState ? 1 : 0;

    await window.adminManager.toggleNodeBlockage(nodeId, !newState);
    this.renderAdminPanel();
    if (this.mapRenderer) this.mapRenderer.render();
    window.voiceEngine.speak(`${node.name} is now ${newState ? 'blocked' : 'unblocked'}.`);
  }

  resizeMapCanvas() {
    if (this.mapRenderer && this.mapRenderer.canvas) {
      const container = this.mapRenderer.canvas.parentElement;
      if (container) {
        this.mapRenderer.canvas.width = container.clientWidth || 360;
        this.mapRenderer.canvas.height = 280;
        this.mapRenderer.render();
      }
    }
  }

  saveHistoryRecord(toName, distance) {
    try {
      fetch("/api/navigation/history", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_id: this.userRole,
          building_id: this.activeBuildingId,
          from_name: "Start Location",
          to_name: toName,
          distance_meters: distance,
          duration_seconds: 120,
          status: "completed"
        })
      });
    } catch (e) {}
  }

  getLatestDetections() {
    const v = window.visionAI;
    if (!v) return [];
    if (v.running && !v.simulatedObstacleMode) return v.lastDetections || [];
    if (v.canvasElement) return v.generateSimulatedDetections(v.canvasElement.width, v.canvasElement.height);
    return [];
  }

  describeCurrentScene() {
    const objects = this.getLatestDetections();
    const signs = window.ocrEngine ? window.ocrEngine.recognizedSigns : [];
    const nearestNode = this.findNearestNodeToUser();
    
    if (window.sceneUnderstanding) {
      const description = window.sceneUnderstanding.synthesizeSceneDescription(objects, signs, nearestNode);
      window.voiceEngine.speak(description, true);

      const sceneBox = document.getElementById("scene-description-box");
      if (sceneBox) {
        sceneBox.textContent = description;
      }
    }
  }

  checkObstacleDirectlyAhead() {
    const objects = this.getLatestDetections();
    if (window.sceneUnderstanding) {
      const status = window.sceneUnderstanding.checkObstacleAhead(objects);
      window.voiceEngine.speak(status, true);
    }
  }

  describeSide(side) {
    const objects = this.getLatestDetections();
    if (window.sceneUnderstanding) {
      const description = side === "left" 
        ? window.sceneUnderstanding.describeLeft(objects)
        : window.sceneUnderstanding.describeRight(objects);
      window.voiceEngine.speak(description, true);
    }
  }
}

// Instantiate App
window.addEventListener("DOMContentLoaded", () => {
  window.app = new SmartNavApp();
  window.app.init();
});
