const state = {
  videoFile: null,
  imageFile: null,
  operations: [],
  outputUrl: null,
  lastPlanSummary: "",
};

const els = {
  videoInput: document.querySelector("#videoInput"),
  imageInput: document.querySelector("#imageInput"),
  videoPreview: document.querySelector("#videoPreview"),
  emptyState: document.querySelector("#emptyState"),
  promptInput: document.querySelector("#promptInput"),
  parseButton: document.querySelector("#parseButton"),
  renderButton: document.querySelector("#renderButton"),
  micButton: document.querySelector("#micButton"),
  clearButton: document.querySelector("#clearButton"),
  planList: document.querySelector("#planList"),
  statusText: document.querySelector("#statusText"),
  downloadLink: document.querySelector("#downloadLink"),
  quickPrompts: document.querySelector(".quick-prompts"),
};

const FILTERS = [
  {
    keys: ["czarno bialy", "czarnobialy", "black white", "grayscale", "mono"],
    label: "filtr czarno-bialy",
    ffmpeg: "format=gray",
  },
  {
    keys: ["sepia", "stary film", "retro", "vintage"],
    label: "filtr sepia",
    ffmpeg: "colorchannelmixer=.393:.769:.189:0:.349:.686:.168:0:.272:.534:.131",
  },
  {
    keys: ["rozjasnij", "jasniej", "jasny"],
    label: "rozjasnienie",
    ffmpeg: "eq=brightness=0.08:saturation=1.08",
  },
  {
    keys: ["przyciemnij", "ciemniej", "ciemny"],
    label: "lekkie przyciemnienie",
    ffmpeg: "eq=brightness=-0.06:saturation=1.05",
  },
  {
    keys: ["kontrast", "wiekszy kontrast"],
    label: "wiekszy kontrast",
    ffmpeg: "eq=contrast=1.25:saturation=1.05",
  },
  {
    keys: ["cieply", "cieple kolory", "ociepl"],
    label: "cieple kolory",
    ffmpeg: "colorbalance=rs=.12:gs=.03:bs=-.08",
  },
  {
    keys: ["zimny", "zimne kolory", "ochlodz"],
    label: "zimne kolory",
    ffmpeg: "colorbalance=rs=-.07:gs=.01:bs=.12",
  },
  {
    keys: ["kinowy", "filmowy", "cinematic"],
    label: "efekt kinowy",
    ffmpeg: "eq=contrast=1.18:saturation=1.12:brightness=-0.03,vignette=PI/5",
  },
  {
    keys: ["blur", "rozmyj", "rozmycie"],
    label: "rozmycie",
    ffmpeg: "boxblur=2:1",
  },
  {
    keys: ["wyostrz", "ostrosc", "sharp"],
    label: "wyostrzenie",
    ffmpeg: "unsharp=5:5:0.9",
  },
];

const NUMBER_WORDS = new Map([
  ["zero", 0],
  ["jeden", 1],
  ["jedna", 1],
  ["jedno", 1],
  ["dwa", 2],
  ["dwie", 2],
  ["trzy", 3],
  ["cztery", 4],
  ["piec", 5],
  ["szesc", 6],
  ["siedem", 7],
  ["osiem", 8],
  ["dziewiec", 9],
  ["dziesiec", 10],
  ["jedenascie", 11],
  ["dwunascie", 12],
  ["trzynascie", 13],
  ["czternascie", 14],
  ["pietnascie", 15],
  ["szesnascie", 16],
  ["siedemnascie", 17],
  ["osiemnascie", 18],
  ["dziewietnascie", 19],
  ["dwadziescia", 20],
  ["trzydziesci", 30],
  ["czterdziesci", 40],
  ["piecdziesiat", 50],
  ["szescdziesiat", 60],
]);

const AI_API_CANDIDATES = [
  `${location.origin}/api/ai/plan`,
  "http://localhost:5173/api/ai/plan",
  "http://127.0.0.1:5173/api/ai/plan",
  "http://localhost:5174/api/ai/plan",
  "http://127.0.0.1:5174/api/ai/plan",
];

