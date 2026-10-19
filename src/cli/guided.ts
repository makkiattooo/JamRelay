import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { stdin } from 'node:process';
import { resolve } from 'node:path';
import { existsSync } from 'node:fs';
import { currentLanguage, type Language } from './i18n/index.js';
import {
  menuPanel,
  promptText,
  selectOption,
  setTuiContext,
  showPanel,
  terminalLink,
} from './tui.js';
import { effectiveBaseUrl, localBaseUrl } from '../config.js';
import {
  installationPaths,
  loadInstallation,
  readSettings,
  saveSettings,
  lockInstallation,
} from '../runtime/installation.js';
import { validateSettings } from '../runtime/setup.js';
import { EncryptedCredentialStore } from '../providers/credential-store.js';

const execFileAsync = promisify(execFile);
type Provider = 'spotify' | 'soundcloud' | 'apple-music' | 'youtube';
type Client = 'chatgpt' | 'claude' | 'cursor' | 'vscode' | 'generic';

const providerRows: Record<
  Provider,
  { name: string; portal: string; docs: string; rules?: string; requirements: string }
> = {
  spotify: {
    name: 'Spotify',
    portal: 'https://developer.spotify.com/dashboard',
    docs: 'https://developer.spotify.com/documentation/web-api/concepts/redirect_uri',
    rules: 'https://developer.spotify.com/documentation/web-api/concepts/quota-modes',
    requirements:
      'Development Mode requires the application owner to have Spotify Premium and currently allows up to 5 allowlisted listener accounts per app; add your own account. Register JamRelay’s exact callback URI. Spotify rejects localhost, so use 127.0.0.1 for loopback HTTP or HTTPS for a remote host. The listener authorizes separately; playback features may also require that listener to have Premium. JamRelay requests playlist, library, listening-history and playback scopes.',
  },
  soundcloud: {
    name: 'SoundCloud',
    portal: 'https://soundcloud.com/you/apps',
    docs: 'https://developers.soundcloud.com/docs/api/register-app',
    rules: 'https://developers.soundcloud.com/docs/api/guide',
    requirements:
      'SoundCloud currently documents Artist Pro as a requirement to register API applications. OAuth 2.1 authorization uses PKCE. Account and playlist access requires authorization by the listener account.',
  },
  'apple-music': {
    name: 'Apple Music',
    portal: 'https://developer.apple.com/account/resources/identifiers/list',
    docs: 'https://developer.apple.com/help/account/capabilities/create-a-media-identifier-and-private-key',
    rules: 'https://developer.apple.com/programs/',
    requirements:
      'Create a MusicKit identifier and private key in an Apple Developer team with Account Holder or Admin access. Apple Developer Program membership currently costs USD 99 per year or local currency (eligible organizations may qualify for a fee waiver). Keep the .p8 key file private. JamRelay needs a separate Music User Token; a music subscription may be required for user library actions.',
  },
  youtube: {
    name: 'YouTube',
    portal: 'https://console.cloud.google.com/apis/credentials',
    docs: 'https://developers.google.com/youtube/v3/getting-started',
    requirements:
      'Create a Google Cloud project, enable YouTube Data API v3, configure the OAuth consent screen and create a Web application OAuth client. Add the exact JamRelay callback URI. JamRelay requests the https://www.googleapis.com/auth/youtube.force-ssl scope. Testing consent screens may require adding your account as a test user; API quotas apply.',
  },
};

