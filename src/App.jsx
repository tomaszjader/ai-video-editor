import { useEffect, useMemo, useRef, useState } from "react";

const FILTERS = [
  { keys: ["czarno bialy", "czarnobialy", "black white", "grayscale", "mono"], label: "filtr czarno-bialy", ffmpeg: "format=gray" },
  { keys: ["sepia", "stary film", "retro", "vintage"], label: "filtr sepia", ffmpeg: "colorchannelmixer=.393:.769:.189:0:.349:.686:.168:0:.272:.534:.131" },
  { keys: ["rozjasnij", "jasniej", "jasny"], label: "rozjasnienie", ffmpeg: "eq=brightness=0.08:saturation=1.08" },
  { keys: ["przyciemnij", "ciemniej", "ciemny"], label: "lekkie przyciemnienie", ffmpeg: "eq=brightness=-0.06:saturation=1.05" },
  { keys: ["kontrast", "wiekszy kontrast"], label: "wiekszy kontrast", ffmpeg: "eq=contrast=1.25:saturation=1.05" },
  { keys: ["cieply", "cieple kolory", "ociepl"], label: "cieple kolory", ffmpeg: "colorbalance=rs=.12:gs=.03:bs=-.08" },
  { keys: ["zimny", "zimne kolory", "ochlodz"], label: "zimne kolory", ffmpeg: "colorbalance=rs=-.07:gs=.01:bs=.12" },
  { keys: ["kinowy", "filmowy", "cinematic"], label: "efekt kinowy", ffmpeg: "eq=contrast=1.18:saturation=1.12:brightness=-0.03,vignette=PI/5" },
  { keys: ["blur", "rozmyj", "rozmycie"], label: "rozmycie", ffmpeg: "boxblur=2:1" },
  { keys: ["wyostrz", "ostrosc", "sharp"], label: "wyostrzenie", ffmpeg: "unsharp=5:5:0.9" },
];

const NUMBER_WORDS = new Map([
  ["zero", 0], ["jeden", 1], ["jedna", 1], ["jedno", 1], ["dwa", 2], ["dwie", 2], ["trzy", 3],
  ["cztery", 4], ["piec", 5], ["szesc", 6], ["siedem", 7], ["osiem", 8], ["dziewiec", 9],
  ["dziesiec", 10], ["jedenascie", 11], ["dwunascie", 12], ["trzynascie", 13], ["czternascie", 14],
  ["pietnascie", 15], ["szesnascie", 16], ["siedemnascie", 17], ["osiemnascie", 18],
  ["dziewietnascie", 19], ["dwadziescia", 20], ["trzydziesci", 30], ["czterdziesci", 40],
  ["piecdziesiat", 50], ["szescdziesiat", 60],
]);

const QUICK_PROMPTS = [
  ["Usun poczatek", "Usun pierwsze 3 sekundy i dodaj cieple kolory."],
  ["Efekt kinowy", "Dodaj efekt kinowy, wiekszy kontrast i przyciemnij lekko film."],
  ["Dodaj tekst", "Dodaj tekst AI EDIT w lewym gornym rogu."],
  ["Usun obiekt", "Usun osobe z tla i uzupelnij brakujace tlo."],
];

const TEXT_POSITIONS = [
  ["x=24:y=24", "Lewy gorny"],
  ["x=w-tw-24:y=24", "Prawy gorny"],
  ["x=24:y=h-th-28", "Lewy dolny"],
  ["x=w-tw-24:y=h-th-28", "Prawy dolny"],
  ["x=(w-tw)/2:y=(h-th)/2", "Srodek"],
];

