---
title: OAuth i zgoda właściciela
translationReviewed: 2026-10-19
sourceHash: 48ae4af5bd48
---

# OAuth i zgoda właściciela

To aktualne polskie streszczenie. Pełny opis protokołu i endpointów znajduje się
w [kanonicznej dokumentacji OAuth](/oauth).

## Dwa niezależne zakresy zaufania

**Dostawca muzyki → JamRelay:** właściciel loguje się przez `/owner/login`,
otwiera `/auth/providers/PROVIDER/start` i jawnie zatwierdza konkretną operację
połączenia lub wymiany konta. Sam GET nie rozpoczyna zewnętrznej autoryzacji.
Jednorazowa zgoda jest związana z dostawcą, połączeniem, sesją i OAuth state;
wygasa po dziesięciu minutach. Callback trzeba dokończyć w tej samej
przeglądarce. Błąd zachowuje wcześniejsze poświadczenia; ponowna próba wymaga
nowej zgody. PKCE i walidacja state nadal obowiązują tam, gdzie są używane.
Apple Music korzysta z osobnego [przepływu tokenów MusicKit](/configuration#apple-music-provider).

**Klient AI → JamRelay:** klient łączy się z `/mcp`, odkrywa metadane OAuth,
rejestruje się przez DCR albo korzysta ze statycznego rejestru. Właściciel
zatwierdza wybrane połączenia i uprawnienia. Token MCP nie upoważnia do
podłączania lub wymiany kont dostawców.

## Zgoda i obsługa klientów

Sekret właściciela wpisuje się wyłącznie w formularzu JamRelay, nigdy w URL
ani w konfiguracji agenta. Ekrany zgody mają `no-store` i CSP.
Authorization Code wymaga PKCE S256 i dokładnej zgodności redirect URI;
obsługiwane są klienty publiczne i poufne, `resource`, `iss`, godzinne access
tokeny i rotowane refresh tokeny. Klienty natywne mogą korzystać z bezpiecznych
callbacków loopback; szczegóły i ograniczenia opisuje wersja angielska.

DCR (`MCP_OAUTH_DCR_ENABLED`) nie daje dostępu bez zgody właściciela. Ma limity
żądań i rejestru oraz walidację przekierowań. Można go wyłączyć i użyć
`MCP_OAUTH_CLIENTS_PATH`. CIMD nie jest reklamowane; wymaga osobnych zabezpieczeń
pobierania metadanych przed SSRF i DNS rebinding.

`jamrelay clients list` pozwala sprawdzić klientów i granty,
a `jamrelay clients revoke CLIENT_ID` natychmiast blokuje dotychczasowe tokeny.
Zmiana grantu wymaga ponownej zgody. Magazyn OAuth musi być prywatny i trwały;
ścieżki opisuje [konfiguracja](/pl/configuration).
