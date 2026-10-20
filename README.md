# Forma

Prywatna aplikacja do treningu i liczenia jedzenia dla Ciebie i kilku zaufanych osób. Działa na Twoim komputerze, a korzystać z niej można z iPhone'a, Androida, MacBooka i komputera z Windows w przeglądarce albo jako aplikację zainstalowaną na ekranie głównym (PWA).

- **Generator planów treningowych.** Plan jest deterministyczny i sprawdzany przez osobny walidator. Uwzględnia dni, w których masz dostęp do siłowni, kilka miejsc treningu z różnym sprzętem, preferencje (maszyny, wolne ciężary, masa ciała), ulubione, wykluczone i bolesne ćwiczenia, priorytety partii mięśni oraz inne sporty.
- **Rejestrator treningu.** Ma tryb prosty (odhaczasz ćwiczenia) i szczegółowy (zapisujesz serie). Pozwala zamienić ćwiczenie, zmienić miejsce, skrócić trening do 15–45 minut i włączyć opcjonalny minutnik przerw. Działa przy chwilowym braku internetu.
- **Dziennik jedzenia.** Obsługuje kody kreskowe EAN i UPC (Open Food Facts), ulubione, ostatnie produkty, posiłki, przepisy i szybkie wpisy samych kalorii. Brakujące wartości odżywcze zostają oznaczone jako brakujące, nigdy nie są traktowane jak zero.
- **Postępy.** Pokazuje trend masy ciała, ostrożne szacowanie zapotrzebowania z Twoich danych (bez wyniku, gdy danych jest za mało) i rekordy, przy których szacunki są wyraźnie oznaczone.
- **Prywatność.** Każdy użytkownik widzi tylko swoje dane, a rejestracja odbywa się wyłącznie przez zaproszenie. Możesz wyeksportować i usunąć konto. Aplikacja nie wysyła żadnej telemetrii.
- **Asystent AI jest opcjonalny.** Wszystkie podstawowe funkcje działają bez niego i bez żadnych płatnych usług.

> Aplikacja nie jest wyrobem medycznym. Przy bólu lub problemach zdrowotnych skonsultuj się ze specjalistą.

## Wymagania

- **Node.js 22.13 lub nowszy** (zalecany 24). Aplikacja korzysta z wbudowanego w Node SQLite, więc nie trzeba instalować bazy danych ani kompilować modułów.
- Około 300 MB miejsca na `node_modules`.

## Pierwsze uruchomienie

```bash
npm install
```
```bash
npm run build
```
```bash
npm start
```

Otwórz `http://localhost:3000`. **Pierwsze utworzone konto zostaje administratorem.** Kolejne osoby rejestrują się kodem zaproszenia (Ustawienia → Zaproszenia).

Tryb deweloperski z automatycznym przeładowaniem:

```bash
npm run dev
```

Ustawienia opcjonalne skopiuj z `.env.example` do `.env.local`. Żadne z nich nie jest wymagane.

Alternatywnie w Dockerze (dane w `./data`):

```bash
docker compose up -d --build
```

## Dostęp z telefonu i innych komputerów

To ważne rozróżnienie:

| Sposób | Adres | Działa z telefonu? | Aparat (skanowanie kodów) |
|---|---|---|---|
| Tylko ten komputer | `http://localhost:3000` | ❌ „localhost” na iPhonie oznacza sam iPhone | ✅ |
| Sieć domowa (Wi-Fi) | `http://192.168.x.x:3000` | ✅ w tej samej sieci | ❌ przeglądarki wymagają HTTPS |
| Prywatny VPN (Tailscale), zalecane | `https://twoj-komputer.twoja-siec.ts.net` | ✅ w domu i poza domem | ✅ |

**Sieć domowa:** serwer nasłuchuje na wszystkich interfejsach (`-H 0.0.0.0`). Adres komputera sprawdzisz poleceniem `ipconfig` (Windows) lub `ipconfig getifaddr en0` (Mac). Na Windowsie przy pierwszym uruchomieniu zezwól Node.js na dostęp w **sieci prywatnej** w zaporze.

**Tailscale (HTTPS, aparat, dostęp spoza domu, bez wystawiania aplikacji do internetu):**

1. Zainstaluj Tailscale na komputerze z aplikacją i na telefonach (darmowy plan osobisty). Zaloguj wszystkie urządzenia do tej samej sieci.
2. W panelu Tailscale włącz *MagicDNS* i *HTTPS Certificates*.
3. Na komputerze z aplikacją uruchom:
   ```bash
   tailscale serve --bg 3000
   ```
