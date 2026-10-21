# Forma

Prywatna aplikacja do treningu i liczenia jedzenia dla Ciebie i kilku zaufanych osób. Działa w przeglądarce na iPhonie, Androidzie i komputerze i można ją dodać do ekranu głównego jak zwykłą aplikację (PWA). W chmurze (Vercel + Supabase) działa bez włączonego komputera.

- **Generator planów treningowych.** Plan jest deterministyczny i sprawdzany przez osobny walidator. Uwzględnia:
  - dni i miejsca treningu (albo „dowolne dni, aplikacja dobierze”) oraz sprzęt w każdym miejscu;
  - preferencje: maszyny, wolne ciężary, masa ciała (można wybrać kilka);
  - ulubione, wykluczone i bolesne ćwiczenia, priorytety partii mięśni i inne sporty.

  Jeśli plan Ci się nie podoba, zaznaczasz powody, a aplikacja układa nowy.
- **Trening.** Czas całego treningu leci na górze ekranu, a przerwę włączasz jednym kliknięciem. Jest tryb prosty i szczegółowy, zamiana ćwiczeń, wybór chwytu (wąski lub szeroki) i okno „Jak to zrobić?” z linkiem do filmu z techniką. Zapisane serie nie giną przy chwilowym braku internetu.
- **Plan jak ładny dokument.** Czytelny widok dni i ćwiczeń z przyciskiem **Drukuj / PDF**. W Ustawieniach można wyłączyć zapisywanie treningów i mieć sam plan do wglądu.
- **Podsumowanie po treningu.** Czas, serie, partie ciała i postęp względem poprzedniego razu, z rekordami.
- **„Pomiń” z głową.** Zamiast przepadać, trening można zrobić krócej (20/30/45 min, najważniejsze ćwiczenia zostają), w innym miejscu albo w wersji bez sprzętu z tym samym celem (np. wiosłowanie pod stołem zamiast wiosłowania hantlami). Można go też przełożyć na następny raz albo pominąć, a kolejność w planie przesunie się dalej.
- **Jedzenie.** Cztery szybkie przyciski: Szukaj, Skanuj (kod kreskowy, także ze zdjęcia kodu), Zdjęcie i Opisz (z AI). Pod dziennikiem są ostatnie produkty z dodawaniem jednym kliknięciem. Są też ulubione, posiłki, przepisy i szybkie wpisy samych kalorii. Brakujące wartości są oznaczane jako brak, nigdy nie są liczone jako zero.
- **Cotygodniowy przegląd.** W poniedziałek aplikacja pyta, czy dziennik z poprzedniego tygodnia był kompletny. Tylko pełne tygodnie liczą się do wyliczenia zapotrzebowania (wystarczy ważenie raz w tygodniu, dokładniej 2–3 razy). Zmianę celu kalorii zawsze najpierw proponuje. Białko liczy automatycznie: 1,8 g/kg przy redukcji, 1,6 g/kg w pozostałych przypadkach.
- **Postępy.** Trend wagi, ostrożne szacowanie zapotrzebowania, rekordy i **prywatne zdjęcia sylwetki** (przód, bok, tył, porównywanie dat).
- **Prywatność.** Rejestracja tylko z zaproszeniem, a każdy widzi wyłącznie swoje dane. Jest eksport danych i usuwanie konta, bez telemetrii.
- **Asystent AI (opcjonalny).** W Treningu i w Jedzeniu możesz napisać np. „zamień wyciskanie na coś na maszynie”, „dodaj 2 jajka na śniadanie” albo zadać pytanie. Każdą zmianę asystent pokazuje najpierw jako kartę z przyciskiem **Zastosuj**. Bez niego wszystko działa tak samo.

> Aplikacja nie jest wyrobem medycznym. Przy bólu lub problemach zdrowotnych skonsultuj się ze specjalistą.

## Wdrożenie w chmurze (Vercel + Supabase) — zalecane

Baza: projekt Supabase **Forma** (region Frankfurt). Schemat jest już utworzony.

