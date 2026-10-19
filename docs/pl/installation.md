# Instalacja

Pełne, kanoniczne instrukcje dla npm, archiwów deweloperskich, Dockera,
przechowywania danych i reverse proxy znajdują się w [angielskiej instrukcji instalacji](/installation).

## npm

Wymagany jest Node.js 22.13 lub nowszy. Po oficjalnej publikacji paczki:

```bash
npm install -g jamrelay
jamrelay setup
jamrelay start
```

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

W Docker Compose użyj `docker compose run --rm jamrelay connect provider spotify`,
a potem `docker compose up -d`. Polecenie `jamrelay onboard` można uruchamiać
ponownie, aby kontynuować. Dane aplikacji i zgoda na dostęp do własnego konta
to osobne kroki OAuth. Polecenie `jamrelay connect client chatgpt|claude|cursor|vscode|generic`
wyświetla instrukcje dla wybranego klienta i dokładny adres `/mcp`.
Zdalny asystent w chmurze nie połączy się z prywatnym adresem `localhost`;
potrzebuje obsługiwanego tunelu albo dostępnego adresu HTTPS.

`jamrelay doctor` pomaga sprawdzić konfigurację. Zobacz
[szybki start](/pl/getting-started) i [informacje CLI](/cli-information).