export default function App() {
  const [videoFile, setVideoFile] = useState(null);
  const [imageFile, setImageFile] = useState(null);
  const [videoUrl, setVideoUrl] = useState("");
  const [prompt, setPrompt] = useState("");
  const [operations, setOperations] = useState([]);
  const [status, setStatus] = useState("Czekam na wideo.");
  const [outputUrl, setOutputUrl] = useState("");
  const [isPlanning, setIsPlanning] = useState(false);
  const [isRendering, setIsRendering] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const videoRef = useRef(null);

  useEffect(() => {
    if (location.protocol === "file:") {
      setStatus("Otworz aplikacje przez http://localhost, nie bezposrednio z pliku index.html.");
    }
  }, []);

  useEffect(() => {
    if (!prompt.trim()) return;
    const timeoutId = setTimeout(() => applyLocalPlan(prompt), 450);
    return () => clearTimeout(timeoutId);
  }, [prompt]);

  useEffect(() => {
    return () => {
      if (videoUrl) URL.revokeObjectURL(videoUrl);
      if (outputUrl) URL.revokeObjectURL(outputUrl);
    };
  }, [videoUrl, outputUrl]);

  const renderState = useMemo(() => getRenderState(videoFile, imageFile, operations), [videoFile, imageFile, operations]);

  function resetDownload() {
    if (outputUrl) URL.revokeObjectURL(outputUrl);
    setOutputUrl("");
  }

  function handleVideoChange(event) {
    const [file] = event.target.files;
    if (!file) return;
    if (videoUrl) URL.revokeObjectURL(videoUrl);
    const nextUrl = URL.createObjectURL(file);
    setVideoFile(file);
    setVideoUrl(nextUrl);
    resetDownload();
    setStatus(`Wczytano wideo: ${file.name}`);
  }

  function handleImageChange(event) {
    const [file] = event.target.files;
    if (!file) return;
    setImageFile(file);
    setStatus(`Wczytano obrazek: ${file.name}`);
    if (prompt.trim()) applyLocalPlan(prompt);
  }

  function applyLocalPlan(rawPrompt = prompt) {
    const nextOperations = parsePromptToOperations(rawPrompt);
    setOperations(nextOperations);
    if (!rawPrompt.trim()) {
      setStatus(videoFile ? "Wpisz polecenie edycji." : "Czekam na wideo.");
    } else if (nextOperations.length) {
      setStatus(`AI ulozyl plan: ${nextOperations.length} operacji.`);
    } else {
      setStatus("Nie rozpoznalem operacji. Sprobuj np. 'usun od 5 do 8 sekundy i dodaj efekt kinowy'.");
    }
  }

  async function planWithAi() {
    const rawPrompt = prompt.trim();
    if (!rawPrompt) {
      applyLocalPlan("");
      return;
    }

    if (!videoFile) {
      setStatus("Wczytaj film, zeby AI moglo przeanalizowac klatki. Na razie pokazuje lokalny plan.");
      applyLocalPlan(rawPrompt);
      return;
    }

    setIsPlanning(true);
    setStatus("AI analizuje polecenie i probki obrazu...");

    try {
      const frames = await sampleVideoFrames(videoFile, 4);
      const payload = await requestAiPlan({
        prompt: rawPrompt,
        video: {
          name: videoFile.name,
          type: videoFile.type,
          size: videoFile.size,
          duration: Number.isFinite(videoRef.current?.duration) ? videoRef.current.duration : null,
        },
        frames,
      });
      const normalized = normalizeAiOperations(payload.operations || []);
      setOperations(normalized);
      const warnings = Array.isArray(payload.warnings) && payload.warnings.length ? ` Ostrzezenia: ${payload.warnings.join(" ")}` : "";
      setStatus(`AI ulozyl plan na podstawie wideo: ${normalized.length} operacji.${warnings}`);
    } catch (error) {
      console.error(error);
      applyLocalPlan(rawPrompt);
      setStatus(`AI backend niedostepny (${error.message}). Pokazalem lokalny plan.`);
    } finally {
      setIsPlanning(false);
    }
  }

  function clearPlan() {
    setOperations([]);
    setPrompt("");
    setStatus("Wyczyszczono plan.");
  }

  function toggleOperation(index) {
    setOperations((current) =>
      current.map((operation, operationIndex) =>
        operationIndex === index ? { ...operation, active: operation.active === false } : operation,
      ),
    );
    setStatus(operations[index]?.active === false ? "Operacja wlaczona." : "Operacja wylaczona.");
  }

  function deleteOperation(index) {
    setOperations((current) => current.filter((_, operationIndex) => operationIndex !== index));
    setStatus("Usunieto operacje z planu.");
  }

  function updateOperation(index, field, value) {
    setOperations((current) =>
      current.map((operation, operationIndex) => {
        if (operationIndex !== index) return operation;
        const next = { ...operation };
        if (field === "start" || field === "end") {
          next[field] = Number(value);
          if (Number.isFinite(next.start) && Number.isFinite(next.end)) {
            next.detail = `${formatTime(next.start)} - ${formatTime(next.end)}`;
          }
        } else if (field === "text") {
          next.text = normalizeOverlayText(value);
          next.detail = `${next.text} - ${overlayDetailFromPosition(next.position)}`;
        } else if (field === "position") {
          next.position = value;
          next.detail = `${next.text || "AI EDIT"} - ${overlayDetailFromPosition(next.position)}`;
        }
        return next;
      }),
    );
  }

  async function renderVideo() {
    const activeOperations = operations.filter((operation) => operation.active !== false);
    if (!videoFile || !activeOperations.length) return;

    const unsupported = activeOperations.filter((operation) => operation.capability && operation.capability !== "browser");
    if (unsupported.length) {
      setStatus("Ten plan zawiera operacje wymagajace backendu AI/renderingu serwerowego. Podglad planu jest gotowy, ale render w przegladarce obsluguje tylko proste operacje FFmpeg.");
      return;
    }

    if (location.protocol === "file:") {
      setStatus("FFmpeg.wasm nie dziala z file://. Uruchom lokalny serwer i wejdz przez http://localhost:5173.");
      return;
    }

    const needsImage = activeOperations.some((operation) => operation.type === "overlay");
    if (needsImage && !imageFile) {
      setStatus("Plan zawiera obrazek, ale nie wybrano pliku obrazu.");
      return;
    }

    resetDownload();
    setIsRendering(true);
    setStatus("Laduje silnik FFmpeg...");

    const dependencies = getFfmpegDependencies();
    if (!dependencies) {
      setStatus("Nie zaladowano FFmpeg.wasm. Sprawdz internet albo blokowanie skryptow CDN.");
      setIsRendering(false);
      return;
    }

    try {
      const data = await runFfmpegRender({
        dependencies,
        videoFile,
        imageFile,
        activeOperations,
        setStatus,
      });
      const blob = new Blob([data.buffer], { type: "video/mp4" });
      const nextOutputUrl = URL.createObjectURL(blob);
      if (videoUrl) URL.revokeObjectURL(videoUrl);
      setOutputUrl(nextOutputUrl);
      setVideoUrl(nextOutputUrl);
      setStatus("Gotowe. Wynik jest w podgladzie i pod linkiem pobierania.");
    } catch (error) {
      console.error(error);
      setStatus(`Renderowanie nie powiodlo sie: ${friendlyRenderError(error)}`);
    } finally {
      setIsRendering(false);
    }
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

    setIsRecording(true);
    setStatus("Slucham...");

    recognition.onresult = (event) => {
      const transcript = Array.from(event.results)
        .map((result) => result[0].transcript)
        .join(" ");
      const nextPrompt = [prompt, transcript].filter(Boolean).join(" ");
      setPrompt(nextPrompt);
      applyLocalPlan(nextPrompt);
    };
    recognition.onerror = () => setStatus("Nie udalo sie rozpoznac mowy.");
    recognition.onend = () => setIsRecording(false);
    recognition.start();
  }

  return (
    <main className="app-shell">
      <section className="editor">
        <header className="topbar">
          <div>
            <p className="eyebrow">AI Edytor Wideo</p>
            <h1>Edytuj film poleceniami</h1>
          </div>
          <button className="primary-button" type="button" disabled={renderState.disabled || isRendering} title={renderState.title} onClick={renderVideo}>
            {isRendering ? "Renderuje..." : "Renderuj"}
          </button>
        </header>

        <div className="workspace">
          <section className="preview-panel" aria-label="Podglad wideo">
            <div className="video-frame">
              {videoUrl && <video ref={videoRef} src={videoUrl} controls playsInline />}
              {!videoUrl && (
                <div className="empty-state">
                  <span>Wrzuc film, potem wpisz albo podyktuj polecenie.</span>
                </div>
              )}
            </div>

            <div className="upload-row">
              <label className="file-control">
                <input type="file" accept="video/*" onChange={handleVideoChange} />
                <span>Wybierz wideo</span>
              </label>
              <label className="file-control secondary">
                <input type="file" accept="image/*" onChange={handleImageChange} />
                <span>Dodaj obrazek</span>
              </label>
            </div>

            <div className="quick-prompts" aria-label="Szybkie polecenia">
              {QUICK_PROMPTS.map(([label, value]) => (
                <button key={label} type="button" onClick={() => {
                  setPrompt(value);
                  applyLocalPlan(value);
                }}>
                  {label}
                </button>
              ))}
            </div>
          </section>

          <aside className="command-panel" aria-label="Komendy edycji">
            <div className="prompt-box">
              <label htmlFor="promptInput">Polecenie</label>
              <textarea
                id="promptInput"
                rows="7"
                value={prompt}
                onChange={(event) => {
                  setPrompt(event.target.value);
                  if (!event.target.value.trim()) applyLocalPlan("");
                }}
                placeholder="Np. Usun osobe z tla, wytnij od 00:10 do 00:20, dodaj filtr kinowy, wstaw logo w rogu i dodaj napisy po polsku."
              />
              <div className="button-row">
                <button type="button" disabled={isPlanning} onClick={planWithAi}>
                  {isPlanning ? "Analizuje..." : "Uloz plan AI"}
                </button>
                <button type="button" className={`icon-button${isRecording ? " is-recording" : ""}`} title="Dyktuj polecenie" onClick={startDictation}>
                  <span aria-hidden="true">REC</span>
                  <span>Dyktuj</span>
                </button>
              </div>
            </div>

            <section className="plan-panel">
              <div className="panel-heading">
                <h2>Plan edycji</h2>
                <button type="button" onClick={clearPlan}>Wyczysc</button>
              </div>
              <ol className="plan-list">
                {operations.map((operation, index) => (
                  <PlanItem
                    key={`${operation.type}-${index}`}
                    operation={operation}
                    index={index}
                    onToggle={toggleOperation}
                    onDelete={deleteOperation}
                    onChange={updateOperation}
                  />
                ))}
              </ol>
            </section>

            <section className="status-panel" aria-live="polite">
              <h2>Status</h2>
              <p>{status}</p>
              {outputUrl && (
                <a className="download-link" href={outputUrl} download="ai-video-editor-output.mp4">
                  Pobierz wynik
                </a>
              )}
            </section>

            <section className="help-panel">
              <h2>Rozumiem m.in.</h2>
              <p>usun od 5 do 8 sekundy, usun osobe z tla, dodaj napisy po polsku, czarno-bialy, kinowy, blur, wyostrz, zwolnij, wycisz, dodaj tekst, dodaj obrazek.</p>
            </section>
          </aside>
        </div>
      </section>
    </main>
  );
}