4. W `.env.local` ustaw `COOKIE_SECURE=true` oraz `ALLOWED_ORIGINS=` z adresem komputera w Tailscale (np. `moj-pc.tail1234.ts.net`). Następnie zbuduj i uruchom aplikację ponownie.
5. Na telefonie otwórz adres `https://…ts.net` wyświetlony przez Tailscale. Na iPhonie w Safari wybierz *Udostępnij → Do ekranu początkowego*, na Androidzie w Chrome *Zainstaluj aplikację*.

Aplikacja pozostaje dostępna wyłącznie dla urządzeń w Twojej prywatnej sieci Tailscale. Nie używaj `tailscale funnel`, bo to wystawiłoby ją publicznie.

Do szybkiego testu aparatu w sieci lokalnej możesz też użyć `npm run dev:https` (certyfikat samopodpisany). Telefon pokaże ostrzeżenie o certyfikacie, dlatego do codziennego użytku polecam Tailscale.

## Zapraszanie osób

- W aplikacji: **Ustawienia → Zaproszenia → Utwórz kod zaproszenia**. Kod działa jednorazowo przez 14 dni i jest widoczny tylko raz.
- Z wiersza poleceń (gdy nikt nie może się zalogować):
  ```bash
  npm run invite -- "dla Ani"
  ```

Administrator może zapraszać osoby, ale **nie widzi** cudzych treningów, jedzenia ani wag.

## Kopie zapasowe

Kopię można zrobić w trakcie działania aplikacji:

```bash
npm run backup
```

Plik trafia do `backups/forma-RRRR-MM-DD-GGMM.db`. Domyślnie zostaje 30 najnowszych kopii (`BACKUP_KEEP`). Na Windowsie możesz zaplanować to polecenie w Harmonogramie zadań, na Macu w `cron` lub `launchd`.

Przywracanie: **najpierw zatrzymaj aplikację**, potem uruchom:

```bash
npm run restore -- backups/forma-2026-10-20-1830.db
```

Skrypt sprawdza integralność kopii i zachowuje obecną bazę jako `data/forma.db.before-restore-…`.

Każdy użytkownik może też pobrać swoje dane w formacie JSON (Ustawienia → Twoje dane).

## Aktualizacja

```bash
git pull
```
```bash
npm install
```
```bash
npm run build
```

Następnie uruchom aplikację ponownie. Migracje bazy wykonują się automatycznie przy starcie. Przed aktualizacją zrób kopię zapasową.

## Opcjonalny asystent AI

Asystent nie jest potrzebny do żadnej podstawowej funkcji. Interfejs dostawcy jest przygotowany (`AI_PROVIDER`, `ANTHROPIC_API_KEY` w `.env.local`), a funkcje AI są zaplanowane na fazę 3 ([docs/roadmap.md](docs/roadmap.md)). Klucz pozostaje na serwerze. Dane użytkownika nie są nigdzie wysyłane bez Twojej zgody.

## Koszty i usługi zewnętrzne

- **0 zł.** Brak płatnych usług, subskrypcji i reklam.
- **Open Food Facts** to darmowa, otwarta baza produktów (licencja ODbL). Aplikacja przestrzega limitów zapytań, zapisuje wyniki w pamięci podręcznej i nie wyszukuje przy każdym naciśnięciu klawisza. Wpisz swój e-mail w `OFF_CONTACT`, o co proszą twórcy bazy.
- **Tailscale** jest opcjonalny. Plan osobisty jest darmowy.

## Testy

```bash
npm test
```
```bash
npm run typecheck
```

Szczegóły: [docs/testing.md](docs/testing.md).

## Dokumentacja

- [Architektura](docs/architecture.md)
- [Schemat bazy danych](docs/database.md)
- [Silnik planów treningowych](docs/training-engine.md)
- [Rejestr dowodów naukowych](docs/evidence.md)
- [Integracje (Open Food Facts, kody kreskowe)](docs/integrations.md)
- [Testy](docs/testing.md)
- [Identyfikacja wizualna](docs/brand.md)
- [Ograniczenia i plan rozwoju](docs/roadmap.md)

Nazwę aplikacji zmienisz zmienną `NEXT_PUBLIC_APP_NAME`.
