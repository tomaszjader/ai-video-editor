# AI Video Editor

A prototype text-to-video editing tool. The user loads a local video, describes the desired change, and the app turns that instruction into an editable operation plan. Simple edits are rendered locally in the browser with FFmpeg.wasm, while more advanced tasks are marked as requiring a backend or additional AI models.

## What Works

- local video upload and browser preview,
- optional image upload for overlays, such as logos,
- fast local command parser as a fallback,
- `/api/ai/plan` backend powered by the OpenAI Responses API,
- analysis of the text prompt and sampled video frames,
- JSON edit plan with cuts, filters, text, overlays, speed, audio, subtitles, and object removal,
- manual plan editing: enable, disable, delete, and adjust cut timing, text, and position,
- local rendering for simple FFmpeg.wasm operations,
- detection of operations that need a later backend stage, such as segmentation, inpainting, transcription, or subtitles.

## Requirements

- Node.js 18 or newer,
- an `OPENAI_API_KEY` for AI planning,
- a browser with modern Web API support,
- internet access for AI planning and npm dependency installation.

## Installation and Running

Install dependencies:

```powershell
npm install
```

Create `.env` from the example file:

```powershell
copy .env.example .env
```

Add your key and settings:

```text
OPENAI_API_KEY=sk-proj-your-key-here
OPENAI_MODEL=gpt-5.5
PORT=5173
CORS_ORIGIN=http://localhost:5173,http://127.0.0.1:5173
```

Start the app:

```powershell
npm run dev
```

Open it in your browser:

```text
http://localhost:5173
```

The same server serves the frontend, API, and local FFmpeg files, so do not open `index.html` directly or through Live Server.

## Production Build

```powershell
npm run build
```

After building, run the server:

```powershell
npm start
```

## Example Prompts

```text
Cut the fragment from 00:10 to 00:20 and add a cinematic filter.
```

```text
Add the text "AI EDIT" in the bottom-right corner.
```

```text
Add a logo in the top-right corner and mute the audio.
```

```text
Remove the person from the background and fill in the missing background.
```

## How It Works

The React frontend first tries to understand part of the prompt locally. When AI planning is used, it samples several video frames through `canvas` and sends them with the prompt to the backend. The backend keeps the API key out of the browser, calls the OpenAI Responses API, and enforces a structured edit-plan schema.

Operations with `capability=browser` can be rendered locally through FFmpeg.wasm. Operations marked as `server_required` or `ai_required` are understood by the app, but need a later stage such as server-side rendering, segmentation, masks, inpainting, OCR, ASR, or subtitle generation.

## Common Issues

If you see `usage-monitoring.js` or a `chrome-extension://...` URL in the console, the log most likely comes from a browser extension, not the app. Try an incognito window with extensions disabled.

If you see an error similar to `failed to import ffmpeg-core.js`, run the app with `npm run dev` and open `http://localhost:5173`. After changes, do a hard refresh with `Ctrl+F5`.

If AI planning returns a missing-key error, check `.env`, make sure `OPENAI_API_KEY` starts with `sk-`, and restart the server.

## Next Steps

- backend audio extraction and Speech to Text transcription,
- scene and object detection across more sampled frames,
- segmentation and masks for `object_removal`,
- frame inpainting and backend video assembly,
- full subtitle workflow: SRT/VTT, translation, and timing correction,
- a job queue for long videos.

