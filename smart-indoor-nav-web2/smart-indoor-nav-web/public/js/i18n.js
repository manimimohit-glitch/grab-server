/**
 * Smart Indoor Navigation System - Multilingual Dictionary
 * Complete localization support for English (en), Hindi (hi), and Telugu (te).
 */

const I18N = {
  en: {
    appName: "SMART INDOOR NAV",
    tagline: "Navigate Independently. Move Confidently.",
    welcomeSpeech: "Welcome to Smart Indoor Nav. Your accessible indoor navigation assistant. Tap the microphone or say a command.",
    
    // Nav items & dashboard
    startNav: "Start Navigation",
    findDest: "Find a Destination",
    scanSurround: "Scan Surroundings",
    emergencyMode: "Emergency Mode",
    myLocation: "My Location",
    buildings: "Available Buildings",
    history: "Navigation History",
    settings: "Accessibility Settings",
    admin: "Admin Dashboard",
    
    // Voice prompt
    listeningPrompt: "Listening for voice command... (e.g., 'Take me to Computer Lab 205', 'Emergency', 'Where am I')",
    voiceActive: "Voice Recognition Active",
    micBtnAria: "Microphone Button. Double tap or click to activate voice commands.",
    
    // Actions & buttons
    back: "Back",
    continue: "Continue",
    guestLogin: "Continue as Guest",
    login: "Log In",
    register: "Create Account",
    repeatInstruction: "Repeat Instruction",
    pause: "Pause Guidance",
    resume: "Resume Guidance",
    recalculate: "Recalculate Route",
    cancelNav: "End Navigation",
    save: "Save Settings",
    tutorial: "Play Audio Tutorial",
    
    // Directions & Navigation
    walkStraight: "Walk straight for {meters} meters",
    turnLeft: "Turn left in {meters} meters",
    turnRight: "Turn right in {meters} meters",
    uTurn: "Make a U-turn",
    takeElevator: "Take elevator to {floor}",
    takeStairs: "Take stairs to {floor}",
    reachedDest: "You have reached your destination: {dest}",
    wrongRouteDetected: "You are moving away from your route. Recalculating alternative route now.",
    recalculating: "Recalculating route...",
    navPaused: "Navigation paused.",
    navResumed: "Navigation resumed.",
    stepProgress: "Step {curr} of {total}",
    
    // Obstacle Detection
    obstacleDetected: "Caution: Obstacle detected {dist} meters ahead.",
    stairsAhead: "Caution: Stairs detected ahead. Please proceed carefully with handrail.",
    personAhead: "Person detected in pathway.",
    doorAhead: "Doorway detected ahead.",
    pathBlocked: "Pathway appears blocked.",
    clearPath: "Pathway clear.",
    
    // Emergency
    emergencyActive: "Emergency mode activated. Locating nearest verified safe exit.",
    emergencyDisclaimer: "Safety Notice: Follow official building emergency announcements and trained personnel. This system does not replace building alarms.",
    exitGuidance: "Evacuate toward: {exitName}. Follow turn-by-turn guidance immediately.",
    
    // Location & Positioning
    accuracyHigh: "High Location Accuracy (3+ Beacons)",
    accuracyMedium: "Moderate Location Accuracy",
    accuracyLow: "Low Accuracy: Single beacon signal. Proceed carefully.",
    currentPos: "Current Location: {loc}",
    
    // Settings labels
    speechRate: "Voice Speed",
    speechPitch: "Voice Pitch",
    speechVolume: "Voice Volume",
    vibrationFeedback: "Vibration Alerts",
    highContrast: "High Contrast Theme",
    avoidStairs: "Avoid Stairs (Accessible / Wheelchair Mode)",
    offlineMaps: "Offline Map Downloads",
    
    // Speech synthesis language code
    langCode: "en-US"
  },

  hi: {
    appName: "स्मार्ट इंडोर नैव (Smart Indoor Nav)",
    tagline: "आत्मनिर्भरता से चलें। पूरे विश्वास से बढ़ें।",
    welcomeSpeech: "स्मार्ट इंडोर नैव में आपका स्वागत है। आपका सुलभ इंडोर नेविगेशन सहायक। माइक दबाएं या बोलें।",
    
    startNav: "नेविगेशन शुरू करें",
    findDest: "गंतव्य खोजें",
    scanSurround: "आसपास स्कैन करें",
    emergencyMode: "आपातकालीन मोड (Emergency)",
    myLocation: "मेरा वर्तमान स्थान",
    buildings: "उपलब्ध इमारतें",
    history: "नेविगेशन इतिहास",
    settings: "सुलभता सेटिंग्स",
    admin: "व्यवस्थापक डैशबोर्ड",
    
    listeningPrompt: "आवाज़ सुन रहे हैं... (जैसे: 'कंप्यूटर लैब 205 ले चलो', 'आपातकाल', 'मैं कहाँ हूँ')",
    voiceActive: "वॉइस रिकग्निशन सक्रिय",
    micBtnAria: "माइक बटन। वॉइस कमांड देने के लिए क्लिक करें।",
    
    back: "पीछे जाएं",
    continue: "आगे बढ़ें",
    guestLogin: "अतिथि के रूप में जारी रखें",
    login: "लॉग इन",
    register: "खाता बनाएं",
    repeatInstruction: "निर्देश दोहराएं",
    pause: "रोकें",
    resume: "पुनः शुरू करें",
    recalculate: "नया रास्ता निकालें",
    cancelNav: "नेविगेशन समाप्त करें",
    save: "सेटिंग्स सहेजें",
    tutorial: "ऑडियो ट्यूटोरियल सुनें",
    
    walkStraight: "{meters} मीटर सीधे चलें",
    turnLeft: "{meters} मीटर में बाएं मुड़ें",
    turnRight: "{meters} मीटर में दाएं मुड़ें",
    uTurn: "वापस घूमें (U-turn)",
    takeElevator: "लिफ्ट से {floor} पर जाएं",
    takeStairs: "सीढ़ियों से {floor} पर जाएं",
    reachedDest: "आप अपने गंतव्य {dest} पर पहुंच गए हैं।",
    wrongRouteDetected: "आप अपने रास्ते से भटक रहे हैं। नया रास्ता खोजा जा रहा है।",
    recalculating: "रास्ता पुनः गणना किया जा रहा है...",
    navPaused: "नेविगेशन रोक दिया गया है।",
    navResumed: "नेविगेशन फिर से चालू है।",
    stepProgress: "कदम {curr} कुल {total} में से",
    
    obstacleDetected: "सावधान: {dist} मीटर आगे बाधा का पता चला है।",
    stairsAhead: "सावधान: आगे सीढ़ियां हैं। कृपया रेलिंग पकड़कर सावधानी से चलें।",
    personAhead: "रास्ते में व्यक्ति का पता चला है।",
    doorAhead: "आगे दरवाज़ा है।",
    pathBlocked: "रास्ता अवरुद्ध प्रतीत होता है।",
    clearPath: "रास्ता साफ है।",
    
    emergencyActive: "आपातकालीन मोड सक्रिय। निकटतम सुरक्षित निकास खोजा जा रहा है।",
    emergencyDisclaimer: "सुरक्षा सूचना: आधिकारिक आपातकालीन घोषणाओं का पालन करें। यह सिस्टम बिल्डिंग अलार्म का विकल्प नहीं है।",
    exitGuidance: "{exitName} की ओर तुरंत निकलें। निर्देशों का पालन करें।",
    
    accuracyHigh: "उच्च स्थान सटीकता (3+ बीकन)",
    accuracyMedium: "मध्यम स्थान सटीकता",
    accuracyLow: "कम सटीकता: केवल एक बीकन सिग्नल। सावधानी से चलें।",
    currentPos: "वर्तमान स्थान: {loc}",
    
    speechRate: "आवाज़ की गति",
    speechPitch: "आवाज़ का सुर",
    speechVolume: "आवाज़ का स्तर",
    vibrationFeedback: "कंपन अलर्ट (Vibration)",
    highContrast: "उच्च कंट्रास्ट थीम",
    avoidStairs: "सीढ़ियों से बचें (सुलभ मोड)",
    offlineMaps: "ऑफ़लाइन मैप डाउनलोड",
    
    langCode: "hi-IN"
  },

  te: {
    appName: "స్మార్ట్ ఇండోర్ నావ్ (Smart Indoor Nav)",
    tagline: "స్వతంత్రంగా నావిగేట్ చేయండి. నమ్మకంతో అడుగు వేయండి.",
    welcomeSpeech: "స్మార్ట్ ఇండోర్ నావ్ కు స్వాగతం. మీ అందుబాటులో ఉండే ఇండోర్ మార్గదర్శి. మైక్రోఫోన్ నొక్కి మాట్లాడండి.",
    
    startNav: "నావిగేషన్ ప్రారంభించండి",
    findDest: "గమ్యాన్ని కనుగొనండి",
    scanSurround: "పరిసరాలను స్కాన్ చేయండి",
    emergencyMode: "అత్యవసర మోడ్ (Emergency)",
    myLocation: "నా ప్రస్తుత ప్రదేశం",
    buildings: "అందుబాటులో ఉన్న భవనాలు",
    history: "నావిగేషన్ చరిత్ర",
    settings: "సౌలభ్య సెట్టింగ్‌లు",
    admin: "అడ్మిన్ డాష్‌బోర్డ్",
    
    listeningPrompt: "వాయిస్ కమాండ్ వింటున్నాము... (ఉదాహరణ: 'కంప్యూటర్ ల్యాబ్ 205 కు తీసుకెళ్లు', 'ఎమర్జెన్సీ')",
    voiceActive: "వాయిస్ రికగ్నిషన్ ఆన్‌లో ఉంది",
    micBtnAria: "మైక్రోఫోన్ బటన్. వాయిస్ ఆదేశాల కోసం క్లిక్ చేయండి.",
    
    back: "వెనుకకు",
    continue: "కొనసాగించండి",
    guestLogin: "గెస్ట్‌గా కొనసాగండి",
    login: "లాగిన్",
    register: "ఖాతా సృష్టించండి",
    repeatInstruction: "సూచన మళ్లీ చెప్పండి",
    pause: "ఆపండి",
    resume: "తిరిగి ప్రారంభించండి",
    recalculate: "మరో మార్గం లెక్కించండి",
    cancelNav: "నావిగేషన్ ముగించండి",
    save: "సెట్టింగులు భద్రపరచండి",
    tutorial: "ఆడియో ట్యుటోరియల్ వినండి",
    
    walkStraight: "{meters} మీటర్లు నేరుగా నడవండి",
    turnLeft: "{meters} మీటర్ల దూరంలో ఎడమవైపు తిరగండి",
    turnRight: "{meters} మీటర్ల దూరంలో కుడివైపు తిరగండి",
    uTurn: "వెనక్కి తిరగండి (U-turn)",
    takeElevator: "లిఫ్ట్ ద్వారా {floor} కు వెళ్లండి",
    takeStairs: "మెట్ల ద్వారా {floor} కు వెళ్లండి",
    reachedDest: "మీరు మీ గమ్యం {dest} కు చేరుకున్నారు.",
    wrongRouteDetected: "మీరు తప్పుడు మార్గంలో వెళ్తున్నారు. ప్రత్యామ్నాయ మార్గాన్ని లెక్కిస్తున్నాము.",
    recalculating: "మార్గాన్ని మళ్లీ లెక్కిస్తున్నాము...",
    navPaused: "నావిగేషన్ తాత్కాలికంగా ఆపబడింది.",
    navResumed: "నావిగేషన్ కొనసాగుతోంది.",
    stepProgress: "దశ {curr} / మొత్తం {total}",
    
    obstacleDetected: "హెచ్చరిక: {dist} మీటర్ల ముందు అడ్డంకి గుర్తించబడింది.",
    stairsAhead: "హెచ్చరిక: ముందు మెట్లు ఉన్నాయి. దయచేసి హ్యాండ్‌రైల్‌తో జాగ్రత్తగా వెళ్ళండి.",
    personAhead: "ముందు దారిలో వ్యక్తి ఉన్నారు.",
    doorAhead: "ముందు తలుపు ఉంది.",
    pathBlocked: "దారి మూసివేయబడినట్లు కనిపిస్తోంది.",
    clearPath: "దారి స్పష్టంగా ఉంది.",
    
    emergencyActive: "అత్యవసర మోడ్ ఆన్ చేయబడింది. సమీప సురక్షిత నిష్క్రమణను వెతుకుతున్నాము.",
    emergencyDisclaimer: "భద్రతా సూచన: అధికారిక భవన అత్యవసర ప్రకటనలను పాటించండి. ఇది అలారానికి ప్రత్యామ్నాయం కాదు.",
    exitGuidance: "{exitName} వైపు త్వరగా వెళ్లండి. సూచనలను పాటించండి.",
    
    accuracyHigh: "అధిక ఖచ్చితత్వం (3+ బీకన్లు)",
    accuracyMedium: "మధ్యస్థ ఖచ్చితత్వం",
    accuracyLow: "తక్కువ ఖచ్చితత్వం: ఒకే బీకన్ సిగ్నల్. జాగ్రత్తగా నడవండి.",
    currentPos: "ప్రస్తుత ప్రదేశం: {loc}",
    
    speechRate: "వాయిస్ వేగం",
    speechPitch: "వాయిస్ పిచ్",
    speechVolume: "వాయిస్ సౌండ్",
    vibrationFeedback: "వైబ్రేషన్ హెచ్చరికలు",
    highContrast: "హై కాంట్రాస్ట్ థీమ్",
    avoidStairs: "మెట్లు నివారించండి (వీల్‌చైర్/యాక్సెసిబుల్ మోడ్)",
    offlineMaps: "ఆఫ్‌లైన్ మ్యాప్ డౌన్‌లోడ్లు",
    
    langCode: "te-IN"
  }
};

class TranslationManager {
  constructor() {
    this.currentLang = localStorage.getItem("smartnav_lang") || "en";
  }

  setLanguage(lang) {
    if (I18N[lang]) {
      this.currentLang = lang;
      localStorage.setItem("smartnav_lang", lang);
      document.documentElement.lang = lang;
      return true;
    }
    return false;
  }

  get(key, params = {}) {
    const dict = I18N[this.currentLang] || I18N.en;
    let text = dict[key] || I18N.en[key] || key;
    for (const [k, v] of Object.entries(params)) {
      text = text.replace(new RegExp(`\\{${k}\\}`, "g"), v);
    }
    return text;
  }

  getLangCode() {
    const dict = I18N[this.currentLang] || I18N.en;
    return dict.langCode || "en-US";
  }
}

window.i18n = new TranslationManager();
