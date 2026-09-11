/* =========================================================
   AI MOOD — app.js
   Fases: cámara -> carga de modelos -> detección -> UI -> reto -> ranking
   ========================================================= */

const MODEL_URL = "https://cdn.jsdelivr.net/npm/@vladmandic/face-api/model";

const EMOTION_META = {
  happy:     { label: "FELICIDAD", emoji: "😄", color: "--happy",     sentiment: "🟢 Expresión positiva detectada.",  insight: "POSITIVA" },
  neutral:   { label: "NEUTRAL",   emoji: "😐", color: "--neutral",   sentiment: "⚪ Expresión neutra detectada.",     insight: "NEUTRA" },
  surprised: { label: "SORPRESA",  emoji: "😲", color: "--surprised", sentiment: "🟣 Expresión de sorpresa detectada.", insight: "ATENCIÓN ALTA" },
  sad:       { label: "TRISTEZA",  emoji: "😢", color: "--sad",       sentiment: "🔵 Expresión de tristeza detectada.", insight: "NEGATIVA" },
  angry:     { label: "ENOJO",     emoji: "😠", color: "--angry",     sentiment: "🔴 Expresión de enojo detectada.",   insight: "NEGATIVA" },
  disgusted: { label: "DISGUSTO",  emoji: "🤢", color: "--disgusted", sentiment: "🟠 Expresión de disgusto detectada.", insight: "NEGATIVA" },
  fearful:   { label: "TEMOR",     emoji: "😨", color: "--fearful",   sentiment: "🟣 Expresión de temor detectada.",   insight: "NEGATIVA" },
};

const els = {
  screens: {
    start: document.getElementById("screen-start"),
    loading: document.getElementById("screen-loading"),
    live: document.getElementById("screen-live"),
  },
  startBtn: document.getElementById("startBtn"),
  restartBtn: document.getElementById("restartBtn"),
  loadingLabel: document.getElementById("loadingLabel"),
  loadingFill: document.getElementById("loadingFill"),
  video: document.getElementById("video"),
  overlay: document.getElementById("overlay"),
  scanHudText: document.getElementById("scanHudText"),
  resultEmoji: document.getElementById("resultEmoji"),
  resultTitle: document.getElementById("resultTitle"),
  confidenceFill: document.getElementById("confidenceFill"),
  confidencePct: document.getElementById("confidencePct"),
  sentimentLine: document.getElementById("sentimentLine"),
  bars: document.getElementById("bars"),
  challenge: document.getElementById("challenge"),
  challengeCopy: document.getElementById("challengeCopy"),
  insightEmotion: document.getElementById("insightEmotion"),
  insightConfidence: document.getElementById("insightConfidence"),
  insightResponse: document.getElementById("insightResponse"),
  rankingList: document.getElementById("rankingList"),
  toast: document.getElementById("toast"),
  root: document.documentElement,
};

let detectionInterval = null;
let currentTarget = null; // reto activo: emoción objetivo
let lastDominant = null;
let stream = null;

function showScreen(name){
  Object.values(els.screens).forEach(s => s.classList.remove("active"));
  els.screens[name].classList.add("active");
}

function showToast(msg, ms = 2200){
  els.toast.textContent = msg;
  els.toast.classList.add("show");
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => els.toast.classList.remove("show"), ms);
}

/* ---------------- FASE 1+2: cámara + modelos ---------------- */

async function startFlow(){
  showScreen("loading");
  try{
    await loadModels();
    await startCamera();
    showScreen("live");
    startDetectionLoop();
    pickNewChallenge();
  }catch(err){
    console.error(err);
    els.loadingLabel.textContent = "No se pudo iniciar. Revisa permisos de cámara / conexión.";
    showToast("⚠️ " + (err.message || "Error al iniciar"));
  }
}

async function loadModels(){
  els.loadingLabel.textContent = "Cargando modelos de IA…";
  els.loadingFill.style.width = "10%";

  await faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL);
  els.loadingFill.style.width = "45%";

  await faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL);
  els.loadingFill.style.width = "70%";

  await faceapi.nets.faceExpressionNet.loadFromUri(MODEL_URL);
  els.loadingFill.style.width = "100%";
}

async function startCamera(){
  els.loadingLabel.textContent = "Solicitando acceso a la cámara…";
  stream = await navigator.mediaDevices.getUserMedia({
    video: { facingMode: "user" },
    audio: false,
  });
  els.video.srcObject = stream;
  await new Promise(resolve => {
    els.video.onloadedmetadata = () => resolve();
  });
  els.overlay.width = els.video.videoWidth || 640;
  els.overlay.height = els.video.videoHeight || 480;
}

function stopCamera(){
  if (stream){
    stream.getTracks().forEach(t => t.stop());
    stream = null;
  }
}

/* ---------------- FASE 3: detección ---------------- */

