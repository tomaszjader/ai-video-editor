# AI Video Editor

Prototyp przegladarkowego edytora wideo sterowanego tekstem albo mowa.

## Co potrafi teraz

- wczytuje lokalne wideo w przegladarce,
- rozpoznaje proste komendy po polsku:
  - `usun trzy pierwsze sekundy filmu`,
  - `usun od 30 do 35 sekundy`,
  - `dodaj filtr czarno-bialy`,
  - `dodaj filtr sepia`,
  - `dodaj obrazek w prawym dolnym rogu`,
- obsluguje dyktowanie przez Web Speech API, jesli przegladarka je wspiera,
- renderuje wynik lokalnie przez FFmpeg.wasm.

## Uruchomienie

Nie otwieraj `index.html` bezposrednio jako `file://...`, bo FFmpeg.wasm uzywa workerow i plikow `.wasm`, ktore przegladarka blokuje w tym trybie.

Najprosciej uruchomic lokalny serwer w katalogu projektu:

```powershell
python -m http.server 5173
```

Potem otworz:

```text
http://localhost:5173
```

FFmpeg.wasm jest ladowany z CDN, wiec pierwszy render wymaga internetu i moze potrwac.

## Przykladowe polecenie

```text
Usun trzy pierwsze sekundy filmu, usun od 30 do 35 sekundy, dodaj filtr czarno-bialy i dodaj obrazek w prawym dolnym rogu.
```

## Nastepne kroki

- podlaczenie prawdziwego modelu AI do zamiany swobodnych polecen na JSON operacji,
- timeline z reczna korekta ciec,
- wiecej filtrow i animowane nakladki,
- backend renderujacy dlugie filmy poza przegladarka.
