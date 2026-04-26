import express from "express";
import OpenAI from "openai";
import "dotenv/config";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const port = Number(process.env.PORT || 5173);
const model = process.env.OPENAI_MODEL || "gpt-5.5";

const app = express();
app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", req.headers.origin || "*");
  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type,Authorization");

  if (req.method === "OPTIONS") {
    res.sendStatus(204);
    return;
  }

  next();
});
app.use(express.json({ limit: "24mb" }));
app.use("/vendor/ffmpeg/ffmpeg", express.static(path.join(__dirname, "node_modules/@ffmpeg/ffmpeg")));
app.use("/vendor/ffmpeg/core", express.static(path.join(__dirname, "node_modules/@ffmpeg/core")));
app.use("/vendor/ffmpeg/util", express.static(path.join(__dirname, "node_modules/@ffmpeg/util")));
app.use(express.static(__dirname));

const operationSchema = {
  type: "object",
  additionalProperties: false,
  required: ["type", "label", "detail", "capability", "start", "end", "ffmpeg", "position", "text", "mode"],
  properties: {
    type: {
      type: "string",
      enum: ["cut", "filter", "overlay", "text", "speed", "audio", "subtitles", "object_removal", "analysis"],
    },
    label: { type: "string" },
    detail: { type: "string" },
    capability: { type: "string", enum: ["browser", "server_required", "ai_required"] },
    start: { type: ["number", "null"] },
    end: { type: ["number", "null"] },
    ffmpeg: { type: ["string", "null"] },
    position: { type: ["string", "null"] },
    text: { type: ["string", "null"] },
    mode: { type: ["string", "null"] },
  },
};

const planSchema = {
  type: "object",
  additionalProperties: false,
  required: ["summary", "operations", "warnings"],
  properties: {
    summary: { type: "string" },
    operations: { type: "array", items: operationSchema },
    warnings: { type: "array", items: { type: "string" } },
  },
};

app.get("/api/health", (_req, res) => {
  res.json({
    ok: true,
    ai: Boolean(process.env.OPENAI_API_KEY),
    model,
  });
});

app.post("/api/ai/plan", async (req, res) => {
  if (!process.env.OPENAI_API_KEY) {
    res.status(503).json({
      error: "Brak OPENAI_API_KEY. Utworz .env albo ustaw zmienna srodowiskowa przed uruchomieniem serwera.",
    });
    return;
  }

  const { prompt, video, frames = [] } = req.body || {};
  if (!prompt || typeof prompt !== "string") {
    res.status(400).json({ error: "Brak polecenia tekstowego." });
    return;
  }

  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const content = [
    {
      type: "input_text",
      text: [
        "Zamien polecenie uzytkownika na plan edycji wideo.",
        "Jesli operacja jest mozliwa w przegladarce przez FFmpeg.wasm, ustaw capability=browser.",
        "Jesli wymaga segmentacji, inpaintingu, generowania tla, rozpoznania mowy albo dluzszego renderingu, ustaw server_required albo ai_required.",
        "Dla filtrow podawaj bezpieczny lancuch FFmpeg w polu ffmpeg, gdy pasuje.",
        "Dla ciec wypelnij start i end w sekundach.",
        "Dla dodania napisow po polsku uzyj type=subtitles.",
        "Dla usuniecia osoby/obiektu uzyj type=object_removal i opisz wymagane maskowanie/inpainting.",
        "",
        `Polecenie: ${prompt}`,
        `Metadane wideo: ${JSON.stringify(video || {})}`,
      ].join("\n"),
    },
  ];

  for (const frame of frames.slice(0, 6)) {
    if (typeof frame?.dataUrl === "string" && frame.dataUrl.startsWith("data:image/")) {
      content.push({
        type: "input_image",
        image_url: frame.dataUrl,
        detail: "low",
      });
    }
  }

  try {
    const response = await client.responses.create({
      model,
      reasoning: { effort: "low" },
      input: [
        {
          role: "system",
          content:
            "Jestes silnikiem planowania dla aplikacji text-to-video editing. Zwracasz tylko poprawny plan JSON zgodny ze schematem. Nie obiecuj wykonania operacji, ktore wymagaja dodatkowego modelu lub backendowego renderingu.",
        },
        { role: "user", content },
      ],
      text: {
        format: {
          type: "json_schema",
          name: "video_edit_plan",
          strict: true,
          schema: planSchema,
        },
      },
    });

    const text = response.output_text || "{}";
    res.json(JSON.parse(text));
  } catch (error) {
    console.error(error);
    res.status(500).json({
      error: "Nie udalo sie wygenerowac planu AI.",
      detail: error?.message || String(error),
    });
  }
});

app.listen(port, () => {
  console.log(`AI Video Editor: http://localhost:${port}`);
});