const requirements: Record<Language, Record<Provider, string>> = {
  en: Object.fromEntries(
    Object.entries(providerRows).map(([id, row]) => [id, row.requirements]),
  ) as Record<Provider, string>,
  pl: {
    spotify:
      'Tryb Development wymaga Spotify Premium u właściciela aplikacji i pozwala dodać do 5 kont użytkowników; dodaj też własne konto słuchacza. Zarejestruj dokładny adres zwrotny JamRelay. Spotify odrzuca localhost: lokalnie użyj 127.0.0.1, a zdalnie HTTPS. Konto słuchacza autoryzuje się osobno, a odtwarzanie może wymagać od niego Premium. JamRelay prosi o zakresy playlist, biblioteki, historii słuchania i odtwarzania.',
    soundcloud:
      'Do rejestracji aplikacji API SoundCloud wymaga obecnie subskrypcji Artist Pro. Oficjalny proces tworzy Client ID i Client Secret. Logowanie OAuth 2.1 wymaga PKCE; dostęp do konta i playlist wymaga zgody użytkownika.',
    'apple-music':
      'Utwórz identyfikator MusicKit i klucz prywatny w zespole Apple Developer jako Account Holder lub Admin. Program Apple Developer kosztuje obecnie 99 USD rocznie lub równowartość lokalną; uprawnione organizacje mogą otrzymać zwolnienie z opłaty. Plik .p8 przechowuj prywatnie. JamRelay potrzebuje osobno Developer Token i Music User Token. Funkcje biblioteki mogą wymagać subskrypcji Apple Music.',
    youtube:
      'Utwórz projekt Google Cloud, włącz YouTube Data API v3, skonfiguruj ekran zgody OAuth i utwórz klienta OAuth aplikacji internetowej. Dodaj dokładny adres zwrotny. JamRelay żąda zakresu https://www.googleapis.com/auth/youtube.force-ssl. W trybie testowym dodaj konto Google do testerów. Obowiązują limity API.',
  },
  de: {
    spotify:
      'Der Development-Modus erfordert Spotify Premium für den App-Inhaber und erlaubt derzeit bis zu 5 Nutzerkonten; füge auch dein eigenes Hörerkonto hinzu. Registriere die genaue Rückrufadresse. Spotify lehnt localhost ab: lokal 127.0.0.1, remote HTTPS verwenden. Das Hörerkonto wird separat autorisiert; Wiedergabe kann auch für dieses Konto Premium erfordern. JamRelay fragt Berechtigungen für Playlists, Bibliothek, Hörverlauf und Wiedergabe an.',
    soundcloud:
      'Für die Registrierung von SoundCloud-API-Apps ist derzeit Artist Pro erforderlich. Der offizielle Ablauf erstellt Client-ID und Client-Geheimnis. OAuth 2.1 verlangt PKCE; Konten und Playlists benötigen die Zustimmung des Nutzers.',
    'apple-music':
      'Erstelle eine MusicKit-Kennung und einen privaten Schlüssel in einem Apple-Developer-Team mit Account-Holder- oder Admin-Rechten. Das Apple Developer Program kostet derzeit 99 USD pro Jahr oder den Gegenwert in Landeswährung; berechtigte Organisationen können eine Gebührenbefreiung erhalten. Halte die .p8-Datei privat. JamRelay benötigt zusätzlich einen Music User Token; Bibliotheksfunktionen können Apple Music erfordern.',
    youtube:
      'Erstelle ein Google-Cloud-Projekt, aktiviere YouTube Data API v3, richte den OAuth-Zustimmungsbildschirm ein und erstelle einen OAuth-Client für eine Webanwendung. Trage die genaue Rückrufadresse ein. JamRelay benötigt den Scope https://www.googleapis.com/auth/youtube.force-ssl. Im Testmodus muss dein Google-Konto als Testnutzer hinzugefügt werden. API-Kontingente gelten.',
  },
  fr: {
    spotify:
      'Le mode Development exige Spotify Premium pour le propriétaire de l’application et autorise actuellement jusqu’à 5 comptes utilisateurs ; ajoutez aussi votre compte d’écoute. Enregistrez l’URL de retour exacte. Spotify refuse localhost : utilisez 127.0.0.1 en local ou HTTPS à distance. Le compte d’écoute s’autorise séparément et certaines fonctions de lecture peuvent aussi exiger Premium pour cet utilisateur. JamRelay demande des accès aux playlists, à la bibliothèque, à l’historique d’écoute et à la lecture.',
    soundcloud:
      'SoundCloud exige actuellement Artist Pro pour enregistrer une application API. La procédure officielle fournit le Client ID et le Client Secret. OAuth 2.1 requiert PKCE ; l’accès au compte et aux playlists nécessite l’accord de l’utilisateur.',
    'apple-music':
      'Créez un identifiant MusicKit et une clé privée dans une équipe Apple Developer avec le rôle Account Holder ou Admin. Le programme Apple Developer coûte actuellement 99 USD par an ou l’équivalent local ; certaines organisations peuvent obtenir une dispense. Gardez le fichier .p8 privé. JamRelay requiert aussi un Music User Token ; certaines fonctions peuvent nécessiter Apple Music.',
    youtube:
      'Créez un projet Google Cloud, activez YouTube Data API v3, configurez l’écran de consentement OAuth et créez un client OAuth de type application Web. Ajoutez l’URL de retour exacte. JamRelay demande le scope https://www.googleapis.com/auth/youtube.force-ssl. En mode test, ajoutez votre compte Google aux testeurs. Les quotas API s’appliquent.',
  },
  es: {
    spotify:
      'El modo Development requiere Spotify Premium para quien posee la aplicación y permite hasta 5 cuentas de usuario; añade también tu cuenta de oyente. Registra la URL de retorno exacta. Spotify rechaza localhost: usa 127.0.0.1 en local o HTTPS en remoto. La cuenta de oyente se autoriza por separado y algunas funciones de reproducción pueden requerir Premium para esa cuenta. JamRelay solicita permisos de listas, biblioteca, historial y reproducción.',
    soundcloud:
      'SoundCloud requiere actualmente Artist Pro para registrar aplicaciones de API. El proceso oficial proporciona Client ID y Client Secret. OAuth 2.1 exige PKCE; el acceso a cuentas y listas requiere autorización del usuario.',
    'apple-music':
      'Crea un identificador MusicKit y una clave privada en un equipo Apple Developer con rol Account Holder o Admin. El programa Apple Developer cuesta actualmente 99 USD al año o el equivalente local; algunas organizaciones pueden solicitar una exención. Mantén privado el archivo .p8. JamRelay también necesita un Music User Token; algunas funciones pueden requerir Apple Music.',
    youtube:
      'Crea un proyecto de Google Cloud, habilita YouTube Data API v3, configura la pantalla de consentimiento OAuth y crea un cliente OAuth de aplicación web. Añade la URL de retorno exacta. JamRelay solicita el scope https://www.googleapis.com/auth/youtube.force-ssl. En pruebas añade tu cuenta de Google como usuario de prueba. Se aplican cuotas de API.',
  },
};

const clientInstructions: Record<Language, Record<Client, string>> = {
  en: {
    chatgpt:
      'ChatGPT: Settings → Apps → Advanced settings → enable developer mode, then create a custom app using the MCP URL. Availability depends on your plan and workspace.',
    claude:
      'Claude Desktop: Settings → Connectors → Add custom connector. Claude Code: run `claude mcp add --transport http jamrelay URL` in a terminal. Remote MCP requires a reachable HTTPS endpoint.',
    cursor:
      'Cursor: Settings → Tools & MCP → Add new MCP server. Alternatively add a `url` entry under `mcpServers` in `.cursor/mcp.json`. Cursor supports remote Streamable HTTP and OAuth.',
    vscode:
      'VS Code: Command Palette → MCP: Add Server → HTTP, then enter the URL and select user or workspace configuration. VS Code supports remote HTTP servers and OAuth.',
    generic:
      'Select remote Streamable HTTP transport and OAuth 2.1 discovery. Localhost works only when the MCP client runs on the same computer; remote clients need reachable HTTPS.',
  },
  pl: {
    chatgpt:
      'ChatGPT: Ustawienia → Aplikacje → Ustawienia zaawansowane → włącz tryb deweloperski, a następnie utwórz własną aplikację z podanym adresem MCP. Dostępność zależy od planu i obszaru roboczego.',
    claude:
      'Claude Desktop: Ustawienia → Connectors → Add custom connector. Claude Code: w terminalu uruchom `claude mcp add --transport http jamrelay URL`. Zdalny MCP wymaga osiągalnego HTTPS.',
    cursor:
      'Cursor: Settings → Tools & MCP → Add new MCP server. Możesz też dodać wpis `url` w `mcpServers` pliku `.cursor/mcp.json`. Cursor obsługuje zdalny Streamable HTTP i OAuth.',
    vscode:
      'VS Code: Paleta poleceń → MCP: Add Server → HTTP, wpisz adres i wybierz konfigurację użytkownika lub obszaru roboczego. VS Code obsługuje zdalne HTTP i OAuth.',
    generic:
      'Wybierz zdalny transport Streamable HTTP i standardowe wykrywanie OAuth 2.1. Localhost działa tylko wtedy, gdy klient MCP działa na tym samym komputerze; zdalny klient wymaga osiągalnego HTTPS.',
  },
  de: {
    chatgpt:
      'ChatGPT: Einstellungen → Apps → Erweiterte Einstellungen → Entwicklermodus aktivieren und anschließend eine eigene App mit der MCP-URL erstellen. Die Verfügbarkeit hängt von Tarif und Arbeitsbereich ab.',
    claude:
      'Claude Desktop: Einstellungen → Connectors → Add custom connector. Claude Code: `claude mcp add --transport http jamrelay URL` im Terminal ausführen. Remote-MCP benötigt einen erreichbaren HTTPS-Endpunkt.',
    cursor:
      'Cursor: Einstellungen → Tools & MCP → Add new MCP server. Alternativ einen `url`-Eintrag unter `mcpServers` in `.cursor/mcp.json` ergänzen. Cursor unterstützt Remote-Streamable-HTTP und OAuth.',
    vscode:
      'VS Code: Befehlspalette → MCP: Add Server → HTTP, URL eingeben und Benutzer- oder Arbeitsbereichskonfiguration wählen. VS Code unterstützt Remote-HTTP und OAuth.',
    generic:
      'Remote-Streamable-HTTP und OAuth-2.1-Erkennung auswählen. Localhost funktioniert nur, wenn der MCP-Client auf demselben Computer läuft; Remote-Clients benötigen erreichbares HTTPS.',
  },
  fr: {
    chatgpt:
      'ChatGPT : Paramètres → Apps → Paramètres avancés → activez le mode développeur, puis créez une application personnalisée avec l’URL MCP. La disponibilité dépend de l’offre et de l’espace de travail.',
    claude:
      'Claude Desktop : Paramètres → Connectors → Add custom connector. Claude Code : lancez `claude mcp add --transport http jamrelay URL` dans un terminal. Le MCP distant nécessite un endpoint HTTPS accessible.',
    cursor:
      'Cursor : Settings → Tools & MCP → Add new MCP server. Vous pouvez aussi ajouter une entrée `url` sous `mcpServers` dans `.cursor/mcp.json`. Cursor prend en charge Streamable HTTP distant et OAuth.',
    vscode:
      'VS Code : palette de commandes → MCP: Add Server → HTTP, saisissez l’URL et choisissez une configuration utilisateur ou espace de travail. VS Code prend en charge HTTP distant et OAuth.',
    generic:
      'Choisissez le transport Streamable HTTP distant et la découverte OAuth 2.1. Localhost fonctionne seulement si le client MCP tourne sur le même ordinateur ; les clients distants ont besoin d’un HTTPS accessible.',
  },
  es: {
    chatgpt:
      'ChatGPT: Configuración → Apps → Ajustes avanzados → activa el modo de desarrollador y crea una aplicación personalizada con la URL MCP. La disponibilidad depende del plan y del espacio de trabajo.',
    claude:
      'Claude Desktop: Configuración → Connectors → Add custom connector. Claude Code: ejecuta `claude mcp add --transport http jamrelay URL` en un terminal. MCP remoto requiere un endpoint HTTPS accesible.',
    cursor:
      'Cursor: Settings → Tools & MCP → Add new MCP server. También puedes añadir una entrada `url` en `mcpServers` de `.cursor/mcp.json`. Cursor admite Streamable HTTP remoto y OAuth.',
    vscode:
      'VS Code: paleta de comandos → MCP: Add Server → HTTP, introduce la URL y elige configuración de usuario o espacio de trabajo. VS Code admite HTTP remoto y OAuth.',
    generic:
      'Elige transporte remoto Streamable HTTP y descubrimiento OAuth 2.1. Localhost solo funciona si el cliente MCP se ejecuta en el mismo equipo; un cliente remoto necesita HTTPS accesible.',
  },
};

