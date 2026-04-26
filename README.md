# AI Edytor Wideo

Prototyp narzedzia typu text-to-video editing: uzytkownik wpisuje polecenie, AI analizuje tekst oraz probki obrazu z filmu, a aplikacja uklada plan edycji i renderuje operacje mozliwe lokalnie przez FFmpeg.wasm.

## Co dziala teraz

- wczytywanie lokalnego wideo i podglad w przegladarce,
- lokalny szybki parser polecen jako fallback,
- backend `/api/ai/plan` z OpenAI Responses API,
- analiza polecenia tekstowego i kilku klatek filmu,
- plan operacji w JSON: ciecia, filtry, logo, tekst, tempo, audio, napisy, usuwanie obiektow,
- render w przegladarce dla prostych operacji FFmpeg,
- oznaczanie operacji wymagajacych backendu AI, np. usuniecie osoby z tla, segmentacja, inpainting, automatyczne napisy.

## Wymagania

- Node.js 18+,
- klucz `OPENAI_API_KEY`,
- internet przy pierwszym renderze FFmpeg.wasm i przy planowaniu AI.

## Uruchomienie

Zainstaluj zaleznosci:

```powershell
npm install
```

Utworz plik `.env` na podstawie `.env.example`:

```powershell
copy .env.example .env
```

Wpisz w `.env` swoj klucz:

```text
OPENAI_API_KEY=sk-proj-...
OPENAI_MODEL=gpt-5.5
PORT=5173
```

Uruchom aplikacje:

```powershell
npm run dev
```

Otworz:

```text
http://localhost:5173
```

Najprosciej korzystac wlasnie z tego adresu, bo ten sam serwer obsluguje frontend i API.

Jesli uruchamiasz `index.html` przez VS Code Live Server, np. `http://127.0.0.1:5500`, backend Node nadal musi dzialac osobno przez `npm run dev`. Frontend sprobuje wtedy automatycznie znalezc API pod `http://localhost:5173` albo `http://localhost:5174`.

## Typowe problemy

`usage-monitoring.js` albo `chrome-extension://...` w konsoli zwykle pochodzi z rozszerzenia przegladarki, nie z aplikacji. Sprawdz w oknie incognito bez rozszerzen, jesli logi przeszkadzaja.

`failed to import ffmpeg-core.js` oznacza, ze przegladarka nie zaladowala silnika FFmpeg.wasm. Uruchom aplikacje przez `npm run dev` i wejdz na `http://localhost:5173`, a po zmianach zrob twarde odswiezenie `Ctrl+F5`. Pliki FFmpeg sa serwowane lokalnie z `node_modules`, wiec po instalacji zaleznosci nie powinny zalezec od CDN.

## Przykladowe polecenia

```text
Wytnij fragment od 00:10 do 00:20 i dodaj filtr kinowy.
```

```text
Usun osobe z tla i uzupelnij brakujace tlo.
```

```text
Dodaj napisy po polsku i wstaw logo w prawym dolnym rogu.
```

## Jak to jest zaprojektowane

Frontend probkuje kilka klatek z filmu przez canvas i wysyla je razem z poleceniem do backendu. Backend nie dostaje klucza z przegladarki, tylko sam wywoluje OpenAI Responses API i wymusza odpowiedz zgodna ze schematem planu edycji.

Operacje oznaczone `browser` moga byc renderowane lokalnie przez FFmpeg.wasm. Operacje oznaczone `server_required` albo `ai_required` sa poprawnie rozpoznawane, ale wymagaja kolejnego etapu: serwerowego renderingu FFmpeg, segmentacji, inpaintingu, OCR/ASR albo generowania obrazu.

## Nastepne kroki produkcyjne

- ekstrakcja audio na backendzie i transkrypcja przez Speech to Text,
- wykrywanie scen i obiektow na wiekszej liczbie klatek,
- integracja segmentacji/masek dla `object_removal`,
- inpainting klatek i skladanie wyniku wideo na backendzie,
- prawdziwy system napisow: SRT/VTT, tlumaczenie, korekta timingow,
- kolejka zadan dla dlugich filmow zamiast renderowania w jednym zadaniu HTTP.
