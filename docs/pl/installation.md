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

`jamrelay doctor` pomaga sprawdzić konfigurację. Zdalny MCP wymaga osiągalnego
HTTPS; lokalna instalacja nie wymaga domeny. Zobacz [szybki start](/pl/getting-started)
i [informacje CLI](/cli-information).
