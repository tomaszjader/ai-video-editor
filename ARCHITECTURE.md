# Architektura AI Video Editor

## Cel

Aplikacja ma dzialac jak edytor text-to-video: uzytkownik opisuje oczekiwana zmiane, a system zamienia polecenie na plan operacji, analizuje obraz/audio i wykonuje mozliwe edycje.

## Warstwy

1. Frontend React
   - wybiera plik wideo,
   - pokazuje podglad,
   - probkuje klatki do analizy AI,
   - wyswietla plan edycji przed zapisem,
   - renderuje proste operacje przez FFmpeg.wasm.

2. Backend AI
   - trzyma `OPENAI_API_KEY`,
   - przyjmuje polecenie i probki klatek,
   - uzywa OpenAI Responses API z wyjsciem JSON Schema,
   - zwraca plan operacji z polem `capability`.

3. Backend renderingu
   - kolejny etap projektu,
   - powinien wykonywac dlugie zadania FFmpeg,
   - powinien obslugiwac segmentacje, maski, inpainting, transkrypcje, napisy i eksport.

## Modele i zadania

- NLP / planowanie: model tekstowo-wizyjny przez Responses API.
- Analiza obrazu: wysylanie klatek jako `input_image`.
- Audio: Speech to Text dla transkrypcji i napisow.
- Generowanie / edycja obrazu: GPT Image do generowania lub uzupelniania elementow, z zastrzezeniem ze stabilne usuwanie obiektu w wideo wymaga spojnych masek i temporal consistency.
- Rendering: FFmpeg lokalnie dla prostych operacji, FFmpeg serwerowo dla dlugich i zlozonych zadan.

## Plan operacji

Backend zwraca:

```json
{
  "summary": "Krotki opis planu",
  "operations": [
    {
      "type": "cut",
      "label": "usun fragment",
      "detail": "00:10 - 00:20",
      "capability": "browser",
      "start": 10,
      "end": 20,
      "ffmpeg": null,
      "position": null,
      "text": null,
      "mode": null
    }
  ],
  "warnings": []
}
```

`capability=browser` oznacza, ze obecny frontend moze sprobowac wyrenderowac operacje. `server_required` i `ai_required` oznaczaja, ze aplikacja potrafi rozumiec intencje, ale potrzebuje kolejnej warstwy wykonawczej.

## Zrodla OpenAI

- Latest model / Responses API guidance: https://developers.openai.com/api/docs/guides/latest-model
- Images and vision: https://developers.openai.com/api/docs/guides/images-vision
- Structured outputs: https://platform.openai.com/docs/guides/structured-outputs
- Audio and speech: https://developers.openai.com/api/docs/guides/audio
- Image generation and editing: https://developers.openai.com/api/docs/guides/image-generation