1. **GitHub:** utwórz prywatne repozytorium i wypchnij kod (`git push`).
2. **Hasło do bazy:** w Supabase wejdź w projekt Forma, potem *Project Settings → Database → Reset database password*. Ustaw nowe hasło i je zapisz.
3. **Adres połączenia:** w Supabase kliknij *Connect → Transaction pooler* i skopiuj adres (port **6543**). Wpisz w nim swoje hasło w miejsce `[YOUR-PASSWORD]`.
4. **Vercel:** wybierz *Add New → Project → Import* przy swoim repozytorium. W *Environment Variables* dodaj:
   | Nazwa | Wartość |
   |---|---|
   | `DATABASE_URL` | adres z kroku 3 |
   | `COOKIE_SECURE` | `true` |
   | `OFF_CONTACT` | Twój e-mail (wymagane przez Open Food Facts) |
5. Kliknij **Deploy**. Pierwsze konto założone na nowym adresie `…vercel.app` zostaje administratorem.
6. Zaproś bliskich w **Ustawienia → Zaproszenia**: wyślij im link do aplikacji i kod.

Hasła do bazy nie wpisuj nigdzie poza ustawieniami Vercela i swoim plikiem `.env.local`.

### Na telefonie (Ty i bliscy)

**iPhone (Safari):**
1. Otwórz adres aplikacji (`https://…vercel.app`) w **Safari**.
2. Zaloguj się albo załóż konto kodem zaproszenia.
3. Stuknij **Udostępnij** (kwadrat ze strzałką), a potem **Do ekranu początkowego** → **Dodaj**.

**Android (Chrome):**
1. Otwórz adres aplikacji w **Chrome**.
2. Zaloguj się albo załóż konto kodem zaproszenia.
3. Stuknij **⋮** → **Zainstaluj aplikację** (albo **Dodaj do ekranu głównego**).

Ikona Formy pojawi się jak zwykła aplikacja i otworzy się na pełnym ekranie. Aktualizacje przychodzą same, nic nie trzeba instalować ponownie.

**Bliskim** wyślij dwie rzeczy: link do aplikacji i kod z **Ustawienia → Zaproszenia** (każdy kod jest jednorazowy i ważny 14 dni).

## Asystent AI (opcjonalnie)

Asystent działa w tej samej aplikacji na Vercelu, więc nie trzeba nic osobno stawiać. Klucz jest tylko na serwerze. Możesz wybrać jednego z dwóch dostawców.