function PlanItem({ operation, index, onToggle, onDelete, onChange }) {
  const operationDetail =
    operation.type === "cut" && Number.isFinite(operation.start) && Number.isFinite(operation.end)
      ? `${formatTime(operation.start)} - ${formatTime(operation.end)}`
      : operation.detail;
  const detail = operation.capability && operation.capability !== "browser"
    ? `${operationDetail} (${operation.capability})`
    : operationDetail;

  return (
    <li className={operation.active === false ? "is-disabled" : ""}>
      <div className="plan-item-header">
        <strong>{operation.label}</strong>
        <div className="plan-actions">
          <button type="button" onClick={() => onToggle(index)}>{operation.active === false ? "Wlacz" : "Wylacz"}</button>
          <button type="button" onClick={() => onDelete(index)}>Usun</button>
        </div>
      </div>
      <span className="plan-detail">{detail}</span>
      {operation.type === "cut" && (
        <div className="plan-edit-grid">
          <NumberField label="Start" value={operation.start} onChange={(value) => onChange(index, "start", value)} />
          <NumberField label="Koniec" value={operation.end} onChange={(value) => onChange(index, "end", value)} />
        </div>
      )}
      {operation.type === "text" && (
        <div className="plan-edit-grid">
          <TextField label="Tekst" value={operation.text || ""} onChange={(value) => onChange(index, "text", value)} />
          <label className="plan-field">
            <span>Pozycja</span>
            <select value={operation.position || "x=w-tw-24:y=h-th-28"} onChange={(event) => onChange(index, "position", event.target.value)}>
              {TEXT_POSITIONS.map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </label>
        </div>
      )}
    </li>
  );
}

function NumberField({ label, value, onChange }) {
  return (
    <label className="plan-field">
      <span>{label}</span>
      <input type="number" min="0" step="0.1" value={Number.isFinite(value) ? String(value) : ""} onChange={(event) => onChange(event.target.value)} />
    </label>
  );
}

function TextField({ label, value, onChange }) {
  return (
    <label className="plan-field">
      <span>{label}</span>
      <input type="text" maxLength="48" value={value} onChange={(event) => onChange(event.target.value)} />
    </label>
  );
}

function parsePromptToOperations(rawPrompt) {
  const prompt = normalizeText(rawPrompt);
  const operations = [];
  if (!prompt) return operations;

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

  return dedupeOperations(operations);
}

async function requestAiPlan(body) {
  const response = await fetch("/api/ai/plan", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const detail = payload.detail ? ` ${payload.detail}` : "";
    throw new Error(`${payload.error || `HTTP ${response.status}`}${detail}`);
  }
  return payload;
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
        active: operation.active !== false,
        label: operation.label || labelForOperation(operation.type),
        detail: operation.detail || operation.text || operation.mode || "operacja AI",
        start: Number.isFinite(operation.start) ? operation.start : null,
        end: Number.isFinite(operation.end) ? operation.end : null,
        capability,
      };
    });
}