els.videoInput.addEventListener("change", () => {
  const [file] = els.videoInput.files;
  if (!file) return;
  state.videoFile = file;
  resetDownload();
  els.videoPreview.src = URL.createObjectURL(file);
  els.emptyState.hidden = true;
  setStatus(`Wczytano wideo: ${file.name}`);
  updateRenderState();
});

els.imageInput.addEventListener("change", () => {
  const [file] = els.imageInput.files;
  if (!file) return;
  state.imageFile = file;
  setStatus(`Wczytano obrazek: ${file.name}`);
  if (els.promptInput.value.trim()) parsePrompt();
  updateRenderState();
});

els.parseButton.addEventListener("click", planWithAi);
els.promptInput.addEventListener("input", debounce(parsePrompt, 450));
els.quickPrompts.addEventListener("click", (event) => {
  const button = event.target.closest("[data-prompt]");
  if (!button) return;
  els.promptInput.value = button.dataset.prompt;
  parsePrompt();
});

els.clearButton.addEventListener("click", () => {
  state.operations = [];
  els.promptInput.value = "";
  renderPlan();
  updateRenderState();
  setStatus("Wyczyszczono plan.");
});
els.renderButton.addEventListener("click", renderVideo);
els.micButton.addEventListener("click", startDictation);

if (location.protocol === "file:") {
  setStatus("Otworz aplikacje przez http://localhost, nie bezposrednio z pliku index.html.");
}

function normalizeText(value) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\u0142/g, "l")
    .replace(/[^a-z0-9:., -]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function parsePrompt() {
  const rawPrompt = els.promptInput.value.trim();
  const prompt = normalizeText(rawPrompt);
  const operations = [];

  if (!prompt) {
    state.operations = [];
    renderPlan();
    updateRenderState();
    setStatus(state.videoFile ? "Wpisz polecenie edycji." : "Czekam na wideo.");
    return;
  }

  operations.push(...parseCuts(prompt));
  operations.push(...parseFilters(prompt));
  operations.push(...parseSpeed(prompt));
  operations.push(...parseAudio(prompt));

  const textOverlay = parseTextOverlay(rawPrompt, prompt);
  if (textOverlay) operations.push(textOverlay);

  if (looksLike(prompt, ["obrazek", "zdjecie", "logo", "naklejka", "watermark"])) {
    operations.push({
      type: "overlay",
      label: "dodaj obrazek",
      detail: overlayDetail(prompt),
      position: overlayPosition(prompt),
    });
  }

  state.operations = dedupeOperations(operations);
  renderPlan();
  updateRenderState();

  if (state.operations.length) {
    setStatus(`AI ulozyl plan: ${state.operations.length} operacji.`);
  } else {
    setStatus("Nie rozpoznalem operacji. Sprobuj np. 'usun od 5 do 8 sekundy i dodaj efekt kinowy'.");
  }
}

async function planWithAi() {
  const rawPrompt = els.promptInput.value.trim();
  if (!rawPrompt) {
    parsePrompt();
    return;
  }

  if (!state.videoFile) {
    setStatus("Wczytaj film, zeby AI moglo przeanalizowac klatki. Na razie pokazuje lokalny plan.");
    parsePrompt();
    return;
  }

  els.parseButton.disabled = true;
  setStatus("AI analizuje polecenie i probki obrazu...");

  try {
    const frames = await sampleVideoFrames(state.videoFile, 4);
    const payload = await requestAiPlan({
      prompt: rawPrompt,
      video: {
        name: state.videoFile.name,
        type: state.videoFile.type,
        size: state.videoFile.size,
        duration: Number.isFinite(els.videoPreview.duration) ? els.videoPreview.duration : null,
      },
      frames,
    });
    applyAiPlan(payload);
  } catch (error) {
    console.error(error);
    parsePrompt();
    setStatus(`AI backend niedostepny (${error.message}). Pokazalem lokalny plan.`);
  } finally {
    els.parseButton.disabled = false;
  }
}

async function requestAiPlan(body) {
  const errors = [];
  for (const url of uniqueAiApiCandidates()) {
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload.error || `HTTP ${response.status}`);
      }

      return payload;
    } catch (error) {
      errors.push(`${url}: ${error.message}`);
    }
  }

  throw new Error(errors.at(-1) || "backend AI niedostepny");
}

