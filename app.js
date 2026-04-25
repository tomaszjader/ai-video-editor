const state = {
  videoFile: null,
  imageFile: null,
  operations: [],
  outputUrl: null,
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
};

const FILTERS = [
  {
    names: ["czarno bialy", "czarno-bialy", "grayscale", "mono"],
    label: "filtr czarno-bialy",
    ffmpeg: "format=gray",
  },
  {
    names: ["sepia", "stary film"],
    label: "filtr sepia",
    ffmpeg: "colorchannelmixer=.393:.769:.189:0:.349:.686:.168:0:.272:.534:.131",
  },
  {
    names: ["rozjasnij", "jasniej", "jasny"],
    label: "rozjasnienie",
    ffmpeg: "eq=brightness=0.08:saturation=1.08",
  },
  {
    names: ["kontrast", "wiekszy kontrast"],
    label: "wiekszy kontrast",
    ffmpeg: "eq=contrast=1.25:saturation=1.05",
  },
  {
    names: ["cieply", "cieple kolory", "ociepl"],
    label: "cieple kolory",
    ffmpeg: "colorbalance=rs=.12:gs=.03:bs=-.08",
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

els.videoInput.addEventListener("change", () => {
  const [file] = els.videoInput.files;
  if (!file) return;
  state.videoFile = file;
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
  parsePrompt();
});

els.parseButton.addEventListener("click", parsePrompt);
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
  const prompt = normalizeText(els.promptInput.value);
  const operations = [];

  operations.push(...parseCuts(prompt));
  operations.push(...parseFilters(prompt));

  if (prompt.includes("obrazek") || prompt.includes("zdjecie") || prompt.includes("logo")) {
    operations.push({
      type: "overlay",
      label: "dodaj obrazek",
      detail: overlayDetail(prompt),
      position: overlayPosition(prompt),
    });
  }

  state.operations = operations;
  renderPlan();
  updateRenderState();

  if (operations.length) {
    setStatus(`Rozpoznano ${operations.length} operacji.`);
  } else {
    setStatus("Nie rozpoznalem operacji. Sprobuj np. 'usun od 30 do 35 sekundy'.");
  }
}

function parseCuts(prompt) {
  const cuts = [];
  const valuePattern = "(\\d+(?:[.,]\\d+)?|[a-z]+(?:\\s+[a-z]+)?)";
  const firstSeconds = prompt.match(
    new RegExp(`usun(?:\\s+\\w+){0,3}\\s+pierwsze?\\s+${valuePattern}\\s*(?:s|sek|sekundy|sekund)`),
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
    new RegExp(`usun(?:\\s+\\w+){0,2}\\s+${valuePattern}\\s+pierwsze?\\s*(?:s|sek|sekundy|sekund)`),
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
    `usun(?:\\s+\\w+){0,3}\\s+od\\s+${valuePattern}\\s*(?:s|sek|sekundy|sekund)?\\s+do\\s+${valuePattern}\\s*(?:s|sek|sekundy|sekund)?`,
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
  return FILTERS.filter((filter) => filter.names.some((name) => prompt.includes(name))).map(
    (filter) => ({
      type: "filter",
      label: filter.label,
      detail: filter.label,
      ffmpeg: filter.ffmpeg,
    }),
  );
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

function overlayPosition(prompt) {
  if (prompt.includes("lewy gorny")) return "10:10";
  if (prompt.includes("prawy gorny")) return "main_w-overlay_w-10:10";
  if (prompt.includes("lewy dolny")) return "10:main_h-overlay_h-10";
  if (prompt.includes("srodek") || prompt.includes("centrum")) {
    return "(main_w-overlay_w)/2:(main_h-overlay_h)/2";
  }
  return "main_w-overlay_w-10:main_h-overlay_h-10";
}

function overlayDetail(prompt) {
  if (prompt.includes("lewy gorny")) return "w lewym gornym rogu";
  if (prompt.includes("prawy gorny")) return "w prawym gornym rogu";
  if (prompt.includes("lewy dolny")) return "w lewym dolnym rogu";
  if (prompt.includes("srodek") || prompt.includes("centrum")) return "na srodku";
  return "w prawym dolnym rogu";
}

function renderPlan() {
  els.planList.innerHTML = "";
  for (const operation of state.operations) {
    const item = document.createElement("li");
    const title = document.createElement("strong");
    const detail = document.createElement("span");

    title.textContent = operation.label;
    detail.textContent =
      operation.type === "cut"
        ? `${formatTime(operation.start)} - ${formatTime(operation.end)}`
        : operation.detail;

    item.append(title, detail);
    els.planList.append(item);
  }
}

function formatTime(seconds) {
  return `${Number(seconds.toFixed(2))} s`;
}

function updateRenderState() {
  const needsImage = state.operations.some((operation) => operation.type === "overlay");
  els.renderButton.disabled =
    !state.videoFile || !state.operations.length || (needsImage && !state.imageFile);
}

function setStatus(message) {
  els.statusText.textContent = message;
}

async function renderVideo() {
  if (!state.videoFile || !state.operations.length) return;

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
    if (message) setStatus(message);
  });
  ffmpeg.on("progress", ({ progress }) => {
    setStatus(`Renderowanie: ${Math.round(progress * 100)}%`);
  });

  const baseUrl = "https://unpkg.com/@ffmpeg/core@0.12.6/dist/umd";
  try {
    await ffmpeg.load({
      coreURL: await toBlobURL(`${baseUrl}/ffmpeg-core.js`, "text/javascript"),
      wasmURL: await toBlobURL(`${baseUrl}/ffmpeg-core.wasm`, "application/wasm"),
    });
  } catch (error) {
    console.error(error);
    setStatus("Nie udalo sie zaladowac FFmpeg.wasm. Upewnij sie, ze strona dziala przez http://localhost.");
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
  const overlay = state.operations.find((operation) => operation.type === "overlay");
  const args = ["-i", inputName];

  if (overlay && imageName) {
    args.push("-i", imageName);
  }

  const filterGraph = [];
  const videoFilters = [];

  if (cuts.length) {
    const keepExpression = cuts
      .map((cut) => `not(between(t\\,${cut.start}\\,${cut.end}))`)
      .join("*");
    videoFilters.push(`select='${keepExpression}',setpts=N/FRAME_RATE/TB`);
  }

  videoFilters.push(...filters.map((operation) => operation.ffmpeg));

  if (videoFilters.length) {
    filterGraph.push(`[0:v]${videoFilters.join(",")}[basev]`);
  }

  if (overlay && imageName) {
    const base = videoFilters.length ? "[basev]" : "[0:v]";
    filterGraph.push("[1:v]scale=iw*min(220/iw\\,1):ih*min(220/iw\\,1)[logo]");
    filterGraph.push(`${base}[logo]overlay=${overlay.position}[outv]`);
  }

  if (filterGraph.length) {
    args.push("-filter_complex", filterGraph.join(";"));
    args.push("-map", overlay ? "[outv]" : "[basev]");
    args.push("-map", "0:a?");
  }

  if (cuts.length) {
    const audioKeep = cuts
      .map((cut) => `not(between(t\\,${cut.start}\\,${cut.end}))`)
      .join("*");
    const audioFilter = `aselect='${audioKeep}',asetpts=N/SR/TB`;
    if (filterGraph.length) {
      const graphIndex = args.indexOf("-filter_complex") + 1;
      args[graphIndex] = `${args[graphIndex]};[0:a]${audioFilter}[outa]`;
      args[args.lastIndexOf("0:a?")] = "[outa]";
    }
  }

  args.push("-c:v", "libx264", "-preset", "veryfast", "-pix_fmt", "yuv420p", "-c:a", "aac", outputName);
  return args;
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
