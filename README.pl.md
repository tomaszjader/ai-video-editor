# AI Edytor Wideo

Prototyp narzędzia do edycji wideo poleceniami tekstowymi. Użytkownik wczytuje lokalny film, opisuje oczekiwaną zmianę, a aplikacja zamienia polecenie na plan edycji. Proste operacje są renderowane lokalnie w przeglądarce przez FFmpeg.wasm, a trudniejsze zadania są oznaczane jako wymagające backendu lub dodatkowych modeli AI.

## Co działa

- wczytywanie lokalnego pliku wideo i podgląd w przeglądarce,
- dodawanie opcjonalnego obrazka jako nakładki, np. logo,
- szybki lokalny parser poleceń jako fallback,
- backend `/api/ai/plan` korzystający z OpenAI Responses API,
- analiza polecenia tekstowego oraz próbek klatek z filmu,
- plan operacji w JSON: cięcia, filtry, tekst, nakładki, tempo, audio, napisy i usuwanie obiektów,
- ręczna korekta planu: włączanie, wyłączanie, usuwanie oraz edycja czasu cięcia, tekstu i pozycji,
- lokalny render prostych operacji przez FFmpeg.wasm,
- rozpoznawanie operacji wymagających dalszego etapu, np. segmentacji, inpaintingu, transkrypcji albo napisów.

## Wymagania

- Node.js 18 lub nowszy,
- klucz `OPENAI_API_KEY` do planowania AI,
- przeglądarka z obsługą nowoczesnych API webowych,
- internet przy planowaniu AI oraz przy pobieraniu zależności npm.

## Instalacja i uruchomienie

Zainstaluj zależności:

```powershell
npm install
```

Utwórz plik `.env` na podstawie przykładu:

```powershell
copy .env.example .env
```

Wpisz swój klucz i ustawienia:

```text
OPENAI_API_KEY=sk-proj-your-key-here
OPENAI_MODEL=gpt-5.5
PORT=5173
CORS_ORIGIN=http://localhost:5173,http://127.0.0.1:5173
```

Uruchom aplikację:

```powershell
npm run dev
```

Otwórz w przeglądarce:

```text
http://localhost:5173
```

Ten sam serwer obsługuje frontend, API oraz lokalne pliki FFmpeg, więc nie uruchamiaj `index.html` bezpośrednio ani przez Live Server.

## Build produkcyjny

```powershell
npm run build
```

Po zbudowaniu aplikacji można uruchomić serwer:

```powershell
npm start
```

## Przykładowe polecenia

```text
Wytnij fragment od 00:10 do 00:20 i dodaj filtr kinowy.
```

```text
Dodaj tekst "AI EDIT" w prawym dolnym rogu.
```

```text
Dodaj logo w prawym górnym rogu i wycisz audio.
```

```text
Usuń osobę z tła i uzupełnij brakujące tło.
```

## Jak to działa

Frontend React próbuje najpierw rozpoznać część poleceń lokalnie. Po użyciu planowania AI pobiera kilka klatek z filmu przez `canvas` i wysyła je razem z poleceniem do backendu. Backend trzyma klucz API poza przeglądarką, wywołuje OpenAI Responses API i wymusza odpowiedź zgodną ze schematem planu edycji.

Operacje z `capability=browser` mogą być renderowane lokalnie przez FFmpeg.wasm. Operacje `server_required` i `ai_required` są rozumiane przez aplikację, ale wymagają kolejnego etapu, np. renderingu serwerowego, segmentacji, masek, inpaintingu, OCR, ASR albo generowania napisów.

## Typowe problemy

Jeśli widzisz `usage-monitoring.js` albo adres `chrome-extension://...` w konsoli, log najpewniej pochodzi z rozszerzenia przeglądarki, nie z aplikacji. Sprawdź stronę w oknie incognito bez rozszerzeń.

Jeśli pojawia się błąd podobny do `failed to import ffmpeg-core.js`, uruchom aplikację przez `npm run dev` i wejdź na `http://localhost:5173`. Po zmianach wykonaj twarde odświeżenie `Ctrl+F5`.

Jeśli planowanie AI zwraca błąd o braku klucza, sprawdź `.env`, upewnij się, że `OPENAI_API_KEY` zaczyna się od `sk-`, i uruchom serwer ponownie.

## Następne kroki

- ekstrakcja audio na backendzie i transkrypcja przez Speech to Text,
- wykrywanie scen i obiektów na większej liczbie klatek,
- segmentacja i maski dla `object_removal`,
- inpainting klatek i składanie wynikowego wideo na backendzie,
- pełny system napisów: SRT/VTT, tłumaczenie i korekta timingów,
- kolejka zadań dla długich filmów.