**Darmowo: Google Gemini (zalecane na start)**
1. Wejdź na [aistudio.google.com/apikey](https://aistudio.google.com/apikey) i kliknij **Create API key**. Możesz też użyć tego samego klucza co w StudyOS.
2. W Vercelu otwórz *Settings → Environments → Production → Environment Variables* i dodaj `GEMINI_API_KEY`. Opcjonalnie dodaj też `GEMINI_MODEL` (domyślnie `gemini-3.5-flash-lite`). Potem kliknij **Redeploy**.
3. W aplikacji: **Ustawienia → Asystent AI → włącz**.

Darmowy plan ma dzienny limit zapytań. Google może też wykorzystywać wysłane wiadomości do ulepszania swoich usług, a aplikacja mówi o tym przy włączaniu asystenta.

**Płatnie: Claude (Anthropic)** działa, gdy nie ma `GEMINI_API_KEY`:

1. Wejdź na [console.anthropic.com](https://console.anthropic.com) i załóż konto.
2. **Billing:** doładuj konto małą kwotą (np. 5 $). W **Limits** ustaw miesięczny limit wydatków, np. 10 $, żeby nic Cię nie zaskoczyło.
3. **API Keys → Create Key**, nazwij go „Forma” i skopiuj (pokazuje się tylko raz).
4. W Vercelu otwórz projekt, potem *Settings → Environment Variables*. Dodaj `ANTHROPIC_API_KEY` z tym kluczem. Następnie *Deployments → ⋯ → Redeploy*.
5. W aplikacji: **Ustawienia → Asystent AI → włącz**. Każda osoba włącza go sama u siebie.

**Koszt:** domyślny model (Claude Opus 5.5) to ok. 0,10–0,30 zł za pytanie. 100 pytań miesięcznie daje więc kilkanaście–kilkadziesiąt złotych. Jeśli dodasz w Vercelu `AI_MODEL` = `claude-haiku-5-5`, wyjdzie kilkadziesiąt razy taniej, ale odpowiedzi będą trochę prostsze. Każdy użytkownik ma limit 40 pytań dziennie.

**Prywatność:** do Anthropic trafia tylko Twoja wiadomość i dane potrzebne w danej zakładce: w Treningu plan, preferencje i ostatnie treningi, a w Jedzeniu dziennik z danego dnia, cel kalorii, ostatnia waga i ostatnio używane produkty. Zdjęcia i hasła nie trafiają tam nigdy. Asystent niczego nie zmienia sam. Wartości jedzenia bierze z bazy produktów i ich nie zgaduje.

### Limity darmowych planów

| | Limit | Co to znaczy w praktyce |
|---|---|---|
| Supabase: baza | 500 MB | Dane treningowe i jedzenie to drobiazg. Zdjęcia zajmują ok. 150–300 KB, więc 3 zdjęcia tygodniowo dla 5 osób to ok. 150 MB rocznie |
| Supabase: bezczynność | Projekt usypia po 7 dniach bez użycia | Przy codziennym logowaniu się to nie zdarzy. Uśpiony projekt wybudzasz jednym kliknięciem w panelu Supabase |
| Supabase: kopie | Brak automatycznych kopii w darmowym planie | Rób kopie co jakiś czas poleceniem `npm run backup` (opis niżej) |
| Vercel Hobby | Użytek prywatny i niekomercyjny, 100 GB transferu/mies. | Dla rodziny wystarczy z dużym zapasem |
| Open Food Facts | Limit zapytań liczony per adres IP | Serwery Vercela dzielą adresy, więc czasem pojawi się komunikat „baza przeciążona”. Zapisane produkty i ręczne dodawanie działają zawsze |
| Prywatność | Dane leżą w chmurze UE (Supabase Frankfurt, Vercel Frankfurt) | Dostęp tylko z kontem. Publiczne klucze Supabase nie odczytają żadnej tabeli (RLS) |

## Uruchomienie lokalne (bez chmury)

Wymagany jest Node.js 22.13 lub nowszy. Bez ustawionego `DATABASE_URL` aplikacja używa wbudowanej bazy Postgres (PGlite) w folderze `data/`.

```bash
npm install
```
```bash
npm run build
```
```bash
npm start
```

Otwórz `http://localhost:3000`. Tryb deweloperski uruchomisz poleceniem `npm run dev`. Z telefonu w tej samej sieci Wi-Fi wejdziesz pod `http://<adres-komputera>:3000`. Skanowanie kodów wymaga HTTPS, więc działa w chmurze albo przez Tailscale.

## Kopie zapasowe

```bash
npm run backup
```

Polecenie zapisuje wszystkie dane do `backups/forma-RRRR-MM-DD-GGMM.json` i zostawia 30 najnowszych kopii. Dla bazy w chmurze ustaw najpierw `DATABASE_URL` w `.env.local` (albo jako zmienną w terminalu).

Przywracanie **zastępuje wszystkie obecne dane**:

```bash
npm run restore -- backups/forma-2026-10-20-1830.json
```

Każdy użytkownik może też pobrać swoje dane w formacie JSON (Ustawienia → Twoje dane).

Kod zaproszenia z wiersza poleceń (gdy nikt nie może się zalogować): `npm run invite -- "dla Ani"`.

## Aktualizacja

Po `git push` Vercel sam buduje i publikuje nową wersję. Migracje bazy uruchamiają się automatycznie. Przed większą aktualizacją zrób `npm run backup`.

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
