/**
 * Smart Indoor Navigation System - Advanced AI Scene Understanding Engine
 * Synthesizes holistic scene descriptions by fusing detected objects, spatial positions,
 * pathway intersection analysis, and indoor building floor plan knowledge.
 */

class SceneUnderstandingEngine {
  constructor() {
    this.lastSceneDescription = "";
    this.lastDescriptionTime = 0;
  }

  /**
   * Generates a coherent, natural scene description from all visual cues
   * @param {Array} objects - List of detected objects with positions and distances
   * @param {Array} signs - List of OCR detected text / signboards
   * @param {Object} buildingContext - Nearest room node, current floor, active building
   */
  synthesizeSceneDescription(objects = [], signs = [], buildingContext = null) {
    const lang = window.i18n ? window.i18n.currentLang : "en";
    const objectTypes = objects.map(o => o.type || o.label.toLowerCase());
    
    // Categorize objects by horizontal location
    const leftObjects = objects.filter(o => o.position === "left");
    const centerObjects = objects.filter(o => o.position === "center");
    const rightObjects = objects.filter(o => o.position === "right");
    const pathBlockedObjects = objects.filter(o => o.intersectsPath);

    let environmentType = "indoor space";
    if (buildingContext && buildingContext.node_type) {
      if (buildingContext.node_type === "corridor") environmentType = "corridor";
      else if (buildingContext.name.toLowerCase().includes("lab")) environmentType = "laboratory";
      else if (buildingContext.name.toLowerCase().includes("hall") || buildingContext.name.toLowerCase().includes("classroom")) environmentType = "classroom";
      else if (buildingContext.name.toLowerCase().includes("reception") || buildingContext.name.toLowerCase().includes("lobby")) environmentType = "reception lobby";
      else if (buildingContext.name.toLowerCase().includes("library")) environmentType = "library";
    }

    // Infer environment from visual objects if not from building context
    if (environmentType === "indoor space") {
      if (objectTypes.includes("chair") && objectTypes.includes("desk")) environmentType = "classroom";
      else if (objectTypes.includes("door") && objectTypes.length <= 3) environmentType = "corridor";
      else if (objectTypes.includes("bed") || objectTypes.includes("sofa")) environmentType = "lounge";
      else if (objectTypes.includes("stairs")) environmentType = "staircase area";
    }

    let sentences = [];

    // 1. Primary Environmental Heading
    if (lang === "hi") {
      if (environmentType === "corridor") sentences.push("आप एक गलियारे (कॉरिडोर) में हैं।");
      else if (environmentType === "classroom") sentences.push("आप एक कक्षा या अध्ययन कक्ष में हैं।");
      else if (environmentType === "laboratory") sentences.push("आप एक प्रयोगशाला (लैब) में हैं।");
      else if (environmentType === "reception lobby") sentences.push("आप मुख्य रिसेप्शन लॉबी में हैं।");
      else sentences.push("आप भवन के अंदर हैं।");
    } else if (lang === "te") {
      if (environmentType === "corridor") sentences.push("మీరు కారిడార్‌లో ఉన్నారు.");
      else if (environmentType === "classroom") sentences.push("మీరు ఒక తరగతి గదిలో ఉన్నారు.");
      else if (environmentType === "laboratory") sentences.push("మీరు ప్రయోగశాలలో ఉన్నారు.");
      else if (environmentType === "reception lobby") sentences.push("మీరు రిసెప్షన్ లాబీలో ఉన్నారు.");
      else sentences.push("మీరు భవనం లోపల ఉన్నారు.");
    } else {
      if (environmentType === "corridor") sentences.push("You are in a corridor.");
      else if (environmentType === "classroom") sentences.push("You are in a classroom.");
      else if (environmentType === "laboratory") sentences.push("You are in a laboratory.");
      else if (environmentType === "reception lobby") sentences.push("You are in the main reception lobby.");
      else sentences.push("You are inside the building.");
    }

    // 2. Pathway Status & Obstacles
    if (pathBlockedObjects.length > 0) {
      const obstacleNames = pathBlockedObjects.map(o => o.label).join(" and ");
      const closestDist = Math.min(...pathBlockedObjects.map(o => o.distance));
      if (lang === "hi") {
        sentences.push(`सावधान! आपके चलने के रास्ते में लगभग ${closestDist} मीटर आगे ${obstacleNames} है।`);
      } else if (lang === "te") {
        sentences.push(`హెచ్చరిక! మీ నడక దారిలో సుమారు ${closestDist} మీటర్ల ముందు ${obstacleNames} అడ్డంకిగా ఉంది.`);
      } else {
        sentences.push(`Warning: The pathway is partially obstructed by ${obstacleNames} approximately ${closestDist} meters ahead.`);
      }
    } else if (objects.length === 0) {
      if (lang === "hi") sentences.push("सामने का रास्ता पूरी तरह साफ दिख रहा है।");
      else if (lang === "te") sentences.push("ముందు నడక దారి స్పష్టంగా ఉంది.");
      else sentences.push("The walking pathway ahead appears completely clear.");
    } else {
      if (lang === "hi") sentences.push("सीधा रास्ता चलने के लिए खुला है।");
      else if (lang === "te") sentences.push("నేరుగా నడిచే దారి అందుబాటులో ఉంది.");
      else sentences.push("The central walking path is open.");
    }

    // 3. Side & Peripheral Objects
    if (leftObjects.length > 0) {
      const lName = leftObjects[0].label;
      const lDist = leftObjects[0].distance;
      if (lang === "hi") sentences.push(`बाईं तरफ ${lDist} मीटर पर ${lName} है।`);
      else if (lang === "te") sentences.push(`ఎడమవైపు ${lDist} మీటర్ల దూరంలో ${lName} ఉంది.`);
      else sentences.push(`On your left, there is a ${lName} about ${lDist} meters away.`);
    }

    if (rightObjects.length > 0) {
      const rName = rightObjects[0].label;
      const rDist = rightObjects[0].distance;
      if (lang === "hi") sentences.push(`दाईं तरफ ${rDist} मीटर पर ${rName} है।`);
      else if (lang === "te") sentences.push(`కుడివైపు ${rDist} మీటర్ల దూరంలో ${rName} ఉంది.`);
      else sentences.push(`On your right, there is a ${rName} about ${rDist} meters away.`);
    }

    // 4. Visible Signboard / OCR Information
    if (signs && signs.length > 0) {
      const s = signs[0];
      if (lang === "hi") sentences.push(`आगे एक बोर्ड है जिस पर लिखा है: ${s.cleanText}।`);
      else if (lang === "te") sentences.push(`ముందు ఉన్న సైన్ బోర్డు పై "${s.cleanText}" అని ఉంది.`);
      else sentences.push(`There is a sign ahead that says: "${s.cleanText}".`);
    }

    const fullDescription = sentences.join(" ");
    this.lastSceneDescription = fullDescription;
    this.lastDescriptionTime = Date.now();
    return fullDescription;
  }