function labelForOperation(type) {
  return {
    cut: "usun fragment",
    filter: "dodaj filtr",
    overlay: "dodaj obrazek",
    text: "dodaj tekst",
    speed: "zmien tempo",
    audio: "edytuj audio",
    subtitles: "dodaj napisy",
    object_removal: "usun obiekt",
    analysis: "analiza AI",
  }[type] || "operacja AI";
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

function parseCuts(prompt) {
  const cuts = [];
  const valuePattern = "(\\d+(?:[.,]\\d+)?|[a-z]+(?:\\s+[a-z]+)?)";
  const cutVerb = "(?:usun|wytnij|skasuj|obetnij|przytnij)";

  const firstSeconds = prompt.match(new RegExp(`${cutVerb}(?:\\s+\\w+){0,3}\\s+pierwsze?\\s+${valuePattern}\\s*(?:s|sek|sekundy|sekund)`));
  if (firstSeconds) cuts.push({ type: "cut", label: "usun poczatek", start: 0, end: parseNumber(firstSeconds[1]) });

  const spokenFirstSeconds = prompt.match(new RegExp(`${cutVerb}(?:\\s+\\w+){0,2}\\s+${valuePattern}\\s+pierwsze?\\s*(?:s|sek|sekundy|sekund)`));
  if (spokenFirstSeconds) cuts.push({ type: "cut", label: "usun poczatek", start: 0, end: parseNumber(spokenFirstSeconds[1]) });

  const fromToPattern = new RegExp(`${cutVerb}(?:\\s+\\w+){0,3}\\s+od\\s+${valuePattern}\\s*(?:s|sek|sekundy|sekund)?\\s+(?:do|po)\\s+${valuePattern}\\s*(?:s|sek|sekundy|sekund)?`, "g");
  for (const match of prompt.matchAll(fromToPattern)) {
    const start = parseNumber(match[1]);
    const end = parseNumber(match[2]);
    if (end > start) cuts.push({ type: "cut", label: "usun fragment", start, end });
  }

  return mergeCuts(cuts);
}

function parseFilters(prompt) {
  return FILTERS.filter((filter) => looksLike(prompt, filter.keys)).map((filter) => ({
    type: "filter",
    active: true,
    label: filter.label,
    detail: filter.label,
    ffmpeg: filter.ffmpeg,
  }));
}

function parseSpeed(prompt) {
  if (looksLike(prompt, ["zwolnij", "wolniej", "slow motion"])) {
    return [{ type: "speed", active: true, label: "zwolnij film", detail: "0.5x", video: "setpts=2*PTS", audio: "atempo=0.5" }];
  }
  if (looksLike(prompt, ["przyspiesz", "szybciej", "speed up"])) {
    return [{ type: "speed", active: true, label: "przyspiesz film", detail: "1.5x", video: "setpts=0.6667*PTS", audio: "atempo=1.5" }];
  }
  return [];
}

function parseAudio(prompt) {
  if (looksLike(prompt, ["wycisz", "bez dzwieku", "usun audio", "mute"])) {
    return [{ type: "audio", active: true, label: "wycisz audio", detail: "bez dzwieku", mode: "mute" }];
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
    active: true,
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
  return operations
    .map((operation) => ({ active: true, ...operation }))
    .filter((operation) => {
      const key = JSON.stringify({ ...operation, active: undefined });
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

function overlayPosition(prompt) {
  if (looksLike(prompt, ["lewy gorny", "lewa gora", "u gory po lewej"])) return "18:18";
  if (looksLike(prompt, ["prawy gorny", "prawa gora", "u gory po prawej"])) return "main_w-overlay_w-18:18";
  if (looksLike(prompt, ["lewy dolny", "lewy dol", "na dole po lewej"])) return "18:main_h-overlay_h-18";
  if (looksLike(prompt, ["srodek", "centrum", "na srodku"])) return "(main_w-overlay_w)/2:(main_h-overlay_h)/2";
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

function overlayDetailFromPosition(position) {
  return {
    "x=24:y=24": "w lewym gornym rogu",
    "x=w-tw-24:y=24": "w prawym gornym rogu",
    "x=24:y=h-th-28": "w lewym dolnym rogu",
    "x=w-tw-24:y=h-th-28": "w prawym dolnym rogu",
    "x=(w-tw)/2:y=(h-th)/2": "na srodku",
  }[position] || "w prawym dolnym rogu";
}

function formatTime(seconds) {
  return `${Number(seconds.toFixed(2))} s`;
}

function getRenderState(videoFile, imageFile, operations) {
  const activeOperations = operations.filter((operation) => operation.active !== false);
  const needsImage = activeOperations.some((operation) => operation.type === "overlay");
  const hasServerOnlyOperation = operations.some((operation) => operation.active !== false && operation.capability && operation.capability !== "browser");
  const hasInvalidCut = activeOperations.some(
    (operation) => operation.type === "cut" && (!Number.isFinite(operation.start) || !Number.isFinite(operation.end) || operation.end <= operation.start),
  );

  let title = "";
  if (hasInvalidCut) title = "Popraw czas ciecia: koniec musi byc pozniej niz start.";
  else if (hasServerOnlyOperation) title = "Plan zawiera aktywne operacje wymagajace backendu.";
  else if (needsImage && !imageFile) title = "Dodaj obrazek potrzebny do nakladki.";

  return {
    disabled: !videoFile || !activeOperations.length || (needsImage && !imageFile) || hasServerOnlyOperation || hasInvalidCut,
    title,
  };
}

function getFfmpegDependencies() {
  const FFmpeg = window.FFmpegWASM?.FFmpeg;
  const toBlobURL = window.FFmpegUtil?.toBlobURL;
  if (!FFmpeg || !toBlobURL) return null;
  return { FFmpeg, toBlobURL };
}

async function runFfmpegRender({ dependencies, videoFile, imageFile, activeOperations, setStatus }) {
  try {
    return await renderWithFfmpegAttempt({
      dependencies,
      videoFile,
      imageFile,
      activeOperations,
      setStatus,
      forceNoAudio: false,
    });
  } catch (error) {
    const hasAudioOperation = activeOperations.some((operation) => operation.type === "audio" || operation.type === "cut" || operation.type === "speed");
    if (!hasAudioOperation) throw error;

    setStatus("Pierwszy render nie utworzyl wyniku. Ponawiam bez sciezki audio...");
    return renderWithFfmpegAttempt({
      dependencies,
      videoFile,
      imageFile,
      activeOperations,
      setStatus,
      forceNoAudio: true,
    });
  }
}

async function renderWithFfmpegAttempt({ dependencies, videoFile, imageFile, activeOperations, setStatus, forceNoAudio }) {
  const { FFmpeg, toBlobURL } = dependencies;
  const ffmpeg = new FFmpeg();
  let renderStep = "ladowanie FFmpeg";
  const logs = [];

  ffmpeg.on("log", ({ message }) => {
    if (!message) return;
    logs.push(message);
    if (logs.length > 12) logs.shift();
    if (!message.includes("frame=")) setStatus(message);
  });
  ffmpeg.on("progress", ({ progress }) => {
    setStatus(`Renderowanie: ${Math.max(0, Math.min(100, Math.round(progress * 100)))}%`);
  });

  try {
    const coreBaseUrl = "/vendor/ffmpeg/core/dist/umd";
    await ffmpeg.load({
      coreURL: await toBlobURL(`${coreBaseUrl}/ffmpeg-core.js`, "text/javascript"),
      wasmURL: await toBlobURL(`${coreBaseUrl}/ffmpeg-core.wasm`, "application/wasm"),
    });

    renderStep = "zapis plikow wejsciowych";
    const inputName = `input.${extensionFromType(videoFile.type, "mp4")}`;
    const imageName = imageFile ? `overlay.${extensionFromType(imageFile.type, "png")}` : null;
    const outputName = "output.mp4";

    await ffmpeg.writeFile(inputName, new Uint8Array(await videoFile.arrayBuffer()));
    if (imageFile && imageName) {
      await ffmpeg.writeFile(imageName, new Uint8Array(await imageFile.arrayBuffer()));
    }

    renderStep = "wykonanie FFmpeg";
    const args = buildFfmpegArgs(activeOperations, inputName, imageName, outputName, { forceNoAudio });
    setStatus(forceNoAudio ? "Renderowanie bez sciezki audio..." : "Renderowanie wystartowalo...");
    const exitCode = await ffmpeg.exec(args);
    if (exitCode) {
      const error = new Error(`FFmpeg zakonczyl prace kodem ${exitCode}.`);
      error.ffmpegArgs = args.join(" ");
      throw error;
    }

    renderStep = "odczyt pliku wyjsciowego";
    return await ffmpeg.readFile(outputName);
  } catch (error) {
    error.renderStep = error.renderStep || renderStep;
    error.ffmpegLogs = error.ffmpegLogs || logs.filter((message) => !message.includes("frame=")).slice(-4);
    throw error;
  } finally {
    ffmpeg.terminate();
  }
}

function buildFfmpegArgs(activeOperations, inputName, imageName, outputName, options = {}) {
  const forceNoAudio = options.forceNoAudio === true;
  const cuts = activeOperations.filter((operation) => operation.type === "cut");
  const filters = activeOperations.filter((operation) => operation.type === "filter");
  const speed = activeOperations.find((operation) => operation.type === "speed");
  const mute = forceNoAudio || activeOperations.some((operation) => operation.type === "audio" && operation.mode === "mute");
  const overlay = activeOperations.find((operation) => operation.type === "overlay");
  const text = activeOperations.find((operation) => operation.type === "text");
  const args = ["-i", inputName];

  if (overlay && imageName) args.push("-i", imageName);

  const filterGraph = [];
  const videoFilters = [];
  const audioFilters = [];

  if (cuts.length) {
    const keepExpression = cuts.map((cut) => `not(between(t\\,${cut.start}\\,${cut.end}))`).join("*");
    videoFilters.push(`select='${keepExpression}',setpts=N/FRAME_RATE/TB`);
    if (!forceNoAudio) audioFilters.push(`aselect='${keepExpression}',asetpts=N/SR/TB`);
  }

  videoFilters.push(...filters.map((operation) => operation.ffmpeg));
  if (speed) {
    videoFilters.push(speed.video);
    if (!forceNoAudio) audioFilters.push(speed.audio);
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

  if (mute) args.push("-an");
  else args.push("-c:a", "aac");

  args.push("-c:v", "libx264", "-preset", "veryfast", "-pix_fmt", "yuv420p", "-movflags", "+faststart", outputName);
  return args;
}

function friendlyRenderError(error) {
  const step = error.renderStep ? `${error.renderStep}: ` : "";
  const message = error?.message || String(error);
  const logs = Array.isArray(error.ffmpegLogs) && error.ffmpegLogs.length ? ` Ostatni log: ${error.ffmpegLogs.at(-1)}` : "";
  if (message.includes("FS error")) {
    return `${step}FFmpeg nie utworzyl albo nie odczytal pliku wyjsciowego. Sprobuj krotszego pliku MP4/H.264 albo prostszego planu.${logs}`;
  }
  return `${step}${message}${logs}`;
}

function drawTextFilter(operation) {
  return `drawtext=text='${escapeDrawtext(operation.text)}':${operation.position}:fontsize=42:fontcolor=white:box=1:boxcolor=black@0.45:boxborderw=14`;
}

function escapeDrawtext(value) {
  return value.replace(/\\/g, "\\\\").replace(/:/g, "\\:").replace(/'/g, "\\'");
}

function extensionFromType(type, fallback) {
  return type?.split("/")[1]?.replace("quicktime", "mov") || fallback;
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
      frames.push({ time, dataUrl: canvas.toDataURL("image/jpeg", 0.72) });
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
