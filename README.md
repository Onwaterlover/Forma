# Forma

Prywatna aplikacja do treningu i liczenia jedzenia dla Ciebie i kilku zaufanych osób. Działa w przeglądarce na iPhonie, Androidzie i komputerze i można ją dodać do ekranu głównego jak zwykłą aplikację (PWA). W chmurze (Vercel + Supabase) działa bez włączonego komputera.

- **Generator planów treningowych.** Plan jest deterministyczny i sprawdzany przez osobny walidator. Uwzględnia:
  - dni i miejsca treningu (albo „dowolne dni, aplikacja dobierze”) oraz sprzęt w każdym miejscu;
  - preferencje: maszyny, wolne ciężary, masa ciała (można wybrać kilka);
  - ulubione, wykluczone i bolesne ćwiczenia, priorytety partii mięśni i inne sporty.

  Jeśli plan Ci się nie podoba, zaznaczasz powody, a aplikacja układa nowy.
- **Trening.** Tryb prosty i szczegółowy, zamiana ćwiczeń, wybór chwytu (wąski lub szeroki), okno „Jak to zrobić?” z linkiem do filmu z techniką, zmiana miejsca, „krótszy trening” i „pomiń dziś”. Zapisane serie nie giną przy chwilowym braku internetu.
- **Jedzenie.** Kody kreskowe (Open Food Facts), ostatnie produkty i ulubione, posiłki, przepisy oraz szybkie wpisy samych kalorii. Brakujące wartości są oznaczane jako brak, nigdy nie są liczone jako zero.
- **Postępy.** Trend wagi, ostrożne szacowanie zapotrzebowania, rekordy i **prywatne zdjęcia sylwetki** (przód, bok, tył, porównywanie dat).
- **Prywatność.** Rejestracja tylko z zaproszeniem, a każdy widzi wyłącznie swoje dane. Jest eksport danych i usuwanie konta, bez telemetrii.
- **Bez płatnych usług.** Asystent AI jest opcjonalny i żadna podstawowa funkcja go nie wymaga.

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