  describeLeft(objects) {
    const lefts = objects.filter(o => o.position === "left");
    if (lefts.length === 0) {
      return window.i18n.currentLang === "hi" ? "आपकी बाईं तरफ कोई स्पष्ट वस्तु नहीं है।" :
             window.i18n.currentLang === "te" ? "మీ ఎడమవైపు ఏ వస్తువులూ కనిపించడం లేదు." :
             "There are no prominent objects detected on your left.";
    }
    const names = lefts.map(o => `${o.label} approximately ${o.distance} meters away`).join(", ");
    return `On your left: ${names}.`;
  }

  describeRight(objects) {
    const rights = objects.filter(o => o.position === "right");
    if (rights.length === 0) {
      return window.i18n.currentLang === "hi" ? "आपकी दाईं तरफ कोई वस्तु नहीं है।" :
             window.i18n.currentLang === "te" ? "మీ కుడివైపు ఏ వస్తువులూ లేవు." :
             "There are no prominent objects detected on your right.";
    }
    const names = rights.map(o => `${o.label} approximately ${o.distance} meters away`).join(", ");
    return `On your right: ${names}.`;
  }

  checkObstacleAhead(objects) {
    const inPath = objects.filter(o => o.intersectsPath || o.position === "center");
    if (inPath.length === 0) {
      return window.i18n.currentLang === "hi" ? "रास्ता साफ है। आगे कोई बाधा नहीं है।" :
             window.i18n.currentLang === "te" ? "దారి స్పష్టంగా ఉంది. ముందు ఎలాంటి అడ్డంకులు లేవు." :
             "The pathway is clear. There are no immediate obstacles directly ahead.";
    }
    const closest = inPath.reduce((min, o) => o.distance < min.distance ? o : min, inPath[0]);
    return window.i18n.currentLang === "hi" ? `चेतावनी: आगे लगभग ${closest.distance} मीटर पर ${closest.label} है।` :
           window.i18n.currentLang === "te" ? `హెచ్చరిక: ముందు సుమారు ${closest.distance} మీటర్లలో ${closest.label} ఉంది.` :
           `Warning: ${closest.label} detected approximately ${closest.distance} meters directly ahead in your walking path.`;
  }
}

window.sceneUnderstanding = new SceneUnderstandingEngine();
