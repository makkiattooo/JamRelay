# Instalacja

Pełne, kanoniczne instrukcje dla npm, archiwów deweloperskich, Dockera,
przechowywania danych i reverse proxy znajdują się w [angielskiej instrukcji instalacji](/installation).

## npm

Wymagany jest Node.js 22.13 lub nowszy. Po oficjalnej publikacji paczki:

```bash
npm install -g jamrelay
jamrelay setup
jamrelay start
jamrelay onboard
```

`jamrelay setup` zapisuje prywatną konfigurację i kończy działanie. Polecenie
`jamrelay onboard` otwiera główne menu zarządzania. Konfigurację sieci
uruchomisz osobno z menu albo poleceniem `jamrelay connectivity`.
Menu grupuje stan serwera, usługi muzyczne, aplikacje AI, dostęp sieciowy i
utrzymanie. Opis zaznaczonej opcji wyjaśnia jej działanie, a wynik czynności
pozostaje na ekranie do naciśnięcia Enter.

Serwer nie uruchomi się przed zapisaniem przez setup trwałego klucza szyfrowania
danych usług muzycznych, sekretu zatwierdzania OAuth i publicznego adresu bazowego.
Przy pierwszym lokalnym, interaktywnym `jamrelay start` kreator uruchomi się
automatycznie. Uruchomienie kontenera bez tej konfiguracji pokaże polecenie setupu,
zamiast czekać na klawiaturę w tle. Wdrożenie oparte wyłącznie na zmiennych
środowiskowych musi dostarczyć te same wartości.

**Publikacja publiczna jest jeszcze w przygotowaniu.** Commit na GitHubie nie
jest paczką npm ani obrazem GHCR. Przed publikacją zbuduj archiwum poleceniem
`npm pack` z checkoutu i zainstaluj plik wypisany przez npm — bez ręcznego
wpisywania numeru wersji. Szczegóły i wariant Docker Compose są w
[kanonicznej instrukcji](/installation).

## Konfiguracja i dane

Kreator generuje sekrety tylko przy pierwszej konfiguracji. Konta dostawców są
opcjonalne i wymagają osobnej zgody właściciela. Domyślne katalogi odpowiadają
platformie: XDG na Linuksie, Application Support na macOS i AppData na Windows;
Docker zachowuje dane w trwałym `/data`.

Istniejące `.env`, ścieżki i klucze są zachowywane. `JAMRELAY_CONFIG_PATH`
wybiera plik konfiguracji, a `jamrelay config` umożliwia ponowną konfigurację.
Przed aktualizacją zatrzymaj serwer i zabezpiecz dane **oraz** prywatną
konfigurację z kluczem szyfrowania. Nie generuj nowego klucza nad istniejącymi
zaszyfrowanymi danymi.

Pierwszy ekran kreatora pokazuje instrukcje we wszystkich pięciu językach.
Wybór działa klawiszami 1–5 bez dodatkowego Entera; można też użyć strzałek i
Enter. Domyślny język wynika
z ustawień regionalnych, a przy braku obsługiwanego języka jest to angielski.
`JAMRELAY_LANGUAGE` pozwala ustawić język dla kolejnych poleceń.
W interaktywnym terminalu `jamrelay help` lub `jamrelay --help` otwiera
przewodnik TUI z opisami poleceń podzielonymi na działy. Bez interaktywnego
terminala pomoc jest zwykłym tekstem.
Wyniki poleceń interaktywnych są wyświetlane w TUI i czekają na Enter przed
powrotem do terminala. Ekran interaktywnego `jamrelay start` pozostaje otwarty,
gdy serwer działa; Ctrl+C go zatrzymuje. Polecenia bez interaktywnego terminala
zachowują tekstowe wyjście dla skryptów i logów usług.
`jamrelay config` zachowuje ustawienia sieciowe, chyba że wybierzesz opcje
zaawansowane. Dostęp zdalny wymaga osiągalnego adresu HTTPS i kontrolowanego
reverse proxy; zaufanie do nagłówków proxy włączaj wyłącznie w takim układzie.

