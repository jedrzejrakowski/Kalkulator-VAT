# Kalkulator — samochód osobowy do celów mieszanych

Rozlicza pojedynczą fakturę dotyczącą firmowego samochodu osobowego używanego do celów
mieszanych, czyli bez ewidencji przebiegu i bez zgłoszenia VAT-26. Odpowiada na trzy pytania:
ile VAT-u podlega odliczeniu, ile podatku powiększa wartość kosztu i jaka część wydatku trafia
do kosztów uzyskania przychodu.

## Dwa tryby rozliczenia VAT

**Działalność gospodarcza** — pełne prawo do odliczenia ograniczone do 50% z uwagi na użytek
mieszany (art. 86a ust. 1 ustawy o VAT).

**Fundacja lub stowarzyszenie** prowadzące równolegle działalność gospodarczą i statutową —
wskaźniki mnożą się kolejno:

```
odliczenie = VAT × prewspółczynnik × proporcja sprzedaży × 50%
```

Przy prewspółczynniku 50% i braku sprzedaży zwolnionej daje to 25% podatku do odliczenia:
połowa przypada na działalność niegospodarczą i nie podlega odliczeniu w ogóle, a z drugiej
połowy odliczeniu podlega 50%, czyli 25% całości.

Prewspółczynnik i proporcję sprzedaży zaokrągla się w górę do pełnych procentów
(art. 86 ust. 2g i art. 90 ust. 4 ustawy o VAT), dlatego pola przyjmują wyłącznie liczby całkowite.

## Rodzaje wydatków

| Wydatek | Koszt podatkowy |
| --- | --- |
| Eksploatacja — paliwo, serwis, opony, myjnia, parking | 75% podstawy |
| Rata leasingu, najmu, dzierżawy | część kapitałowa objęta limitem, odsetkowa w całości |
| Zakup samochodu | odpisy amortyzacyjne objęte limitem |
| Ubezpieczenie AC, GAP | proporcjonalnie do limitu 150 000 zł |
| Ubezpieczenie OC, NNW, assistance | w całości |

Podstawą kosztu jest zawsze kwota netto powiększona o VAT niepodlegający odliczeniu
(art. 23 ust. 5a ustawy o PIT, art. 16 ust. 5a ustawy o CIT).

## Limity wartości pojazdu

Limity obowiązujące od 1 stycznia 2026 r. — art. 23 ust. 1 pkt 4 ustawy o PIT,
art. 16 ust. 1 pkt 4 ustawy o CIT:

| Pojazd | Limit |
| --- | --- |
| Emisja CO₂ od 50 g/km | 100 000 zł |
| Emisja CO₂ poniżej 50 g/km | 150 000 zł |
| Elektryczny lub wodorowy | 225 000 zł |

Pole z limitem jest edytowalne — do umów objętych przepisami przejściowymi można wpisać
limit sprzed 2026 r.

Limit dla składek AC jest osobnym, również edytowalnym polem z wartością domyślną 150 000 zł.
Przed użyciem warto zweryfikować, czy nowelizacja nie objęła również tego przepisu.

## Alokacja kosztu w organizacji

W trybie fundacji dostępne jest pole „Udział działalności gospodarczej w koszcie”. Dzieli ono
wyliczony koszt podatkowy między działalność gospodarczą i statutową. Nie wynika ono wprost
z ustawy — odzwierciedla politykę rachunkowości organizacji i domyślnie wynosi 100%.

## Uruchomienie

```bash
npm install
npm run dev      # serwer deweloperski
npm run build    # build produkcyjny do dist/
npm test         # testy logiki podatkowej
```

## Struktura

```
src/domain/     reguły podatkowe, niezależne od interfejsu
  vat.ts        wskaźnik odliczenia i podział podatku naliczonego
  cost.ts       koszt uzyskania przychodu dla każdej kategorii wydatku
  limits.ts     limity wartości pojazdu
  calculate.ts  złożenie wyniku wraz z opisem księgowania
src/components/ interfejs
```

Logika podatkowa nie zależy od Reacta i jest pokryta testami w
`src/domain/__tests__/calculate.test.ts`.

## Zastrzeżenie

Wynik jest wyliczeniem pomocniczym, nie poradą podatkową. Przy nietypowych umowach oraz przy
stosowaniu przepisów przejściowych do limitów należy sprawdzić stan prawny na dzień
poniesienia wydatku.
