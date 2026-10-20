# Szybki start

JamRelay obsługuje Spotify, SoundCloud, Apple Music i YouTube. Możesz zacząć
bez połączonych kont. Wymagany jest Node.js 22.13 lub nowszy albo Docker.

1. Wybierz sposób [instalacji](/pl/installation). Kreator `jamrelay setup`
   przygotuje prywatną konfigurację, sekrety i lokalną bazę; `jamrelay start`
   uruchomi serwer. `jamrelay onboard` otwiera menu do konfiguracji sieci,
   połączeń muzycznych, klientów MCP i zarządzania instalacją.
2. Pobierz dane aplikacji deweloperskiej dla wybranego [dostawcy](/providers/).
   Zaloguj się przez `/owner/login`, następnie otwórz
   `/auth/providers/PROVIDER/start` i jawnie zatwierdź połączenie lub wymianę konta.
   Dokończ przekierowanie w tej samej przeglądarce. Apple Music ma osobny
   [przepływ MusicKit](/provider-connections).
3. Wprowadź adres `/mcp` pokazany przez kreator w [kliencie AI](/pl/clients/)
   i zatwierdź jego uprawnienia przez MCP OAuth. Nie przekazuj sekretu właściciela
   agentowi. Lista narzędzi (`tools/list`) pozwala sprawdzić połączenie.
4. Zacznij od odczytu danych lub podglądu zmian (`dry_run`). Możliwości serwisów
   są różne — sprawdź [referencję narzędzi](/tools-reference).

Zdalny dostęp wymaga osiągalnego adresu HTTPS i odpowiedniej konfiguracji proxy.
Przed wystawieniem serwera przeczytaj [OAuth](/pl/oauth), [bezpieczeństwo](/security)
i [obsługę operacyjną](/operations).