Ustaw dane aplikacji usługi przed uruchomieniem serwera, a potem autoryzuj
własne konto i skonfiguruj klienta:

```bash
jamrelay connect provider spotify
jamrelay start
jamrelay onboard
```

W Docker Compose użyj `docker compose run --rm -it jamrelay connect provider spotify`,
a potem `docker compose up -d`. `jamrelay onboard` (lub
`docker compose run --rm -it jamrelay onboard`) otwiera główne menu zarządzania.
`jamrelay connectivity` (lub `docker compose run --rm -it jamrelay connectivity`)
otwiera konfigurację sieci bezpośrednio. Dane aplikacji i zgoda na dostęp do własnego konta
to osobne kroki OAuth. Polecenie `jamrelay connect client chatgpt|claude|cursor|vscode|generic`
wyświetla instrukcje dla wybranego klienta i dokładny adres `/mcp`.
W działającym Docker Compose zmiana danych usługi w `onboard` jest przekazywana do serwera,
zapisywana, a następnie serwer uruchamia się ponownie zgodnie z polityką Compose. Kreator
czeka na powrót JamRelay i pokazuje wynik; nie trzeba ręcznie zatrzymywać ani uruchamiać kontenera.
Zdalny asystent w chmurze nie połączy się z prywatnym adresem `localhost`;
potrzebuje obsługiwanego tunelu albo dostępnego adresu HTTPS.

### Dane aplikacji dostawcy

Kreator pokazuje krótką instrukcję dla wybranej usługi, jej oficjalny panel,
adres zwrotny i pola do skopiowania. W terminalu VS Code użyj Ctrl+klik na
wyświetlonym linku, jeśli JamRelay działa w kontenerze i nie może bezpośrednio
otworzyć przeglądarki. Przy kopiowaniu adresu w Dockerze TUI wysyła go do
schowka terminala. Client ID i Client Secret wpisuje się w osobne pola;
sekret jest maskowany.

Przykładowe wartości dla formularza aplikacji Spotify:

| Pole Spotify    | Wartość                                                           |
| --------------- | ----------------------------------------------------------------- |
| App name        | `JamRelay`                                                        |
| App description | `Self-hosted music MCP server for AI assistants.`                 |
| Website         | Opcjonalnie `https://github.com/makkiattooo/JamRelay`             |
| API/SDK         | `Web API`                                                         |
| Redirect URI    | Dokładny adres pokazany przez `jamrelay connect provider spotify` |

Po utworzeniu aplikacji skopiuj Client ID i Client Secret z jej ustawień.
W trybie Spotify Development właściciel aplikacji musi spełniać aktualne
wymagania Spotify Premium; konto słuchacza należy dodać do listy użytkowników.
Adres Redirect URI musi być zgodny znak w znak. Dla lokalnego HTTP Spotify
wymaga adresu loopback `127.0.0.1`, nie `localhost`.

Pozostałe usługi:

- [SoundCloud](https://developers.soundcloud.com/docs/api/register-app):
  rejestracja aplikacji API wymaga obecnie Artist Pro. W Your Apps utwórz
  aplikację i skopiuj Client ID oraz Client Secret. JamRelay prowadzi logowanie
  OAuth; nie wklejaj hasła konta do terminala.
- [YouTube](https://developers.google.com/youtube/data/guides/auth/server-side-web-apps):
  w Google Cloud włącz YouTube Data API v3, skonfiguruj ekran zgody OAuth,
  utwórz klienta OAuth typu Web application i dodaj dokładny adres zwrotny
  wyświetlony przez JamRelay. W trybie testowym dodaj konto Google jako testera.
- [Apple Music](https://developer.apple.com/help/account/capabilities/create-a-media-identifier-and-private-key):
  w Apple Developer utwórz Media ID z MusicKit i klucz Media Services
  przypisany do tego identyfikatora. W JamRelay podaj Team ID, Key ID i ścieżkę
  do pobranego pliku `.p8`. Ten plik jest sekretem. Music User Token to osobny
  etap po uruchomieniu serwera.

`jamrelay doctor` pomaga sprawdzić konfigurację. Zobacz
[szybki start](/pl/getting-started) i [informacje CLI](/cli-information).