export const guidedTranslations = { requirements, clientInstructions };

const clientLabels: Record<
  Language,
  { endpoint: string; transport: string; verified: string; pending: string }
> = {
  en: {
    endpoint: 'MCP URL',
    transport: 'Transport: Streamable HTTP',
    verified: 'GET /health succeeded',
    pending: 'not verified',
  },
  pl: {
    endpoint: 'Adres MCP',
    transport: 'Transport: Streamable HTTP',
    verified: 'GET /health: serwer odpowiada',
    pending: 'niezweryfikowane',
  },
  de: {
    endpoint: 'MCP-URL',
    transport: 'Transport: Streamable HTTP',
    verified: 'GET /health erfolgreich',
    pending: 'nicht überprüft',
  },
  fr: {
    endpoint: 'URL MCP',
    transport: 'Transport : Streamable HTTP',
    verified: 'GET /health a réussi',
    pending: 'non vérifié',
  },
  es: {
    endpoint: 'URL MCP',
    transport: 'Transporte: Streamable HTTP',
    verified: 'GET /health respondió correctamente',
    pending: 'sin verificar',
  },
};

const copy: Record<Language, Record<string, string>> = {
  en: {
    welcome: 'Continue JamRelay setup',
    provider: 'Choose a music service',
    client: 'Choose an AI client',
    skip: 'Skip for now',
    providersLabel: 'Music services',
    accountAuth: 'Saved account token records (not verified)',
    notConfigured: 'Not configured',
    openClient: 'Open the client setup page?',
    docs: 'Official guide',
    connectProvider: 'Configure provider application',
    account: 'Authorize your personal music account',
    status: 'Current status',
    online: 'Server is reachable',
    offline: 'Server is not reachable yet',
    appConfigured:
      'Application credentials are saved. This does not connect your personal account.',
    next: 'Next: start the server, sign in at the owner page, then open the provider authorization page. Approve the connection there and return here. Passwords are entered only on the provider website.',
    create: 'Create the developer application at',
    requirements: 'Requirements',
    callback: 'Register this exact callback URL',
    clientSecret: 'Client secret',
    clientId: 'Client ID',
    team: 'Apple Team ID',
    keyId: 'Apple Key ID',
    keyPath: 'Path to the private .p8 key file',
    saved: 'Settings saved securely. Run jamrelay onboard after restarting the server.',
    health: 'Health check',
    tools:
      'In your AI client, request the list of available tools, then test with: “List my connected music services.”',
    localWarning:
      'A cloud hosted AI client cannot reach a private localhost address. Use a supported secure tunnel or public HTTPS address for remote clients.',
    addAt: 'Add the MCP server in the client’s developer or MCP settings.',
    auth: 'The client uses OAuth. JamRelay asks you to sign in as the owner and approve the requested provider connections; never paste the owner secret into the AI client.',
    done: 'Guide complete. Re-run jamrelay onboard at any time to resume.',
    ownerLogin: 'Open JamRelay owner sign-in in your browser?',
    authLink: 'After signing in, open this provider authorization page:',
    callbackNotUsed: 'Apple Music does not use an OAuth callback URL.',
    appleNext:
      'After the server starts, a Music User Token must be created in a separate MusicKit app and submitted through the owner-protected API endpoint shown above. JamRelay has no browser form for creating this token.',
    chatgptLimit:
      'ChatGPT custom MCP apps require an eligible plan/workspace. ChatGPT connects to remote MCP; a private server needs a supported secure tunnel or public HTTPS.',
    openBrowser: 'Open in browser',
    later: 'Do this later',
    instructionOnly: 'Show instructions only',
    openedLogin:
      'After owner sign-in, open the provider authorization page shown above, approve the JamRelay connection, then return and run jamrelay onboard to check the saved authorization.',
    appleToken:
      'Apple Music uses a different flow: create a Music User Token in a trusted MusicKit app, then submit it to the owner-protected /auth/apple-music/user-token endpoint. JamRelay cannot generate this token.',
    genericClient: 'Another MCP-compatible application',
    offlineNext: 'Run docker compose up -d on the host, then run jamrelay onboard again.',
    offlineStart: 'Start JamRelay with jamrelay start, then run jamrelay onboard again.',
    existingProvider: 'Application credentials already exist. What would you like to do?',
    useSaved: 'Keep existing credentials',
    replaceSaved: 'Update credentials',
    stopFirst:
      'The server is running and holds the configuration lock. Stop it before changing provider credentials, then run this command again.',
    stopDocker: 'Stop the Compose service with: docker compose stop jamrelay',
    stopLocal: 'Stop the running server with Ctrl+C in its terminal.',
    restart:
      'Restart the server before opening provider authorization. Use jamrelay start locally or docker compose up -d on the host, then run jamrelay onboard.',
    required: 'This value is required. Please try again.',
  },
  pl: {
    welcome: 'Kontynuuj konfigurację JamRelay',
    provider: 'Wybierz usługę muzyczną',
    client: 'Wybierz asystenta AI',
    skip: 'Pomiń na razie',
    providersLabel: 'Usługi muzyczne',
    accountAuth: 'Zapisane tokeny kont (bez weryfikacji)',
    notConfigured: 'Nie skonfigurowano',
    openClient: 'Otworzyć stronę konfiguracji klienta?',
    docs: 'Oficjalna instrukcja',
    connectProvider: 'Skonfiguruj aplikację usługi',
    account: 'Autoryzuj własne konto muzyczne',
    status: 'Aktualny stan',
    online: 'Serwer jest dostępny',
    offline: 'Serwer nie jest jeszcze dostępny',
    appConfigured: 'Dane aplikacji zapisano. To jeszcze nie łączy Twojego konta muzycznego.',
    next: 'Dalej: uruchom serwer, zaloguj się na stronie właściciela, a potem otwórz stronę autoryzacji usługi. Zatwierdź połączenie i wróć tutaj. Hasło wpisujesz wyłącznie na stronie usługi.',
    create: 'Utwórz aplikację deweloperską:',
    requirements: 'Wymagania',
    callback: 'Zarejestruj dokładnie ten adres zwrotny',
    clientSecret: 'Sekret aplikacji',
    clientId: 'Identyfikator aplikacji',
    team: 'Apple Team ID',
    keyId: 'Apple Key ID',
    keyPath: 'Ścieżka do prywatnego pliku .p8',
    saved:
      'Ustawienia zapisano bezpiecznie. Po ponownym uruchomieniu serwera wpisz jamrelay onboard.',
    health: 'Test dostępności',
    tools:
      'W asystencie poproś o listę dostępnych narzędzi, a następnie sprawdź: „Wymień moje połączone usługi muzyczne”.',
    localWarning:
      'Asystent działający w chmurze nie połączy się z prywatnym adresem localhost. Dla zdalnego klienta użyj obsługiwanego bezpiecznego tunelu albo publicznego adresu HTTPS.',
    addAt: 'Dodaj serwer MCP w ustawieniach deweloperskich lub ustawieniach MCP klienta.',
    auth: 'Klient używa OAuth. JamRelay poprosi Cię o logowanie jako właściciel i zatwierdzenie dostępu do wybranych usług. Nie wklejaj sekretu właściciela do asystenta AI.',
    done: 'Gotowe. Wpisz ponownie jamrelay onboard, aby wrócić do konfiguracji.',
    ownerLogin: 'Otworzyć stronę logowania właściciela JamRelay?',
    authLink: 'Po zalogowaniu otwórz tę stronę autoryzacji usługi:',
    callbackNotUsed: 'Apple Music nie korzysta z adresu zwrotnego OAuth.',
    appleNext:
      'Po uruchomieniu serwera utwórz Music User Token w osobnej aplikacji MusicKit i przekaż go przez wskazany wyżej endpoint API chroniony dostępem właściciela. JamRelay nie udostępnia formularza w przeglądarce.',
    chatgptLimit:
      'Własne aplikacje MCP w ChatGPT wymagają odpowiedniego planu lub obszaru roboczego. ChatGPT łączy się ze zdalnym MCP; prywatny serwer wymaga obsługiwanego tunelu albo publicznego HTTPS.',
    openBrowser: 'Otwórz w przeglądarce',
    later: 'Zrobię to później',
    instructionOnly: 'Pokaż same instrukcje',
    openedLogin:
      'Po zalogowaniu otwórz powyższą stronę autoryzacji usługi, zatwierdź połączenie JamRelay, a następnie wróć i uruchom jamrelay onboard, aby sprawdzić zapisany token.',
    appleToken:
      'Apple Music korzysta z innego procesu: utwórz Music User Token w zaufanej aplikacji MusicKit, a następnie przekaż go do chronionego logowaniem właściciela endpointu /auth/apple-music/user-token. JamRelay nie może utworzyć tego tokenu.',
    genericClient: 'Inna aplikacja zgodna z MCP',
    offlineNext: 'Na hoście uruchom docker compose up -d, a potem ponownie jamrelay onboard.',
    offlineStart:
      'Uruchom JamRelay poleceniem jamrelay start, a potem ponownie wykonaj jamrelay onboard.',
    existingProvider: 'Dane aplikacji są już zapisane. Co chcesz zrobić?',
    useSaved: 'Zachowaj obecne dane',
    replaceSaved: 'Zmień dane aplikacji',
    stopFirst:
      'Serwer działa i blokuje konfigurację. Zatrzymaj go przed zmianą danych usługi, a następnie uruchom tę komendę ponownie.',
    stopDocker: 'Zatrzymaj usługę Compose poleceniem: docker compose stop jamrelay',
    stopLocal: 'Zatrzymaj serwer skrótem Ctrl+C w jego terminalu.',
    restart:
      'Przed autoryzacją uruchom ponownie serwer: lokalnie `jamrelay start`, a w Dockerze na hoście `docker compose up -d`. Potem wpisz jamrelay onboard.',
    required: 'To pole jest wymagane. Spróbuj ponownie.',
  },
  de: {
    welcome: 'JamRelay-Einrichtung fortsetzen',
    provider: 'Musikdienst auswählen',
    client: 'KI-Client auswählen',
    skip: 'Vorläufig überspringen',
    providersLabel: 'Musikdienste',
    accountAuth: 'Gespeicherte Kontotoken (nicht geprüft)',
    notConfigured: 'Nicht konfiguriert',
    openClient: 'Einrichtungsseite des Clients öffnen?',
    docs: 'Offizielle Anleitung',
    connectProvider: 'Dienstanwendung einrichten',
    account: 'Eigenes Musikkonto autorisieren',
    status: 'Aktueller Status',
    online: 'Server ist erreichbar',
    offline: 'Server ist noch nicht erreichbar',
    appConfigured:
      'Anwendungsdaten gespeichert. Damit ist dein persönliches Musikkonto noch nicht verbunden.',
    next: 'Weiter: Server starten, auf der Eigentümerseite anmelden und die Autorisierungsseite des Dienstes öffnen. Verbindung dort bestätigen und hierher zurückkehren. Passwörter nur auf der Website des Musikdienstes eingeben.',
    create: 'Entwickleranwendung erstellen:',
    requirements: 'Voraussetzungen',
    callback: 'Diese genaue Rückrufadresse registrieren',
    clientSecret: 'Anwendungsgeheimnis',
    clientId: 'Anwendungs-ID',
    team: 'Apple Team ID',
    keyId: 'Apple Key ID',
    keyPath: 'Pfad zur privaten .p8-Datei',
    saved: 'Einstellungen sicher gespeichert. Nach dem Serverneustart jamrelay onboard ausführen.',
    health: 'Erreichbarkeitstest',
    tools:
      'Im KI-Client die verfügbaren Tools auflisten lassen und testen: „Liste meine verbundenen Musikdienste auf.“',
    localWarning:
      'Ein KI-Client in der Cloud erreicht keine private localhost-Adresse. Remote-Clients benötigen einen unterstützten sicheren Tunnel oder eine öffentliche HTTPS-Adresse.',
    addAt: 'MCP-Server in den Entwickler- oder MCP-Einstellungen des Clients hinzufügen.',
    auth: 'Der Client verwendet OAuth. JamRelay fordert die Eigentümeranmeldung und die Freigabe der gewünschten Dienste an. Das Eigentümergeheimnis niemals in den KI-Client einfügen.',
    done: 'Fertig. Mit jamrelay onboard kannst du jederzeit fortfahren.',
    ownerLogin: 'JamRelay-Eigentümeranmeldung im Browser öffnen?',
    authLink: 'Nach der Anmeldung diese Autorisierungsseite öffnen:',
    callbackNotUsed: 'Apple Music verwendet keine OAuth-Rückrufadresse.',
    appleNext:
      'Nach dem Start des Servers muss ein Music User Token in einer separaten MusicKit-App erstellt und über den oben genannten, eigentümergeschützten API-Endpunkt übermittelt werden. JamRelay bietet dafür kein Browserformular.',
    chatgptLimit:
      'Eigene MCP-Apps in ChatGPT benötigen einen passenden Tarif oder Arbeitsbereich. ChatGPT verbindet sich mit Remote-MCP; private Server benötigen einen unterstützten Tunnel oder öffentliches HTTPS.',
    openBrowser: 'Im Browser öffnen',
    later: 'Später erledigen',
    instructionOnly: 'Nur Anweisungen anzeigen',
    openedLogin:
      'Nach der Anmeldung die oben gezeigte Autorisierungsseite öffnen, die JamRelay-Verbindung bestätigen und anschließend jamrelay onboard ausführen, um das gespeicherte Konto zu prüfen.',
    appleToken:
      'Apple Music nutzt einen anderen Ablauf: Erstelle einen Music User Token in einer vertrauenswürdigen MusicKit-App und sende ihn an den eigentümergeschützten Endpunkt /auth/apple-music/user-token. JamRelay kann diesen Token nicht erstellen.',
    genericClient: 'Andere MCP-kompatible Anwendung',
    offlineNext: 'Auf dem Host docker compose up -d und danach erneut jamrelay onboard ausführen.',
    offlineStart:
      'Starte JamRelay mit jamrelay start und führe danach jamrelay onboard erneut aus.',
    existingProvider: 'Anwendungsdaten sind bereits gespeichert. Was möchtest du tun?',
    useSaved: 'Vorhandene Daten beibehalten',
    replaceSaved: 'Anwendungsdaten ändern',
    stopFirst:
      'Der Server läuft und hält die Konfigurationssperre. Stoppe ihn vor der Änderung und führe diesen Befehl erneut aus.',
    stopDocker: 'Compose-Dienst mit folgendem Befehl stoppen: docker compose stop jamrelay',
    stopLocal: 'Server mit Ctrl+C in seinem Terminal stoppen.',
    restart:
      'Starte den Server vor der Provider-Autorisierung neu: lokal mit jamrelay start oder auf dem Docker-Host mit docker compose up -d. Danach jamrelay onboard ausführen.',
    required: 'Diese Angabe ist erforderlich. Bitte erneut versuchen.',
  },
  fr: {
    welcome: 'Poursuivre la configuration de JamRelay',
    provider: 'Choisir un service musical',
    client: 'Choisir un assistant IA',
    skip: 'Ignorer pour le moment',
    providersLabel: 'Services musicaux',
    accountAuth: 'Jetons de compte enregistrés (non vérifiés)',
    notConfigured: 'Non configuré',
    openClient: 'Ouvrir la page de configuration du client ?',
    docs: 'Guide officiel',
    connectProvider: 'Configurer l’application du service',
    account: 'Autoriser votre compte musical personnel',
    status: 'État actuel',
    online: 'Le serveur est accessible',
    offline: 'Le serveur n’est pas encore accessible',
    appConfigured:
      'Les identifiants de l’application sont enregistrés. Votre compte personnel n’est pas encore connecté.',
    next: 'Ensuite : démarrez le serveur, connectez-vous comme propriétaire, puis ouvrez la page d’autorisation du service. Approuvez la connexion et revenez ici. Saisissez votre mot de passe uniquement sur le site du service.',
    create: 'Créer l’application développeur sur',
    requirements: 'Conditions',
    callback: 'Enregistrer exactement cette URL de retour',
    clientSecret: 'Secret de l’application',
    clientId: 'Identifiant de l’application',
    team: 'Apple Team ID',
    keyId: 'Apple Key ID',
    keyPath: 'Chemin du fichier privé .p8',
    saved:
      'Paramètres enregistrés en sécurité. Après le redémarrage du serveur, lancez jamrelay onboard.',
    health: 'Vérification du serveur',
    tools:
      'Demandez à votre assistant la liste des outils disponibles, puis testez : « Liste mes services musicaux connectés. »',
    localWarning:
      'Un assistant hébergé dans le cloud ne peut pas joindre une adresse localhost privée. Les clients distants nécessitent un tunnel sécurisé pris en charge ou une URL HTTPS publique.',
    addAt: 'Ajoutez le serveur MCP dans les paramètres développeur ou MCP du client.',
    auth: 'Le client utilise OAuth. JamRelay demande une connexion propriétaire et l’accord pour les services choisis. Ne collez jamais le secret propriétaire dans l’assistant IA.',
    done: 'Terminé. Relancez jamrelay onboard pour reprendre plus tard.',
    ownerLogin: 'Ouvrir la connexion propriétaire JamRelay dans le navigateur ?',
    authLink: 'Après connexion, ouvrez cette page d’autorisation :',
    callbackNotUsed: 'Apple Music n’utilise pas d’URL de retour OAuth.',
    appleNext:
      'Après le démarrage du serveur, créez un Music User Token dans une application MusicKit séparée et transmettez-le via l’endpoint API protégé indiqué ci-dessus. JamRelay ne fournit pas de formulaire dans le navigateur.',
    chatgptLimit:
      'Les applications MCP personnalisées de ChatGPT nécessitent une offre ou un espace compatible. ChatGPT se connecte à un MCP distant ; un serveur privé nécessite un tunnel pris en charge ou un HTTPS public.',
    openBrowser: 'Ouvrir dans le navigateur',
    later: 'Le faire plus tard',
    instructionOnly: 'Afficher les instructions uniquement',
    openedLogin:
      'Après la connexion, ouvrez la page d’autorisation affichée plus haut, approuvez JamRelay, puis revenez et lancez jamrelay onboard pour vérifier le jeton enregistré.',
    appleToken:
      'Apple Music suit un autre processus : créez un Music User Token dans une application MusicKit de confiance, puis envoyez-le à l’endpoint /auth/apple-music/user-token protégé par le propriétaire. JamRelay ne peut pas créer ce jeton.',
    genericClient: 'Autre application compatible MCP',
    offlineNext: 'Sur l’hôte, lancez docker compose up -d, puis relancez jamrelay onboard.',
    offlineStart: 'Lancez JamRelay avec jamrelay start, puis relancez jamrelay onboard.',
    existingProvider: 'Les identifiants de l’application existent déjà. Que souhaitez-vous faire ?',
    useSaved: 'Conserver les identifiants',
    replaceSaved: 'Modifier les identifiants',
    stopFirst:
      'Le serveur fonctionne et verrouille la configuration. Arrêtez-le avant de modifier les identifiants, puis relancez cette commande.',
    stopDocker: 'Arrêtez le service Compose avec : docker compose stop jamrelay',
    stopLocal: 'Arrêtez le serveur avec Ctrl+C dans son terminal.',
    restart:
      'Redémarrez le serveur avant l’autorisation : lancez jamrelay start en local ou docker compose up -d sur l’hôte, puis jamrelay onboard.',
    required: 'Cette valeur est obligatoire. Veuillez réessayer.',
  },
  es: {
    welcome: 'Continuar la configuración de JamRelay',
    provider: 'Elige un servicio de música',
    client: 'Elige un asistente de IA',
    skip: 'Omitir por ahora',
    providersLabel: 'Servicios de música',
    accountAuth: 'Tokens de cuenta guardados (sin verificar)',
    notConfigured: 'Sin configurar',
    openClient: '¿Abrir la página de configuración del cliente?',
    docs: 'Guía oficial',
    connectProvider: 'Configurar la aplicación del servicio',
    account: 'Autorizar tu cuenta personal de música',
    status: 'Estado actual',
    online: 'El servidor está disponible',
    offline: 'El servidor aún no está disponible',
    appConfigured:
      'Se guardaron las credenciales de la aplicación. Tu cuenta personal aún no está conectada.',
    next: 'Después: inicia el servidor, accede como propietario y abre la página de autorización del servicio. Aprueba la conexión y vuelve aquí. Escribe la contraseña solo en el sitio del servicio.',
    create: 'Crea la aplicación de desarrollador en',
    requirements: 'Requisitos',
    callback: 'Registra exactamente esta URL de retorno',
    clientSecret: 'Secreto de la aplicación',
    clientId: 'ID de la aplicación',
    team: 'Apple Team ID',
    keyId: 'Apple Key ID',
    keyPath: 'Ruta al archivo privado .p8',
    saved:
      'Configuración guardada de forma segura. Tras reiniciar el servidor, ejecuta jamrelay onboard.',
    health: 'Comprobación del servidor',
    tools:
      'Pide al asistente la lista de herramientas disponibles y prueba: «Enumera mis servicios de música conectados».',
    localWarning:
      'Un asistente alojado en la nube no puede acceder a una dirección localhost privada. Los clientes remotos necesitan un túnel seguro compatible o una URL HTTPS pública.',
    addAt: 'Añade el servidor MCP en los ajustes de desarrollador o MCP del cliente.',
    auth: 'El cliente usa OAuth. JamRelay solicita el inicio de sesión del propietario y su aprobación para los servicios elegidos. No pegues el secreto del propietario en el asistente de IA.',
    done: 'Listo. Ejecuta jamrelay onboard cuando quieras continuar.',
    ownerLogin: '¿Abrir el acceso del propietario de JamRelay en el navegador?',
    authLink: 'Después de iniciar sesión, abre esta página de autorización:',
    callbackNotUsed: 'Apple Music no usa una URL de retorno OAuth.',
    appleNext:
      'Después de iniciar el servidor, crea un Music User Token en una aplicación MusicKit independiente y envíalo mediante el endpoint protegido indicado arriba. JamRelay no ofrece un formulario web para este token.',
    chatgptLimit:
      'Las aplicaciones MCP personalizadas de ChatGPT requieren un plan o espacio compatible. ChatGPT se conecta a MCP remoto; un servidor privado necesita un túnel compatible o HTTPS público.',
    openBrowser: 'Abrir en el navegador',
    later: 'Hacerlo más tarde',
    instructionOnly: 'Mostrar solo las instrucciones',
    openedLogin:
      'Después de iniciar sesión, abre la página de autorización indicada arriba, aprueba JamRelay y vuelve para ejecutar jamrelay onboard y comprobar el token guardado.',
    appleToken:
      'Apple Music sigue otro proceso: crea un Music User Token en una aplicación MusicKit de confianza y envíalo al endpoint /auth/apple-music/user-token protegido por el propietario. JamRelay no puede crear este token.',
    genericClient: 'Otra aplicación compatible con MCP',
    offlineNext:
      'En el host ejecuta docker compose up -d y después vuelve a ejecutar jamrelay onboard.',
    offlineStart: 'Inicia JamRelay con jamrelay start y vuelve a ejecutar jamrelay onboard.',
    existingProvider: 'Ya hay credenciales de la aplicación. ¿Qué quieres hacer?',
    useSaved: 'Conservar las credenciales',
    replaceSaved: 'Cambiar las credenciales',
    stopFirst:
      'El servidor está activo y mantiene bloqueada la configuración. Deténlo antes de cambiar las credenciales y vuelve a ejecutar este comando.',
    stopDocker: 'Detén el servicio Compose con: docker compose stop jamrelay',
    stopLocal: 'Detén el servidor con Ctrl+C en su terminal.',
    restart:
      'Reinicia el servidor antes de autorizar el proveedor: usa jamrelay start en local o docker compose up -d en el host y después jamrelay onboard.',
    required: 'Este valor es obligatorio. Inténtalo de nuevo.',
  },
};