function uniqueAiApiCandidates() {
  return [...new Set(AI_API_CANDIDATES)];
}

function applyAiPlan(plan) {
  state.lastPlanSummary = plan.summary || "";
  state.operations = normalizeAiOperations(plan.operations || []);
  renderPlan();
  updateRenderState();

  const warnings = Array.isArray(plan.warnings) && plan.warnings.length ? ` Ostrzezenia: ${plan.warnings.join(" ")}` : "";
  setStatus(`AI ulozyl plan na podstawie wideo: ${state.operations.length} operacji.${warnings}`);
}

function normalizeAiOperations(operations) {
  return operations
    .filter((operation) => operation && typeof operation.type === "string")
    .map((operation) => {
      let capability = operation.capability || "browser";
      if (operation.type === "filter" && !operation.ffmpeg) capability = "server_required";
      if (operation.type === "cut" && (!Number.isFinite(operation.start) || !Number.isFinite(operation.end))) {
        capability = "server_required";
      }

      return {
        ...operation,
        label: operation.label || labelForOperation(operation.type),
        detail: operation.detail || operation.text || operation.mode || "operacja AI",
        start: Number.isFinite(operation.start) ? operation.start : null,
        end: Number.isFinite(operation.end) ? operation.end : null,
        capability,
      };
    });
}

function labelForOperation(type) {
  return (
    {
      cut: "usun fragment",
      filter: "dodaj filtr",
      overlay: "dodaj obrazek",
      text: "dodaj tekst",
      speed: "zmien tempo",
      audio: "edytuj audio",
      subtitles: "dodaj napisy",
      object_removal: "usun obiekt",
      analysis: "analiza AI",
    }[type] || "operacja AI"
  );
}

function parseCuts(prompt) {
  const cuts = [];
  const valuePattern = "(\\d+(?:[.,]\\d+)?|[a-z]+(?:\\s+[a-z]+)?)";
  const cutVerb = "(?:usun|wytnij|skasuj|obetnij|przytnij)";

  const firstSeconds = prompt.match(
    new RegExp(`${cutVerb}(?:\\s+\\w+){0,3}\\s+pierwsze?\\s+${valuePattern}\\s*(?:s|sek|sekundy|sekund)`),
  );
  if (firstSeconds) {
    cuts.push({
      type: "cut",
      label: "usun poczatek",
      start: 0,
      end: parseNumber(firstSeconds[1]),
    });
  }

  const spokenFirstSeconds = prompt.match(
    new RegExp(`${cutVerb}(?:\\s+\\w+){0,2}\\s+${valuePattern}\\s+pierwsze?\\s*(?:s|sek|sekundy|sekund)`),
  );
  if (spokenFirstSeconds) {
    cuts.push({
      type: "cut",
      label: "usun poczatek",
      start: 0,
      end: parseNumber(spokenFirstSeconds[1]),
    });
  }

  const fromToPattern = new RegExp(
    `${cutVerb}(?:\\s+\\w+){0,3}\\s+od\\s+${valuePattern}\\s*(?:s|sek|sekundy|sekund)?\\s+(?:do|po)\\s+${valuePattern}\\s*(?:s|sek|sekundy|sekund)?`,
    "g",
  );
  for (const match of prompt.matchAll(fromToPattern)) {
    const start = parseNumber(match[1]);
    const end = parseNumber(match[2]);
    if (end > start) {
      cuts.push({
        type: "cut",
        label: "usun fragment",
        start,
        end,
      });
    }
  }

  return mergeCuts(cuts);
}

function parseFilters(prompt) {
  return FILTERS.filter((filter) => looksLike(prompt, filter.keys)).map((filter) => ({
    type: "filter",
    label: filter.label,
    detail: filter.label,
    ffmpeg: filter.ffmpeg,
  }));
}