function startDetectionLoop(){
  const ctx = els.overlay.getContext("2d");
  const options = new faceapi.TinyFaceDetectorOptions({ inputSize: 224, scoreThreshold: 0.5 });

  detectionInterval = setInterval(async () => {
    if (els.video.readyState < 2) return;

    const result = await faceapi
      .detectSingleFace(els.video, options)
      .withFaceLandmarks()
      .withFaceExpressions();

    ctx.clearRect(0, 0, els.overlay.width, els.overlay.height);

    if (!result){
      els.scanHudText.textContent = "DETECTANDO ROSTRO";
      els.sentimentLine.textContent = "Esperando rostro…";
      return;
    }

    els.scanHudText.textContent = "ROSTRO DETECTADO";

    const box = result.detection.box;
    ctx.strokeStyle = "rgba(234,241,247,0.8)";
    ctx.lineWidth = 2;
    ctx.strokeRect(box.x, box.y, box.width, box.height);

    renderExpressions(result.expressions);
  }, 200);
}

/* ---------------- FASE 4: interfaz WOW ---------------- */

function renderExpressions(expressions){
  const sorted = Object.entries(expressions).sort((a, b) => b[1] - a[1]);
  const [dominantKey, dominantScore] = sorted[0];
  const meta = EMOTION_META[dominantKey] || EMOTION_META.neutral;
  const pct = Math.round(dominantScore * 100);

  if (dominantKey !== lastDominant){
    els.resultEmoji.classList.remove("pulse");
    void els.resultEmoji.offsetWidth; // reflow para relanzar animación
    els.resultEmoji.classList.add("pulse");
    lastDominant = dominantKey;
  }

  els.resultEmoji.textContent = meta.emoji;
  els.resultTitle.textContent = meta.label;
  els.resultTitle.style.color = `var(${meta.color})`;
  els.confidenceFill.style.width = pct + "%";
  els.confidenceFill.style.background = `var(${meta.color})`;
  els.confidencePct.textContent = pct + "%";
  els.sentimentLine.textContent = meta.sentiment;
  els.root.style.setProperty("--accent", `var(${meta.color})`);

  renderBars(sorted);
  renderInsight(meta, pct);
  checkChallenge(dominantKey, dominantScore);
}

function renderBars(sorted){
  els.bars.innerHTML = "";
  sorted.forEach(([key, score]) => {
    const meta = EMOTION_META[key];
    if (!meta) return;
    const pct = Math.round(score * 100);
    const row = document.createElement("div");
    row.className = "bar-row";
    row.innerHTML = `
      <span>${meta.emoji} ${meta.label.charAt(0)}${meta.label.slice(1).toLowerCase()}</span>
      <span class="bar-track"><span class="bar-fill" style="width:${pct}%; background:var(${meta.color})"></span></span>
      <span class="bar-pct">${pct}%</span>
    `;
    els.bars.appendChild(row);
  });
}

function renderInsight(meta, pct){
  els.insightEmotion.textContent = `${meta.emoji} ${meta.label}`;
  els.insightConfidence.textContent = pct + "%";
  els.insightResponse.textContent = meta.insight;
}

/* ---------------- FASE 7: modo reto ---------------- */

function pickNewChallenge(){
  const keys = Object.keys(EMOTION_META).filter(k => k !== "neutral");
  currentTarget = keys[Math.floor(Math.random() * keys.length)];
  const meta = EMOTION_META[currentTarget];
  els.challenge.classList.add("active");
  els.challengeCopy.innerHTML = `Intenta llegar a <strong>${meta.emoji} ${meta.label.toLowerCase()}</strong> — la IA te está observando.`;
}

function checkChallenge(dominantKey, score){
  if (!currentTarget) return;
  if (dominantKey === currentTarget && score > 0.80){
    const meta = EMOTION_META[currentTarget];
    showToast(`🎉 ¡Lo lograste! Detectó ${meta.label.toLowerCase()} al ${Math.round(score*100)}%`);
    saveToRanking(currentTarget, score);
    currentTarget = null;
    els.challenge.classList.remove("active");
    setTimeout(pickNewChallenge, 2500);
  }
}

/* ---------------- FASE 8: ranking local ---------------- */

function saveToRanking(key, score){
  const meta = EMOTION_META[key];
  const list = JSON.parse(localStorage.getItem("aimood_ranking") || "[]");
  list.push({ emoji: meta.emoji, pct: Math.round(score * 100) });
  list.sort((a, b) => b.pct - a.pct);
  localStorage.setItem("aimood_ranking", JSON.stringify(list.slice(0, 5)));
  renderRanking();
}

function renderRanking(){
  const list = JSON.parse(localStorage.getItem("aimood_ranking") || "[]");
  els.rankingList.innerHTML = "";
  const medals = ["🥇", "🥈", "🥉", "4.", "5."];
  list.forEach((item, i) => {
    const li = document.createElement("li");
    li.textContent = `${medals[i] || (i+1)+"."} ${item.emoji} ${item.pct}%`;
    els.rankingList.appendChild(li);
  });
}

/* ---------------- controles ---------------- */

els.startBtn.addEventListener("click", startFlow);

els.restartBtn.addEventListener("click", () => {
  clearInterval(detectionInterval);
  stopCamera();
  lastDominant = null;
  currentTarget = null;
  showScreen("start");
});

renderRanking();