function tr(key: string, language = currentLanguage()) {
  return copy[language][key] ?? copy.en[key] ?? key;
}

async function line(label: string, hidden = false) {
  return promptText(label, '', { secret: hidden });
}

async function requiredLine(label: string, hidden = false) {
  for (;;) {
    const value = await line(label, hidden);
    if (value.trim()) return value.trim();
    showPanel(tr('required'), tr('required'));
  }
}

async function openBrowser(url: string) {
  if (!process.stdin.isTTY || process.env.CI || process.env.JAMRELAY_HEADLESS === 'true')
    return false;
  try {
    if (process.platform === 'win32')
      await execFileAsync('rundll32.exe', ['url.dll,FileProtocolHandler', url]);
    else if (process.platform === 'darwin') await execFileAsync('open', [url]);
    else await execFileAsync('xdg-open', [url]);
    return true;
  } catch {
    return false;
  }
}

async function choose<T extends string>(title: string, items: readonly T[]) {
  return selectOption(
    items.map((value) => ({ label: value, value })),
    0,
    (cursor) => menuPanel(title, items, cursor),
  );
}

async function reachable(base: string) {
  const candidates = [
    base,
    `http://127.0.0.1:${process.env.PORT || '5267'}`,
    localBaseUrl(),
    ...(process.env.JAMRELAY_INSTALL_MODE === 'docker' ? ['http://jamrelay:5267'] : []),
  ];
  const origins = [...new Set(candidates)];
  const deadline = Date.now() + 6000;
  while (Date.now() < deadline) {
    for (const origin of origins) {
      try {
        const response = await fetch(new URL('/health', origin), {
          signal: AbortSignal.timeout(350),
        });
        if (response.ok) return true;
      } catch {
        /* Retry boundedly while Compose or the local process finishes starting. */
      }
    }
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 250));
  }
  return false;
}