function parseSpeed(prompt) {
  if (looksLike(prompt, ["zwolnij", "wolniej", "slow motion"])) {
    return [
      {
        type: "speed",
        label: "zwolnij film",
        detail: "0.5x",
        video: "setpts=2*PTS",
        audio: "atempo=0.5",
      },
    ];
  }

  if (looksLike(prompt, ["przyspiesz", "szybciej", "speed up"])) {
    return [
      {
        type: "speed",
        label: "przyspiesz film",
        detail: "1.5x",
        video: "setpts=0.6667*PTS",
        audio: "atempo=1.5",
      },
    ];
  }

  return [];
}

function parseAudio(prompt) {
  if (looksLike(prompt, ["wycisz", "bez dzwieku", "usun audio", "mute"])) {
    return [
      {
        type: "audio",
        label: "wycisz audio",
        detail: "bez dzwieku",
        mode: "mute",
      },
    ];
  }
  return [];
}

function parseTextOverlay(rawPrompt, prompt) {
  if (!looksLike(prompt, ["tekst", "napis", "podpis", "tytul"])) return null;

  const quoted = rawPrompt.match(/["'„”](.+?)["'„”]/);
  const afterKeyword = rawPrompt.match(/(?:tekst|napis|podpis|tytul)\s+(.+?)(?:\s+(?:na srodku|w centrum|w lewym|w prawym|u gory|na dole)|$)/i);
  const text = normalizeOverlayText(quoted?.[1] || afterKeyword?.[1] || "AI EDIT");

  return {
    type: "text",
    label: "dodaj tekst",
    detail: `${text} - ${overlayDetail(prompt)}`,
    text,
    position: textPosition(prompt),
  };
}

function normalizeOverlayText(value) {
  return value
    .replace(/[^\p{L}\p{N} .,!?_-]/gu, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 48) || "AI EDIT";
}

function parseNumber(value) {
  if (/\d/.test(value)) return Number(value.replace(",", "."));

  const parts = value.split(" ");
  const direct = NUMBER_WORDS.get(value);
  if (direct !== undefined) return direct;

  const total = parts.reduce((sum, part) => sum + (NUMBER_WORDS.get(part) ?? Number.NaN), 0);
  return Number.isFinite(total) ? total : Number.NaN;
}

function mergeCuts(cuts) {
  return cuts
    .filter((cut) => Number.isFinite(cut.start) && Number.isFinite(cut.end) && cut.end > cut.start)
    .sort((a, b) => a.start - b.start)
    .reduce((merged, cut) => {
      const last = merged.at(-1);
      if (!last || cut.start > last.end) {
        merged.push({ ...cut });
        return merged;
      }
      last.end = Math.max(last.end, cut.end);
      return merged;
    }, []);
}

function dedupeOperations(operations) {
  const seen = new Set();
  return operations.filter((operation) => {
    const key = JSON.stringify(operation);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function overlayPosition(prompt) {
  if (looksLike(prompt, ["lewy gorny", "lewa gora", "u gory po lewej"])) return "18:18";
  if (looksLike(prompt, ["prawy gorny", "prawa gora", "u gory po prawej"])) return "main_w-overlay_w-18:18";
  if (looksLike(prompt, ["lewy dolny", "lewy dol", "na dole po lewej"])) return "18:main_h-overlay_h-18";
  if (looksLike(prompt, ["srodek", "centrum", "na srodku"])) {
    return "(main_w-overlay_w)/2:(main_h-overlay_h)/2";
  }
  return "main_w-overlay_w-18:main_h-overlay_h-18";
}

function textPosition(prompt) {
  if (looksLike(prompt, ["lewy gorny", "lewa gora", "u gory po lewej"])) return "x=24:y=24";
  if (looksLike(prompt, ["prawy gorny", "prawa gora", "u gory po prawej"])) return "x=w-tw-24:y=24";
  if (looksLike(prompt, ["lewy dolny", "lewy dol", "na dole po lewej"])) return "x=24:y=h-th-28";
  if (looksLike(prompt, ["srodek", "centrum", "na srodku"])) return "x=(w-tw)/2:y=(h-th)/2";
  return "x=w-tw-24:y=h-th-28";
}

function overlayDetail(prompt) {
  if (looksLike(prompt, ["lewy gorny", "lewa gora", "u gory po lewej"])) return "w lewym gornym rogu";
  if (looksLike(prompt, ["prawy gorny", "prawa gora", "u gory po prawej"])) return "w prawym gornym rogu";
  if (looksLike(prompt, ["lewy dolny", "lewy dol", "na dole po lewej"])) return "w lewym dolnym rogu";
  if (looksLike(prompt, ["srodek", "centrum", "na srodku"])) return "na srodku";
  return "w prawym dolnym rogu";
}

function renderPlan() {
  els.planList.innerHTML = "";
  for (const operation of state.operations) {
    const item = document.createElement("li");
    const title = document.createElement("strong");
    const detail = document.createElement("span");

    title.textContent = operation.label;
    const operationDetail =
      operation.type === "cut" && Number.isFinite(operation.start) && Number.isFinite(operation.end)
        ? `${formatTime(operation.start)} - ${formatTime(operation.end)}`
        : operation.detail;

    detail.textContent = operation.capability && operation.capability !== "browser"
      ? `${operationDetail} (${operation.capability})`
      : operationDetail;

    item.append(title, detail);
    els.planList.append(item);
  }
}

function formatTime(seconds) {
  return `${Number(seconds.toFixed(2))} s`;
}

function updateRenderState() {
  const needsImage = state.operations.some((operation) => operation.type === "overlay");
  const hasServerOnlyOperation = state.operations.some(
    (operation) => operation.capability && operation.capability !== "browser",
  );
  els.renderButton.disabled =
    !state.videoFile || !state.operations.length || (needsImage && !state.imageFile) || hasServerOnlyOperation;
}

function setStatus(message) {
  els.statusText.textContent = message;
}

async function renderVideo() {
  if (!state.videoFile || !state.operations.length) return;

  const unsupported = state.operations.filter((operation) => operation.capability && operation.capability !== "browser");
  if (unsupported.length) {
    setStatus("Ten plan zawiera operacje wymagajace backendu AI/renderingu serwerowego. Podglad planu jest gotowy, ale render w przegladarce obsluguje tylko proste operacje FFmpeg.");
    return;
  }

  if (location.protocol === "file:") {
    setStatus("FFmpeg.wasm nie dziala z file://. Uruchom lokalny serwer i wejdz przez http://localhost:5173.");
    return;
  }

  const needsImage = state.operations.some((operation) => operation.type === "overlay");
  if (needsImage && !state.imageFile) {
    setStatus("Plan zawiera obrazek, ale nie wybrano pliku obrazu.");
    return;
  }

  resetDownload();
  els.renderButton.disabled = true;
  setStatus("Laduje silnik FFmpeg...");

  const dependencies = getFfmpegDependencies();
  if (!dependencies) {
    setStatus("Nie zaladowano FFmpeg.wasm. Sprawdz internet albo blokowanie skryptow CDN.");
    updateRenderState();
    return;
  }

  const { FFmpeg, toBlobURL } = dependencies;
  const ffmpeg = new FFmpeg();
  ffmpeg.on("log", ({ message }) => {
    if (message && !message.includes("frame=")) setStatus(message);
  });
  ffmpeg.on("progress", ({ progress }) => {
    setStatus(`Renderowanie: ${Math.max(0, Math.min(100, Math.round(progress * 100)))}%`);
  });

  const coreBaseUrl = "/vendor/ffmpeg/core/dist/umd";
  try {
    await ffmpeg.load({
      coreURL: await toBlobURL(`${coreBaseUrl}/ffmpeg-core.js`, "text/javascript"),
      wasmURL: await toBlobURL(`${coreBaseUrl}/ffmpeg-core.wasm`, "application/wasm"),
    });
  } catch (error) {
    console.error(error);
    setStatus("Nie udalo sie zaladowac FFmpeg.wasm. Wylacz blokowanie CDN/adblock, zrob Ctrl+F5 i uruchom przez http://localhost:5173.");
    updateRenderState();
    return;
  }

  const inputName = `input.${extensionFromType(state.videoFile.type, "mp4")}`;
  const imageName = state.imageFile ? `overlay.${extensionFromType(state.imageFile.type, "png")}` : null;
  const outputName = "output.mp4";

  await ffmpeg.writeFile(inputName, new Uint8Array(await state.videoFile.arrayBuffer()));
  if (state.imageFile && imageName) {
    await ffmpeg.writeFile(imageName, new Uint8Array(await state.imageFile.arrayBuffer()));
  }

  const args = buildFfmpegArgs(inputName, imageName, outputName);
  setStatus("Renderowanie wystartowalo...");
  try {
    await ffmpeg.exec(args);
  } catch (error) {
    console.error(error);
    setStatus("Renderowanie nie powiodlo sie. Szczegoly sa w konsoli przegladarki.");
    updateRenderState();
    return;
  }

  const data = await ffmpeg.readFile(outputName);
  const blob = new Blob([data.buffer], { type: "video/mp4" });
  state.outputUrl = URL.createObjectURL(blob);
  els.videoPreview.src = state.outputUrl;
  els.downloadLink.href = state.outputUrl;
  els.downloadLink.download = "ai-video-editor-output.mp4";
  els.downloadLink.hidden = false;
  setStatus("Gotowe. Wynik jest w podgladzie i pod linkiem pobierania.");
  updateRenderState();
}

function getFfmpegDependencies() {
  const FFmpeg = window.FFmpegWASM?.FFmpeg;
  const toBlobURL = window.FFmpegUtil?.toBlobURL;

  if (!FFmpeg || !toBlobURL) return null;
  return { FFmpeg, toBlobURL };
}

function buildFfmpegArgs(inputName, imageName, outputName) {
  const cuts = state.operations.filter((operation) => operation.type === "cut");
  const filters = state.operations.filter((operation) => operation.type === "filter");
  const speed = state.operations.find((operation) => operation.type === "speed");
  const mute = state.operations.some((operation) => operation.type === "audio" && operation.mode === "mute");
  const overlay = state.operations.find((operation) => operation.type === "overlay");
  const text = state.operations.find((operation) => operation.type === "text");
  const args = ["-i", inputName];

  if (overlay && imageName) args.push("-i", imageName);

  const filterGraph = [];
  const videoFilters = [];
  const audioFilters = [];

  if (cuts.length) {
    const keepExpression = cuts.map((cut) => `not(between(t\\,${cut.start}\\,${cut.end}))`).join("*");
    videoFilters.push(`select='${keepExpression}',setpts=N/FRAME_RATE/TB`);
    audioFilters.push(`aselect='${keepExpression}',asetpts=N/SR/TB`);
  }

  videoFilters.push(...filters.map((operation) => operation.ffmpeg));
  if (speed) {
    videoFilters.push(speed.video);
    audioFilters.push(speed.audio);
  }
  if (text) videoFilters.push(drawTextFilter(text));

  let videoLabel = "[0:v]";
  if (videoFilters.length) {
    filterGraph.push(`[0:v]${videoFilters.join(",")}[basev]`);
    videoLabel = "[basev]";
  }

  if (overlay && imageName) {
    filterGraph.push("[1:v]scale=iw*min(220/iw\\,1):ih*min(220/ih\\,1)[logo]");
    filterGraph.push(`${videoLabel}[logo]overlay=${overlay.position}[outv]`);
    videoLabel = "[outv]";
  }

  if (audioFilters.length && !mute) {
    filterGraph.push(`[0:a]${audioFilters.join(",")}[outa]`);
  }

  if (filterGraph.length) {
    args.push("-filter_complex", filterGraph.join(";"));
    args.push("-map", videoLabel);
    if (!mute) args.push("-map", audioFilters.length ? "[outa]" : "0:a?");
  }

  if (mute) {
    args.push("-an");
  } else {
    args.push("-c:a", "aac");
  }

  args.push("-c:v", "libx264", "-preset", "veryfast", "-pix_fmt", "yuv420p", "-movflags", "+faststart", outputName);
  return args;
}

function drawTextFilter(operation) {
  const text = escapeDrawtext(operation.text);
  return `drawtext=text='${text}':${operation.position}:fontsize=42:fontcolor=white:box=1:boxcolor=black@0.45:boxborderw=14`;
}

function escapeDrawtext(value) {
  return value.replace(/\\/g, "\\\\").replace(/:/g, "\\:").replace(/'/g, "\\'");
}

function extensionFromType(type, fallback) {
  return type?.split("/")[1]?.replace("quicktime", "mov") || fallback;
}

function resetDownload() {
  if (state.outputUrl) URL.revokeObjectURL(state.outputUrl);
  state.outputUrl = null;
  els.downloadLink.hidden = true;
  els.downloadLink.removeAttribute("href");
}

async function sampleVideoFrames(file, count) {
  const video = document.createElement("video");
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d", { willReadFrequently: true });
  const url = URL.createObjectURL(file);

  try {
    video.muted = true;
    video.preload = "metadata";
    video.src = url;
    await once(video, "loadedmetadata");

    const duration = Number.isFinite(video.duration) && video.duration > 0 ? video.duration : 1;
    const width = Math.min(512, video.videoWidth || 512);
    const height = Math.round(width * ((video.videoHeight || 288) / (video.videoWidth || 512)));
    canvas.width = width;
    canvas.height = height;

    const frames = [];
    for (let index = 0; index < count; index += 1) {
      const time = Math.min(duration - 0.05, duration * ((index + 1) / (count + 1)));
      video.currentTime = Math.max(0, time);
      await once(video, "seeked");
      context.drawImage(video, 0, 0, width, height);
      frames.push({
        time,
        dataUrl: canvas.toDataURL("image/jpeg", 0.72),
      });
    }

    return frames;
  } finally {
    URL.revokeObjectURL(url);
  }
}

function once(target, eventName) {
  return new Promise((resolve, reject) => {
    const onEvent = () => {
      cleanup();
      resolve();
    };
    const onError = () => {
      cleanup();
      reject(new Error(`Nie udalo sie odczytac wideo: ${eventName}`));
    };
    const cleanup = () => {
      target.removeEventListener(eventName, onEvent);
      target.removeEventListener("error", onError);
    };
    target.addEventListener(eventName, onEvent, { once: true });
    target.addEventListener("error", onError, { once: true });
  });
}

function startDictation() {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) {
    setStatus("Ta przegladarka nie obsluguje dyktowania. Wpisz polecenie recznie.");
    return;
  }

  const recognition = new SpeechRecognition();
  recognition.lang = "pl-PL";
  recognition.interimResults = false;
  recognition.continuous = false;

  els.micButton.classList.add("is-recording");
  setStatus("Slucham...");

  recognition.onresult = (event) => {
    const transcript = Array.from(event.results)
      .map((result) => result[0].transcript)
      .join(" ");
    els.promptInput.value = [els.promptInput.value, transcript].filter(Boolean).join(" ");
    parsePrompt();
  };

  recognition.onerror = () => {
    setStatus("Nie udalo sie rozpoznac mowy.");
  };

  recognition.onend = () => {
    els.micButton.classList.remove("is-recording");
  };

  recognition.start();
}

function looksLike(prompt, phrases) {
  const compactPrompt = prompt.replace(/\s+/g, "");
  const words = prompt.split(" ");
  return phrases.some((phrase) => {
    const normalized = normalizeText(phrase);
    if (prompt.includes(normalized) || compactPrompt.includes(normalized.replace(/\s+/g, ""))) return true;

    const phraseWords = normalized.split(" ");
    if (phraseWords.length > 1) {
      return phraseWords.every((phraseWord) => words.some((word) => fuzzyWord(word, phraseWord)));
    }

    return words.some((word) => fuzzyWord(word, normalized));
  });
}

function fuzzyWord(word, target) {
  if (target.length < 5) return word === target;
  if (word.includes(target) || target.includes(word)) return Math.min(word.length, target.length) >= target.length - 2;
  return levenshtein(word, target) <= Math.max(1, Math.floor(target.length * 0.28));
}

function levenshtein(a, b) {
  const row = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 1; i <= a.length; i += 1) {
    let previous = row[0];
    row[0] = i;
    for (let j = 1; j <= b.length; j += 1) {
      const temp = row[j];
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, previous + (a[i - 1] === b[j - 1] ? 0 : 1));
      previous = temp;
    }
  }
  return row[b.length];
}

function debounce(callback, delay) {
  let timeoutId;
  return (...args) => {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => callback(...args), delay);
  };
}