async function storeFor(path: string) {
  const raw = process.env.TOKEN_ENCRYPTION_KEY;
  if (!raw) return [] as string[];
  return (await new EncryptedCredentialStore(path, raw).list()).map(
    (record) => record.connectionId,
  );
}

function providerConfigured(provider: Provider, settings: Record<string, string>) {
  return provider === 'apple-music'
    ? Boolean(
        settings.APPLE_MUSIC_TEAM_ID &&
        settings.APPLE_MUSIC_KEY_ID &&
        settings.APPLE_MUSIC_PRIVATE_KEY_PATH,
      )
    : Boolean(
        settings[`${provider === 'soundcloud' ? 'SOUNDCLOUD' : provider.toUpperCase()}_CLIENT_ID`],
      );
}

export async function connectProvider(provider: Provider) {
  if (!stdin.isTTY) throw new Error('Interactive setup requires a terminal.');
  const paths = loadInstallation();
  if (!existsSync(paths.config) && !process.env.TOKEN_ENCRYPTION_KEY)
    throw new Error('Run jamrelay setup before onboarding.');
  const saved = readSettings(paths.config);
  setTuiContext({ step: 5, total: 6, language: currentLanguage() });
  for (const [key, value] of Object.entries(process.env))
    if (
      value !== undefined &&
      /^(SPOTIFY_|SOUNDCLOUD_|APPLE_MUSIC_|YOUTUBE_|TOKEN_ENCRYPTION_KEY$|PROVIDER_CREDENTIAL_STORE_PATH$|MCP_|JAMRELAY_(DATA_DIR|DB_PATH|TOOLSET|INSTALL_MODE)$|HOST$|PORT$|PUBLIC_BASE_URL$|TRUST_PROXY$|LOG_LEVEL$)/.test(
        key,
      )
    )
      saved[key] = value;
  const p = providerRows[provider];
  const origin = effectiveBaseUrl(saved, {
    ...process.env,
    JAMRELAY_INSTALL_MODE: saved.JAMRELAY_INSTALL_MODE || process.env.JAMRELAY_INSTALL_MODE,
  });
  const callbackOrigin =
    provider === 'spotify' && ['localhost', '[::1]'].includes(new URL(origin).hostname)
      ? `http://127.0.0.1:${new URL(origin).port || '80'}`
      : origin;
  let callback = `${callbackOrigin}/auth/providers/${provider}/callback`;
  const wasConfigured = providerConfigured(provider, saved);
  let replace = !wasConfigured;
  if (wasConfigured) {
    const keep = await choose(tr('existingProvider'), [
      tr('useSaved'),
      tr('replaceSaved'),
      tr('later'),
    ]);
    if (keep === tr('later')) return;
    replace = keep === tr('replaceSaved');
    if (!replace && provider !== 'apple-music') {
      const prefix = provider === 'soundcloud' ? 'SOUNDCLOUD' : provider.toUpperCase();
      callback = saved[`${prefix}_REDIRECT_URI`] || callback;
    }
  }
  if (replace && (await reachable(origin))) {
    showPanel(
      tr('status'),
      `${tr('stopFirst')}\n${process.env.JAMRELAY_INSTALL_MODE === 'docker' ? tr('stopDocker') : tr('stopLocal')}`,
    );
    return;
  }
  const callbackDetails =
    provider === 'apple-music' ? tr('callbackNotUsed') : `${tr('callback')}:\n${callback}`;
  showPanel(
    p.name,
    `${p.name}\n\n${tr('requirements')}\n${requirements[currentLanguage()][provider]}\n\n${tr('create')} ${terminalLink(p.portal)}\n\n${callbackDetails}\n\n${tr('docs')}: ${p.docs}${p.rules ? `\n${p.rules}` : ''}`,
  );
  if (provider === 'apple-music')
    showPanel(p.name, `${requirements[currentLanguage()][provider]}\n\n${tr('appleToken')}`);
  if (replace && provider === 'apple-music') {
    saved.APPLE_MUSIC_TEAM_ID = await requiredLine(tr('team'));
    saved.APPLE_MUSIC_KEY_ID = await requiredLine(tr('keyId'));
    saved.APPLE_MUSIC_PRIVATE_KEY_PATH = resolve(await requiredLine(tr('keyPath')));
  } else if (replace) {
    const prefix = provider === 'soundcloud' ? 'SOUNDCLOUD' : provider.toUpperCase();
    saved[`${prefix}_CLIENT_ID`] = await requiredLine(tr('clientId'));
    saved[`${prefix}_CLIENT_SECRET`] = await requiredLine(tr('clientSecret'), true);
    saved[`${prefix}_REDIRECT_URI`] = callback;
  }
  if (replace) {
    const release = await lockInstallation(paths.config);
    try {
      const config = validateSettings(saved);
      saveSettings(paths.config, saved);
      for (const [key, value] of Object.entries(saved)) process.env[key] = value;
      process.env.JAMRELAY_CONFIG_PATH = paths.config;
      process.env.PUBLIC_BASE_URL = config.PUBLIC_BASE_URL;
    } finally {
      release();
    }
  }
  const online = !replace && (await reachable(origin));
  const authorizationUrl = `${new URL(callback).origin}/auth/providers/${provider}/start`;
  showPanel(
    tr('status'),
    `\n${tr('appConfigured')}\n\n${provider === 'apple-music' ? tr('appleNext') : tr('next')}\n${tr('saved')}`,
  );
  if (replace) showPanel(tr('restart'), tr('restart'));
  if (online && provider !== 'apple-music') {
    showPanel(tr('authLink'), `${tr('authLink')}\n${authorizationUrl}`);
    const openLogin = await choose(tr('ownerLogin'), [tr('openBrowser'), tr('later')]);
    if (openLogin === tr('openBrowser')) {
      const loginUrl = `${new URL(callback).origin}/owner/login`;
      if (!(await openBrowser(loginUrl))) showPanel(tr('ownerLogin'), loginUrl);
      else showPanel(tr('ownerLogin'), tr('openedLogin'));
    }
  }
}

export async function connectClient(client: Client) {
  if (!stdin.isTTY) throw new Error('Interactive setup requires a terminal.');
  loadInstallation();
  const language = currentLanguage();
  setTuiContext({ step: 6, total: 6, language });
  const origin = effectiveBaseUrl(
    Object.fromEntries(
      Object.entries(process.env).filter(
        (entry): entry is [string, string] => entry[1] !== undefined,
      ),
    ),
  );
  const mcp = `${origin}/mcp`;
  const online = await reachable(origin);
  const providerNames = Object.keys(providerRows) as Provider[];
  const configured = providerNames.filter((p) =>
    p === 'apple-music'
      ? Boolean(process.env.APPLE_MUSIC_TEAM_ID)
      : Boolean(process.env[`${p === 'soundcloud' ? 'SOUNDCLOUD' : p.toUpperCase()}_CLIENT_ID`]),
  );
  const authorized = await storeFor(process.env.PROVIDER_CREDENTIAL_STORE_PATH || '');
  const status = `${online ? '✓' : '○'} ${online ? tr('online') : tr('offline')}\n${tr('providersLabel')}: ${configured.length ? configured.join(', ') : tr('notConfigured')}\n${tr('accountAuth')}: ${authorized.length ? authorized.join(', ') : tr('notConfigured')}`;
  const offline = !online
    ? `${tr('offline')}. ${process.env.JAMRELAY_INSTALL_MODE === 'docker' ? tr('offlineNext') : tr('offlineStart')}`
    : '';
  const config =
    client === 'cursor'
      ? `.cursor/mcp.json\n${JSON.stringify({ mcpServers: { jamrelay: { url: mcp } } }, null, 2)}`
      : client === 'vscode'
        ? `mcp.json\n${JSON.stringify({ servers: { jamrelay: { type: 'http', url: mcp } } }, null, 2)}`
        : '';
  const localWarning = ['localhost', '127.0.0.1'].includes(new URL(origin).hostname)
    ? tr('localWarning')
    : '';
  showPanel(
    client,
    [
      status,
      offline,
      tr('addAt'),
      clientInstructions[language][client],
      `${clientLabels[language].endpoint}: ${mcp}\n${clientLabels[language].transport}\n${tr('auth')}`,
      config,
      client === 'chatgpt' ? tr('chatgptLimit') : '',
      localWarning,
      `${tr('health')}: ${online ? clientLabels[language].verified : clientLabels[language].pending}\n${tr('tools')}`,
    ]
      .filter(Boolean)
      .join('\n\n'),
  );
  const { changeState } = await import('./state.js');
  const previousConfig = process.env.JAMRELAY_CONFIG_PATH;
  process.env.JAMRELAY_CONFIG_PATH = installationPaths().config;
  try {
    await changeState((state) => {
      state.guidedClients = [...new Set([...state.guidedClients, client])];
    });
  } finally {
    if (previousConfig === undefined) delete process.env.JAMRELAY_CONFIG_PATH;
    else process.env.JAMRELAY_CONFIG_PATH = previousConfig;
  }
  const shouldOpen = await choose(tr('openClient'), [tr('openBrowser'), tr('instructionOnly')]);
  if (shouldOpen === tr('openBrowser')) {
    const url =
      client === 'chatgpt'
        ? 'https://help.openai.com/en/articles/12584461-developer-mode-and-full-mcp-connectors-in-chatgpt'
        : client === 'claude'
          ? 'https://support.anthropic.com/en/articles/11503834-building-custom-integrations-via-remote-mcp-servers'
          : client === 'cursor'
            ? 'https://cursor.com/docs/context/model-context-protocol'
            : client === 'vscode'
              ? 'https://code.visualstudio.com/docs/agent-customization/mcp-servers'
              : mcp;
    if (!(await openBrowser(url))) showPanel(tr('openClient'), url);
  }
  showPanel(tr('done'), tr('done'));
}

export async function onboard() {
  if (!stdin.isTTY) throw new Error('Interactive setup requires a terminal.');
  const paths = loadInstallation();
  setTuiContext({ step: 5, total: 6, language: currentLanguage() });
  if (!existsSync(paths.config) && !process.env.TOKEN_ENCRYPTION_KEY)
    throw new Error('Run jamrelay setup before onboarding.');
  const providerChoice = await choose(tr('provider'), [
    ...Object.values(providerRows).map((p) => p.name),
    tr('skip'),
  ]);
  const selectedProvider = (Object.keys(providerRows) as Provider[]).find(
    (p) => providerRows[p].name === providerChoice,
  );
  if (selectedProvider) await connectProvider(selectedProvider);
  const clientChoice = await choose(tr('client'), [
    'ChatGPT',
    'Claude',
    'Cursor',
    'VS Code',
    tr('genericClient'),
    tr('skip'),
  ]);
  const client =
    (
      { ChatGPT: 'chatgpt', Claude: 'claude', Cursor: 'cursor', 'VS Code': 'vscode' } as Record<
        string,
        Client
      >
    )[clientChoice ?? ''] ?? (clientChoice === tr('genericClient') ? 'generic' : undefined);
  if (client) await connectClient(client);
  showPanel(tr('done'), tr('done'));
}

export async function guidedConnect(kind: 'provider' | 'client', name: string) {
  if (kind === 'provider') {
    if (!Object.hasOwn(providerRows, name)) throw new Error('Unknown provider');
    return connectProvider(name as Provider);
  }
  if (!['chatgpt', 'claude', 'cursor', 'vscode', 'generic'].includes(name))
    throw new Error('Unknown client');
  return connectClient(name as Client);
}
