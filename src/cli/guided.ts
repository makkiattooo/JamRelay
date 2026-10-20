import { copyToClipboard, openBrowser } from './browser.js';
import { installClient, verifyClient, type InstallClient } from './client-installation.js';
import { probeHealth } from './network-context.js';
import { stdin } from 'node:process';
import { resolve } from 'node:path';
import { existsSync, readFileSync, unlinkSync } from 'node:fs';
import { currentLanguage, type Language } from './i18n/index.js';
import {
  menuPanel,
  clearPanelContext,
  promptText,
  selectOption,
  setTuiContext,
  showPanel,
  showLoadingPanel,
  waitForEnter,
} from './tui.js';
import { effectiveBaseUrl, localBaseUrl } from '../config.js';
import {
  installationPaths,
  loadInstallation,
  readSettings,
  saveSettings,
  lockInstallation,
  queueSettingsRestart,
  readSettingsRestartResult,
  INSTALLATION_LOCKED_MESSAGE,
} from '../runtime/installation.js';
import { validateSettings } from '../runtime/setup.js';
import { readState } from './state.js';

type Provider = 'spotify' | 'soundcloud' | 'apple-music' | 'youtube';
type Client = 'chatgpt' | 'codex' | 'gemini-cli' | 'claude' | 'cursor' | 'vscode' | 'generic';

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

const providerSteps: Record<Language, Record<Provider, string>> = {
  en: {
    spotify:
      '1. App name: JamRelay. App description: Self-hosted music MCP server for AI assistants.\n2. Website (optional): https://github.com/makkiattooo/JamRelay. Select Web API. Add the exact Redirect URI shown below.\n3. Accept the terms, save, then copy Client ID and Client Secret from app settings.',
    soundcloud:
      '1. An Artist Pro plan is currently required to register an API app.\n2. Open Your Apps and create JamRelay. Use description: Self-hosted music MCP server for AI assistants.\n3. Copy the Client ID and Client Secret. JamRelay handles OAuth authorization.',
    'apple-music':
      '1. In Apple Developer, create a Media ID and enable MusicKit.\n2. Create a Media Services private key and associate it with that ID.\n3. Enter Team ID, Key ID, and the downloaded .p8 file path below. Keep the key private.',
    youtube:
      '1. In Google Cloud, create/select a project and enable YouTube Data API v3.\n2. Configure OAuth consent and add yourself as a test user if asked.\n3. Create an OAuth client (Web application), add the exact Redirect URI below, then copy its ID and secret.',
  },
  pl: {
    spotify:
      '1. App name: JamRelay. App description: Self-hosted music MCP server for AI assistants.\n2. Website (opcjonalnie): https://github.com/makkiattooo/JamRelay. Wybierz Web API i dodaj dokładny adres zwrotny pokazany niżej.\n3. Zaakceptuj warunki, zapisz i skopiuj Client ID oraz Client Secret z ustawień aplikacji.',
    soundcloud:
      '1. Rejestracja aplikacji API wymaga obecnie planu Artist Pro.\n2. Otwórz Your Apps i utwórz JamRelay. Opis: Self-hosted music MCP server for AI assistants.\n3. Skopiuj Client ID i Client Secret. JamRelay obsłuży logowanie OAuth.',
    'apple-music':
      '1. W Apple Developer utwórz Media ID i włącz MusicKit.\n2. Utwórz klucz prywatny Media Services i przypisz go do tego ID.\n3. Podaj niżej Team ID, Key ID i ścieżkę do pobranego pliku .p8. Chroń ten plik.',
    youtube:
      '1. W Google Cloud wybierz lub utwórz projekt i włącz YouTube Data API v3.\n2. Skonfiguruj zgodę OAuth; jeśli trzeba, dodaj siebie jako testera.\n3. Utwórz klienta OAuth typu aplikacja internetowa, dodaj dokładny adres zwrotny i skopiuj ID oraz sekret.',
  },
  de: {
    spotify:
      '1. Erstelle eine App namens JamRelay. Beschreibung: Self-hosted music MCP server for AI assistants.\n2. Wähle Web API und füge die genaue Rückrufadresse unten in den App-Einstellungen hinzu.\n3. Speichere und kopiere Client ID und Client Secret aus den Einstellungen.',
    soundcloud:
      '1. Für API-Apps ist derzeit Artist Pro erforderlich.\n2. Öffne Your Apps und erstelle JamRelay. Beschreibung: Self-hosted music MCP server for AI assistants.\n3. Kopiere Client ID und Client Secret. JamRelay übernimmt OAuth.',
    'apple-music':
      '1. Erstelle in Apple Developer eine Media ID und aktiviere MusicKit.\n2. Erstelle einen Media-Services-Privatschlüssel und ordne ihn der ID zu.\n3. Gib Team ID, Key ID und den Pfad zur .p8-Datei ein. Bewahre sie sicher auf.',
    youtube:
      '1. Wähle in Google Cloud ein Projekt und aktiviere YouTube Data API v3.\n2. Richte die OAuth-Zustimmung ein und füge dich bei Bedarf als Testnutzer hinzu.\n3. Erstelle einen OAuth-Webclient, trage die genaue Rückrufadresse ein und kopiere ID und Secret.',
  },
  fr: {
    spotify:
      '1. Créez une application nommée JamRelay. Description : Self-hosted music MCP server for AI assistants.\n2. Choisissez Web API et ajoutez l’URL de retour exacte ci-dessous dans les paramètres.\n3. Enregistrez, puis copiez Client ID et Client Secret dans les paramètres.',
    soundcloud:
      '1. Un abonnement Artist Pro est actuellement requis pour créer une application API.\n2. Ouvrez Your Apps et créez JamRelay. Description : Self-hosted music MCP server for AI assistants.\n3. Copiez Client ID et Client Secret. JamRelay gère OAuth.',
    'apple-music':
      '1. Dans Apple Developer, créez un Media ID et activez MusicKit.\n2. Créez une clé privée Media Services et associez-la à cet ID.\n3. Saisissez Team ID, Key ID et le chemin du fichier .p8. Gardez ce fichier privé.',
    youtube:
      '1. Dans Google Cloud, choisissez un projet et activez YouTube Data API v3.\n2. Configurez le consentement OAuth et ajoutez-vous comme testeur si demandé.\n3. Créez un client OAuth Web, ajoutez l’URL de retour exacte et copiez son ID et son secret.',
  },
  es: {
    spotify:
      '1. Crea una aplicación llamada JamRelay. Descripción: Self-hosted music MCP server for AI assistants.\n2. Elige Web API y añade la URL de retorno exacta de abajo en los ajustes.\n3. Guarda y copia Client ID y Client Secret de los ajustes.',
    soundcloud:
      '1. Actualmente se requiere Artist Pro para registrar aplicaciones API.\n2. Abre Your Apps y crea JamRelay. Descripción: Self-hosted music MCP server for AI assistants.\n3. Copia Client ID y Client Secret. JamRelay gestiona OAuth.',
    'apple-music':
      '1. En Apple Developer, crea un Media ID y activa MusicKit.\n2. Crea una clave privada Media Services y asígnala a ese ID.\n3. Introduce Team ID, Key ID y la ruta del archivo .p8. Guarda el archivo en privado.',
    youtube:
      '1. En Google Cloud, elige un proyecto y activa YouTube Data API v3.\n2. Configura el consentimiento OAuth y añádete como usuario de prueba si se solicita.\n3. Crea un cliente OAuth Web, añade la URL exacta y copia su ID y secreto.',
  },
};

const clientInstructions: Record<Language, Partial<Record<Client, string>>> = {
  en: {
    chatgpt:
      'ChatGPT: Settings → Apps → Advanced settings → enable developer mode, then create a custom app using the MCP URL. Availability depends on your plan and workspace.',
    codex:
      'Codex CLI and Desktop share MCP settings. Run `codex mcp add jamrelay --url URL`, then verify registration with `codex mcp list`. Complete OAuth and request tools before treating the connection as verified.',
    'gemini-cli':
      'Gemini CLI: run `gemini mcp add --scope user --transport http jamrelay URL` and verify with `gemini mcp list`. Complete OAuth and request the JamRelay tool list.',
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
    codex:
      'Codex CLI i Desktop współdzielą ustawienia MCP. Uruchom `codex mcp add jamrelay --url URL`, a rejestrację sprawdź przez `codex mcp list`. Dokończ OAuth i wyświetl narzędzia, zanim uznasz połączenie za zweryfikowane.',
    'gemini-cli':
      'Gemini CLI: uruchom `gemini mcp add --scope user --transport http jamrelay URL` i sprawdź `gemini mcp list`. Dokończ OAuth i wyświetl narzędzia JamRelay.',
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
    codex:
      'Codex CLI und Desktop teilen die MCP-Einstellungen. Führe `codex mcp add jamrelay --url URL` aus und prüfe die Registrierung mit `codex mcp list`. Schließe OAuth ab und rufe die Tools ab, bevor du die Verbindung als verifiziert betrachtest.',
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
    codex:
      'Codex CLI et Desktop partagent les paramètres MCP. Exécutez `codex mcp add jamrelay --url URL`, puis vérifiez avec `codex mcp list`. Terminez OAuth et demandez les outils avant de considérer la connexion vérifiée.',
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
    codex:
      'Codex CLI y Desktop comparten la configuración MCP. Ejecuta `codex mcp add jamrelay --url URL` y comprueba el registro con `codex mcp list`. Completa OAuth y solicita las herramientas antes de considerar verificada la conexión.',
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
    spotifyFields:
      'Create a Spotify developer application with App name “JamRelay”, description “Self-hosted MCP server connecting AI assistants with music services.”, optional Website https://github.com/makkiattooo/JamRelay, and API “Web API”. Paste the exact Redirect URI shown below. Then create the app, open Settings → Users Management and add your Spotify account. Development Mode requires Premium for the app owner and currently allows up to 5 authorized accounts.',
    credentialsStep:
      'Copy each value from the provider dashboard. The secret is stored in JamRelay’s private configuration.',
    credentialsTitle: 'Service application credentials',
    copyCallback: 'Copy callback URL',
    copied: 'Copied to the host clipboard.',
    copyUnavailable: 'Clipboard is unavailable here; select and copy this URL manually.',
    continueCredentials: 'Continue to Client ID and Client Secret',
    clientSecret: 'Client secret',
    clientId: 'Client ID',
    pasteClientId: 'Paste the Client ID from the service dashboard',
    pasteClientSecret: 'Paste the Client Secret from the service dashboard',
    team: 'Apple Team ID',
    keyId: 'Apple Key ID',
    keyPath: 'Path to the private .p8 key file',
    saved: 'Settings saved securely.',
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
    browserHint:
      'This terminal cannot launch the host browser. Ctrl+click the link below to open it.',
    openedPortal: 'The provider page was opened in your browser.',
    pressEnter: 'Press Enter to return to JamRelay',
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
    restarting: 'Applying the new settings and restarting JamRelay…',
    restartSending: 'Sending the new settings to the running JamRelay server…',
    restartApplying: 'Settings received. Waiting for the server to restart…',
    restartChecking: 'Server restarted. Checking that it is responding…',
    restarted: 'Settings applied. JamRelay restarted and is ready.',
    restartFailed: 'JamRelay restarted but did not become reachable. Check the server logs.',
    restartNoAck:
      'No response from the server after 30 seconds. Check that the server is running the current image and shares the /data volume.',
    restartNoResult:
      'The server stopped responding before confirming the settings. Check its logs and configuration before retrying.',
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
    spotifyFields:
      'Utwórz aplikację Spotify: App name „JamRelay”, description „Self-hosted MCP server connecting AI assistants with music services.”, opcjonalny Website https://github.com/makkiattooo/JamRelay i API „Web API”. Wklej dokładny Redirect URI pokazany niżej. Utwórz aplikację, otwórz Settings → Users Management i dodaj swoje konto Spotify. Tryb Development wymaga Premium u właściciela aplikacji i obecnie pozwala na maksymalnie 5 kont.',
    credentialsStep:
      'Skopiuj obie wartości z panelu usługi. Sekret zapisze się w prywatnej konfiguracji JamRelay.',
    credentialsTitle: 'Dane aplikacji usługi',
    copyCallback: 'Skopiuj adres zwrotny',
    copied: 'Skopiowano do schowka hosta.',
    copyUnavailable: 'Schowek jest niedostępny; zaznacz i skopiuj ten adres ręcznie.',
    continueCredentials: 'Przejdź do Client ID i Client Secret',
    clientSecret: 'Sekret aplikacji',
    clientId: 'Identyfikator aplikacji',
    pasteClientId: 'Wklej tutaj Client ID z panelu usługi',
    pasteClientSecret: 'Wklej tutaj Client Secret z panelu usługi',
    team: 'Apple Team ID',
    keyId: 'Apple Key ID',
    keyPath: 'Ścieżka do prywatnego pliku .p8',
    saved: 'Ustawienia zapisano bezpiecznie.',
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
    browserHint:
      'Terminal nie może sam uruchomić przeglądarki hosta. Kliknij link z Ctrl, aby go otworzyć.',
    openedPortal: 'Strona usługi została otwarta w przeglądarce.',
    pressEnter: 'Naciśnij Enter, aby wrócić do JamRelay',
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
    restarting: 'Zapisuję ustawienia i automatycznie uruchamiam ponownie JamRelay…',
    restartSending: 'Przekazuję ustawienia do działającego serwera JamRelay…',
    restartApplying: 'Serwer odebrał ustawienia. Czekam na jego ponowne uruchomienie…',
    restartChecking: 'Serwer uruchomiony ponownie. Sprawdzam, czy odpowiada…',
    restarted: 'Ustawienia zastosowane. JamRelay uruchomił się ponownie i działa.',
    restartFailed: 'JamRelay uruchomił się ponownie, ale nie odpowiada. Sprawdź logi serwera.',
    restartNoAck:
      'Serwer nie odpowiedział w 30 sekund. Sprawdź, czy działa na aktualnym obrazie i współdzieli wolumen /data.',
    restartNoResult:
      'Serwer przestał odpowiadać przed potwierdzeniem ustawień. Przed ponowieniem sprawdź jego logi i konfigurację.',
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
    spotifyFields:
      'Im Spotify-Formular: App name: JamRelay. App description: „Verbindet Musikdienste über einen selbst gehosteten MCP-Server mit KI-Assistenten.“ Website ist optional; du kannst https://github.com/makkiattooo/JamRelay verwenden. Redirect URI: die genaue URL unten kopieren. Bei API/SDK Web API auswählen. Danach die App erstellen, Settings → Users Management öffnen und dein Spotify-Konto zur Allowlist hinzufügen. Development Mode erfordert Premium für den App-Inhaber und erlaubt bis zu 5 autorisierte Konten.',
    credentialsStep:
      'Kopiere beide Werte aus dem Anbieter-Dashboard. Das Secret wird in JamRelays privater Konfiguration gespeichert.',
    credentialsTitle: 'Zugangsdaten der Dienst-App',
    copyCallback: 'Callback-URL kopieren',
    copied: 'In die Zwischenablage des Hosts kopiert.',
    copyUnavailable: 'Zwischenablage nicht verfügbar; kopiere diese URL manuell.',
    continueCredentials: 'Weiter zu Client ID und Client Secret',
    clientSecret: 'Anwendungsgeheimnis',
    clientId: 'Anwendungs-ID',
    pasteClientId: 'Client ID aus dem Dienst-Dashboard einfügen',
    pasteClientSecret: 'Client Secret aus dem Dienst-Dashboard einfügen',
    team: 'Apple Team ID',
    keyId: 'Apple Key ID',
    keyPath: 'Pfad zur privaten .p8-Datei',
    saved: 'Einstellungen sicher gespeichert.',
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
    browserHint:
      'Dieses Terminal kann den Browser des Hosts nicht starten. Öffne den Link mit Strg+Klick.',
    openedPortal: 'Die Anbieterseite wurde im Browser geöffnet.',
    pressEnter: 'Drücke Enter, um zu JamRelay zurückzukehren',
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
    restarting: 'Einstellungen werden angewendet und JamRelay neu gestartet…',
    restartSending: 'Neue Einstellungen werden an den laufenden JamRelay-Server gesendet…',
    restartApplying: 'Einstellungen empfangen. Der Neustart des Servers läuft…',
    restartChecking: 'Server neu gestartet. Erreichbarkeit wird geprüft…',
    restarted: 'Einstellungen angewendet. JamRelay wurde neu gestartet und ist bereit.',
    restartFailed:
      'JamRelay wurde neu gestartet, ist aber nicht erreichbar. Prüfe die Serverprotokolle.',
    restartNoAck:
      'Keine Antwort vom Server nach 30 Sekunden. Prüfe das aktuelle Image und das gemeinsame /data-Volume.',
    restartNoResult:
      'Der Server antwortet nicht mehr und hat die Einstellungen nicht bestätigt. Prüfe Protokolle und Konfiguration.',
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
    spotifyFields:
      'Dans le formulaire Spotify : App name : JamRelay. App description : « Connecte les services musicaux aux assistants IA via un serveur MCP auto-hébergé. » Le Website est facultatif ; vous pouvez utiliser https://github.com/makkiattooo/JamRelay. Redirect URI : copiez exactement l’URL ci-dessous. Choisissez Web API pour API/SDK. Créez ensuite l’application, ouvrez Settings → Users Management et ajoutez votre compte Spotify à la liste. Le mode Development exige Premium pour le propriétaire de l’application et autorise jusqu’à 5 comptes.',
    credentialsStep:
      'Copiez les deux valeurs depuis le tableau de bord du fournisseur. Le secret sera conservé dans la configuration privée de JamRelay.',
    credentialsTitle: 'Identifiants de l’application du service',
    copyCallback: 'Copier l’URL de retour',
    copied: 'Copié dans le presse-papiers de l’hôte.',
    copyUnavailable: 'Presse-papiers indisponible ; copiez cette URL manuellement.',
    continueCredentials: 'Continuer vers Client ID et Client Secret',
    clientSecret: 'Secret de l’application',
    clientId: 'Identifiant de l’application',
    pasteClientId: 'Collez le Client ID du tableau de bord du service',
    pasteClientSecret: 'Collez le Client Secret du tableau de bord du service',
    team: 'Apple Team ID',
    keyId: 'Apple Key ID',
    keyPath: 'Chemin du fichier privé .p8',
    saved: 'Paramètres enregistrés en sécurité.',
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
    browserHint:
      'Ce terminal ne peut pas lancer le navigateur de l’hôte. Ouvrez le lien avec Ctrl+clic.',
    openedPortal: 'La page du fournisseur a été ouverte dans le navigateur.',
    pressEnter: 'Appuyez sur Entrée pour revenir à JamRelay',
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
    restarting: 'Application des paramètres et redémarrage de JamRelay…',
    restartSending: 'Envoi des nouveaux paramètres au serveur JamRelay…',
    restartApplying: 'Paramètres reçus. Attente du redémarrage du serveur…',
    restartChecking: 'Serveur redémarré. Vérification de sa disponibilité…',
    restarted: 'Paramètres appliqués. JamRelay a redémarré et fonctionne.',
    restartFailed: 'JamRelay a redémarré mais ne répond pas. Consultez les journaux du serveur.',
    restartNoAck:
      'Aucune réponse du serveur après 30 secondes. Vérifiez l’image actuelle et le volume /data partagé.',
    restartNoResult:
      'Le serveur ne répond plus et n’a pas confirmé les paramètres. Vérifiez ses journaux et sa configuration.',
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
    spotifyFields:
      'En el formulario de Spotify: App name: JamRelay. App description: “Conecta servicios de música con asistentes de IA mediante un servidor MCP autohospedado.” Website es opcional; puedes usar https://github.com/makkiattooo/JamRelay. Redirect URI: copia exactamente la URL siguiente. Elige Web API en API/SDK. Después crea la aplicación, abre Settings → Users Management y añade tu cuenta de Spotify a la lista permitida. Development Mode requiere Premium para el propietario y permite hasta 5 cuentas autorizadas.',
    credentialsStep:
      'Copia ambos valores del panel del proveedor. JamRelay guardará el secreto en su configuración privada.',
    credentialsTitle: 'Credenciales de la aplicación del servicio',
    copyCallback: 'Copiar URL de retorno',
    copied: 'Copiada al portapapeles del host.',
    copyUnavailable: 'Portapapeles no disponible; copia esta URL manualmente.',
    continueCredentials: 'Continuar a Client ID y Client Secret',
    clientSecret: 'Secreto de la aplicación',
    clientId: 'ID de la aplicación',
    pasteClientId: 'Pega el Client ID del panel del servicio',
    pasteClientSecret: 'Pega el Client Secret del panel del servicio',
    team: 'Apple Team ID',
    keyId: 'Apple Key ID',
    keyPath: 'Ruta al archivo privado .p8',
    saved: 'Configuración guardada de forma segura.',
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
    browserHint:
      'Este terminal no puede abrir el navegador del host. Pulsa Ctrl y haz clic en el enlace.',
    openedPortal: 'La página del proveedor se abrió en el navegador.',
    pressEnter: 'Pulsa Enter para volver a JamRelay',
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
    restarting: 'Aplicando los ajustes y reiniciando JamRelay…',
    restartSending: 'Enviando los ajustes al servidor JamRelay…',
    restartApplying: 'Ajustes recibidos. Esperando a que el servidor se reinicie…',
    restartChecking: 'Servidor reiniciado. Comprobando que responde…',
    restarted: 'Ajustes aplicados. JamRelay se reinició y está listo.',
    restartFailed: 'JamRelay se reinició, pero no responde. Revisa los registros del servidor.',
    restartNoAck:
      'El servidor no respondió en 30 segundos. Comprueba que usa la imagen actual y comparte el volumen /data.',
    restartNoResult:
      'El servidor dejó de responder antes de confirmar los ajustes. Revisa sus registros y configuración.',
    required: 'Este valor es obligatorio. Inténtalo de nuevo.',
  },
};

function tr(key: string, language = currentLanguage()) {
  return copy[language][key] ?? copy.en[key] ?? key;
}

async function line(
  label: string,
  hidden = false,
  context?: string,
  placeholder = label,
  fieldLabel?: string,
) {
  return promptText(label, '', { secret: hidden, context, placeholder, fieldLabel });
}

async function requiredLine(
  label: string,
  hidden = false,
  context?: string,
  placeholder = label,
  fieldLabel?: string,
) {
  for (;;) {
    const value = await line(label, hidden, context, placeholder, fieldLabel);
    if (value.trim()) return value.trim();
    showPanel(tr('required'), tr('required'));
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
  try {
    return await probeHealth(base);
  } catch {
    return false;
  }
}

function removeUnclaimedRestartRequest(path: string, id: string) {
  if (!existsSync(path)) return;
  try {
    const request = JSON.parse(readFileSync(path, 'utf8')) as { id?: string };
    // Don't leave a request queued to be applied on a later server restart.
    if (request.id === id) unlinkSync(path);
  } catch {
    // Leave malformed or concurrently changed files for the server to handle.
  }
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
  setTuiContext({ step: null, total: null, language: currentLanguage() });
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
  if (
    !replace &&
    provider !== 'apple-music' &&
    new URL(callback).origin !== new URL(origin).origin
  ) {
    showPanel(
      'Provider callback needs review',
      `Saved callback: ${callback}\nCurrent server: ${origin}\nRegister the exact current callback in the provider developer application. To update saved credentials/callback, stop JamRelay and run this command again with Replace credentials. No existing credentials were changed.`,
    );
    return;
  }
  const callbackDetails =
    provider === 'apple-music' ? tr('callbackNotUsed') : `${tr('callback')}:\n${callback}`;
  showPanel(
    p.name,
    `${providerSteps[currentLanguage()][provider]}\n\n${callbackDetails}\n\n${tr('create')}: ${p.portal}`,
  );
  if (provider === 'apple-music')
    showPanel(
      p.name,
      `${providerSteps[currentLanguage()][provider]}\n\n${tr('appleToken')}\n\n${tr('create')}: ${p.portal}`,
    );
  if (replace && provider !== 'apple-music') {
    for (;;) {
      const action = await choose(tr('create'), [
        tr('openBrowser'),
        tr('copyCallback'),
        tr('continueCredentials'),
        tr('later'),
      ]);
      if (action === tr('later') || action === undefined) return;
      if (action === tr('openBrowser')) {
        const opened = await openBrowser(p.portal);
        if (!opened) showPanel(p.name, `${tr('browserHint')}\n\n${p.portal}`);
        else showPanel(p.name, `${tr('openedPortal')}\n\n${p.portal}`);
        await waitForEnter(tr('pressEnter'));
      } else if (action === tr('copyCallback')) {
        const copied = await copyToClipboard(callback);
        showPanel(
          tr('copyCallback'),
          copied
            ? `${tr('callback')}:\n${callback}\n\n${tr('copied')}`
            : `${tr('callback')}:\n${callback}\n\n${tr('copyUnavailable')}`,
        );
        await waitForEnter(tr('pressEnter'));
      } else {
        break;
      }
    }
  } else if (replace) {
    const action = await choose(tr('create'), [tr('openBrowser'), tr('later')]);
    if (action !== tr('openBrowser')) return;
    const opened = await openBrowser(p.portal);
    showPanel(
      p.name,
      opened ? `${tr('openedPortal')}\n\n${p.portal}` : `${tr('browserHint')}\n\n${p.portal}`,
    );
    await waitForEnter(tr('pressEnter'));
  }
  if (replace && provider === 'apple-music') {
    saved.APPLE_MUSIC_TEAM_ID = await requiredLine(tr('team'));
    saved.APPLE_MUSIC_KEY_ID = await requiredLine(tr('keyId'));
    saved.APPLE_MUSIC_PRIVATE_KEY_PATH = resolve(await requiredLine(tr('keyPath')));
  } else if (replace) {
    const prefix = provider === 'soundcloud' ? 'SOUNDCLOUD' : provider.toUpperCase();
    const firstField = `1/2  > ${tr('clientId')}\n2/2    ${tr('clientSecret')}\n\n${tr('credentialsStep')}`;
    const secondField = `1/2  ✓ ${tr('clientId')}\n2/2  > ${tr('clientSecret')}\n\n${tr('credentialsStep')}`;
    saved[`${prefix}_CLIENT_ID`] = await requiredLine(
      tr('credentialsTitle'),
      false,
      firstField,
      tr('pasteClientId'),
      tr('clientId'),
    );
    saved[`${prefix}_CLIENT_SECRET`] = await requiredLine(
      tr('credentialsTitle'),
      true,
      secondField,
      tr('pasteClientSecret'),
      tr('clientSecret'),
    );
    saved[`${prefix}_REDIRECT_URI`] = callback;
  }
  let restarted = false;
  if (replace) {
    let release: (() => void) | undefined;
    try {
      release = await lockInstallation(paths.config);
      const config = validateSettings(saved);
      saveSettings(paths.config, saved);
      for (const [key, value] of Object.entries(saved)) process.env[key] = value;
      process.env.JAMRELAY_CONFIG_PATH = paths.config;
      process.env.PUBLIC_BASE_URL = config.PUBLIC_BASE_URL;
    } catch (error) {
      if (
        process.env.JAMRELAY_INSTALL_MODE !== 'docker' ||
        !(error instanceof Error) ||
        error.message !== INSTALLATION_LOCKED_MESSAGE
      )
        throw error;
      const pending = queueSettingsRestart(paths.config, saved);
      let loadingMessage = tr('restartSending');
      let stopLoading = showLoadingPanel(tr('restarting'), loadingMessage);
      try {
        const deadline = Date.now() + 30_000;
        let result: ReturnType<typeof readSettingsRestartResult>;
        while (Date.now() < deadline) {
          result = readSettingsRestartResult(pending.result);
          if (result?.id === pending.id) {
            if (!result.ok) throw new Error(result.message || tr('restartFailed'));
            break;
          }
          if (loadingMessage === tr('restartSending') && !existsSync(pending.request)) {
            stopLoading();
            loadingMessage = tr('restartApplying');
            stopLoading = showLoadingPanel(tr('restarting'), loadingMessage);
          }
          await new Promise((resolve) => setTimeout(resolve, 250));
        }
        if (!result || result.id !== pending.id) {
          if (loadingMessage === tr('restartSending'))
            removeUnclaimedRestartRequest(pending.request, pending.id);
          throw new Error(
            tr(loadingMessage === tr('restartSending') ? 'restartNoAck' : 'restartNoResult'),
          );
        }
        unlinkSync(pending.result);
        stopLoading();
        stopLoading = showLoadingPanel(tr('restarting'), tr('restartChecking'));
        const restartOrigin = process.env.JAMRELAY_SERVICE_URL || origin;
        const restartDeadline = Date.now() + 90_000;
        while (Date.now() < restartDeadline && !(await reachable(restartOrigin)))
          await new Promise((resolve) => setTimeout(resolve, 500));
        if (!(await reachable(restartOrigin))) throw new Error(tr('restartFailed'));
        restarted = true;
      } finally {
        stopLoading();
      }
    } finally {
      release?.();
    }
  }
  const online = !replace && (await reachable(origin));
  const authorizationUrl = `${new URL(callback).origin}/auth/providers/${provider}/start`;
  showPanel(
    tr('status'),
    `\n${tr('appConfigured')}\n\n${provider === 'apple-music' ? tr('appleNext') : tr('next')}\n${restarted ? tr('restarted') : tr('saved')}`,
  );
  if (replace && !restarted) showPanel(tr('restart'), tr('restart'));
  if ((online || restarted) && provider !== 'apple-music') {
    showPanel(tr('authLink'), `${tr('authLink')}\n${authorizationUrl}`);
    const openLogin = await choose(tr('ownerLogin'), [tr('openBrowser'), tr('later')]);
    if (openLogin === tr('openBrowser')) {
      const loginUrl = `${new URL(callback).origin}/owner/login?next=${encodeURIComponent(new URL(authorizationUrl).pathname)}`;
      if (!(await openBrowser(loginUrl))) showPanel(tr('ownerLogin'), loginUrl);
      else showPanel(tr('ownerLogin'), tr('openedLogin'));
    }
  }
}

export async function connectClient(client: Client | InstallClient, verify = false) {
  if (!stdin.isTTY) throw new Error('Interactive setup requires a terminal.');
  setTuiContext({ step: null, total: null, language: currentLanguage() });
  loadInstallation();
  let selected: InstallClient;
  if (client === 'claude') {
    const picked = await choose('Claude client', ['Claude Code', 'Claude Desktop']);
    if (!picked) return;
    selected = picked === 'Claude Code' ? 'claude-code' : 'claude-desktop';
  } else selected = client;
  const connectivity = readState().connectivity;
  const publicOrigin = connectivity.origin ?? effectiveBaseUrl(process.env);
  const localOrigin = localBaseUrl();
  let selectedOrigin = publicOrigin;
  if (publicOrigin !== localOrigin && connectivity.method !== 'local') {
    const labelsByLanguage: Record<Language, [string, string, string]> = {
      en: ['Choose MCP endpoint', 'Public endpoint', 'This computer (localhost)'],
      pl: ['Wybierz endpoint MCP', 'Publiczny endpoint', 'Ten komputer (localhost)'],
      de: ['MCP-Endpunkt auswählen', 'Öffentlicher Endpunkt', 'Dieser Computer (localhost)'],
      fr: ['Choisir l’endpoint MCP', 'Endpoint public', 'Cet ordinateur (localhost)'],
      es: ['Elegir endpoint MCP', 'Endpoint público', 'Este equipo (localhost)'],
    };
    const labels = labelsByLanguage[currentLanguage()];
    const choice = await selectOption(
      [
        { value: publicOrigin, label: `${labels[1]} — ${publicOrigin}/mcp` },
        { value: localOrigin, label: `${labels[2]} — ${localOrigin}/mcp` },
      ],
      0,
      (cursor) =>
        menuPanel(
          labels[0],
          [`${labels[1]} — ${publicOrigin}/mcp`, `${labels[2]} — ${localOrigin}/mcp`],
          cursor,
        ),
    );
    if (!choice) return;
    selectedOrigin = choice;
  }
  const endpoint = `${selectedOrigin}/mcp`;
  if (verify) return verifyClient(selected, endpoint);
  return installClient(selected, endpoint);
}

export async function onboard() {
  if (!stdin.isTTY) throw new Error('Interactive setup requires a terminal.');
  const paths = loadInstallation();
  const language = currentLanguage();
  setTuiContext({ step: null, total: null, language });
  const words: Record<Language, Record<string, string>> = {
    en: {
      experimental: 'experimental',
      title: 'JamRelay · Management',
      intro: 'Choose an area. The description explains what the selected option does.',
      status: 'Server status',
      statusHelp: 'Check whether JamRelay and its database are ready.',
      'Inspect configuration and saved state for problems.':
        'Inspect configuration and saved state for problems.',
      'Create a backup or review saved backups.': 'Create a backup or review saved backups.',
      'Check the selected update channel and show guidance.':
        'Check the selected update channel and show guidance.',
      'Edit the saved installation settings.': 'Edit the saved installation settings.',
      'Return to the main menu.': 'Return to the main menu.',
      'List backups already saved by JamRelay.': 'List backups already saved by JamRelay.',
      'Copy the database and supported credential files into a new backup.':
        'Copy the database and supported credential files into a new backup.',
      'Return to maintenance.': 'Return to maintenance.',
      'App access permissions were saved.': 'App access permissions were saved.',
      music: 'Music services',
      musicHelp: 'Set up a music service or review saved account connections.',
      clients: 'AI apps (MCP)',
      clientsHelp: 'Connect an AI app, check its tools, or manage its access.',
      network: 'Network access',
      networkHelp: 'Configure local or public access for your MCP clients.',
      maintenance: 'Maintenance',
      maintenanceHelp: 'Open diagnostics, backups, update information or installation settings.',
      exit: 'Exit menu',
      exitHelp: 'Close the management menu and return to the terminal.',
      musicTitle: 'Music services',
      configureProvider: 'Set up or authorize a service',
      configureProviderHelp:
        'Save service app credentials; account authorization is a separate step.',
      listConnections: 'View saved connections',
      listConnectionsHelp:
        'Review saved account records; this does not confirm that a provider token is valid.',
      back: 'Back',
      clientsTitle: 'AI apps · MCP',
      configureClient: 'Connect an AI app',
      listClients: 'View registered apps',
      verifyClient: 'Verify sign-in and tools',
      permissions: 'Change app access',
      configureClientHelp:
        'Add JamRelay to an AI app and show its endpoint and setup instructions.',
      listClientsHelp:
        'See registered apps and whether sign-in and tool discovery have been verified.',
      verifyHelp: 'After signing in, ask the client to show JamRelay tools, then run this check.',
      permissionsHelp: 'Choose which music accounts and tools a connected app can use.',
      maintenanceTitle: 'Maintenance',
      diagnostics: 'Run diagnostics',
      backups: 'Backups',
      updates: 'Check for updates',
      settings: 'Installation settings',
      backupTitle: 'Backups',
      backupList: 'View saved backups',
      backupCreate: 'Create a backup now',
      chooseService: 'Choose a music service',
      chooseClient: 'Choose an AI app',
      verifyTitle: 'Choose the app to verify',
      generic: 'Other MCP-compatible app',
      plugin: 'Claude skills package (instructions only)',
      pluginHelp:
        'This optional ZIP contains instructions only; it does not connect Claude to JamRelay. Configure Claude Code or Claude Desktop as an MCP client for a real connection.',
      checking: 'Checking JamRelay…',
      retryUpdates: 'Check again now',
      retryUpdatesHelp: 'Request current update information again.',
      noConnections: 'No saved music connections were found.',
      noClients: 'No AI apps are registered yet.',
      noGrant: 'No active app access grants are available to edit.',
      noData: 'No saved items were found.',
      verified: 'Verified',
      notVerified: 'Not verified',
      noSetup:
        'Run jamrelay setup once to create the private installation configuration, then reopen this menu.',
      return: 'Press Enter to return to the menu',
      actionError:
        'This action could not be completed. Check the configuration or run diagnostics.',
      settingsSaved: 'Installation settings saved.',
      settingsLocked: 'No settings changed. Stop JamRelay before editing the installation.',
    },
    pl: {
      experimental: 'eksperymentalne',
      title: 'JamRelay · Zarządzanie',
      intro: 'Wybierz dział. Opis wyjaśnia, co zrobi zaznaczona opcja.',
      status: 'Stan serwera',
      statusHelp: 'Sprawdź, czy JamRelay i jego baza danych są gotowe.',
      'Inspect configuration and saved state for problems.':
        'Sprawdź konfigurację i zapisany stan pod kątem problemów.',
      'Create a backup or review saved backups.':
        'Utwórz kopię zapasową albo sprawdź zapisane kopie.',
      'Check the selected update channel and show guidance.':
        'Sprawdź wybrany kanał aktualizacji i wyświetl wskazówki.',
      'Edit the saved installation settings.': 'Zmień zapisane ustawienia instalacji.',
      'Return to the main menu.': 'Wróć do głównego menu.',
      'List backups already saved by JamRelay.': 'Wyświetl kopie zapisane przez JamRelay.',
      'Copy the database and supported credential files into a new backup.':
        'Skopiuj bazę danych i obsługiwane dane dostępowe do nowej kopii zapasowej.',
      'Return to maintenance.': 'Wróć do działu utrzymania.',
      'App access permissions were saved.': 'Zapisano uprawnienia aplikacji.',
      music: 'Usługi muzyczne',
      musicHelp: 'Skonfiguruj usługę muzyczną albo sprawdź zapisane połączenia kont.',
      clients: 'Aplikacje AI (MCP)',
      clientsHelp: 'Połącz aplikację AI, sprawdź jej narzędzia lub zmień uprawnienia.',
      network: 'Dostęp przez sieć',
      networkHelp: 'Skonfiguruj dostęp lokalny lub publiczny dla klientów MCP.',
      maintenance: 'Utrzymanie',
      maintenanceHelp:
        'Otwórz diagnostykę, kopie zapasowe, aktualizacje lub ustawienia instalacji.',
      exit: 'Zamknij menu',
      exitHelp: 'Zamknij menu zarządzania i wróć do terminala.',
      musicTitle: 'Usługi muzyczne',
      configureProvider: 'Skonfiguruj lub autoryzuj usługę',
      configureProviderHelp:
        'Zapisz dane aplikacji usługi. Autoryzacja konta jest osobnym krokiem.',
      listConnections: 'Pokaż zapisane połączenia',
      listConnectionsHelp:
        'Sprawdź zapisane rekordy; nie potwierdza to, że token nadal jest ważny.',
      back: 'Wstecz',
      clientsTitle: 'Aplikacje AI · MCP',
      configureClient: 'Połącz aplikację AI',
      listClients: 'Pokaż zarejestrowane aplikacje',
      verifyClient: 'Sprawdź logowanie i narzędzia',
      permissions: 'Zmień dostęp aplikacji',
      configureClientHelp:
        'Dodaj JamRelay do aplikacji AI i wyświetl adres oraz instrukcję konfiguracji.',
      listClientsHelp: 'Sprawdź aplikacje oraz stan logowania i wykrycia narzędzi.',
      verifyHelp:
        'Po zalogowaniu poproś klienta o pokazanie narzędzi JamRelay i uruchom tę kontrolę.',
      permissionsHelp: 'Wybierz konta muzyczne i narzędzia dostępne dla połączonej aplikacji.',
      maintenanceTitle: 'Utrzymanie',
      diagnostics: 'Uruchom diagnostykę',
      backups: 'Kopie zapasowe',
      updates: 'Sprawdź aktualizacje',
      settings: 'Ustawienia instalacji',
      backupTitle: 'Kopie zapasowe',
      backupList: 'Pokaż zapisane kopie',
      backupCreate: 'Utwórz kopię teraz',
      chooseService: 'Wybierz usługę muzyczną',
      chooseClient: 'Wybierz aplikację AI',
      verifyTitle: 'Wybierz aplikację do sprawdzenia',
      generic: 'Inna aplikacja zgodna z MCP',
      plugin: 'Pakiet Claude (same instrukcje)',
      pluginHelp:
        'Ten opcjonalny ZIP zawiera tylko instrukcje i nie łączy Claude z JamRelay. Do prawdziwego połączenia skonfiguruj Claude Code lub Claude Desktop jako klienta MCP.',
      checking: 'Sprawdzam JamRelay…',
      retryUpdates: 'Sprawdź ponownie teraz',
      retryUpdatesHelp: 'Ponownie pobierz bieżące informacje o aktualizacji.',
      noConnections: 'Nie znaleziono zapisanych połączeń muzycznych.',
      noClients: 'Nie ma jeszcze zarejestrowanych aplikacji AI.',
      noGrant: 'Brak aktywnych uprawnień aplikacji do zmiany.',
      noData: 'Nie znaleziono zapisanych elementów.',
      verified: 'Zweryfikowano',
      notVerified: 'Niezweryfikowano',
      noSetup:
        'Uruchom raz jamrelay setup, aby utworzyć prywatną konfigurację, a potem otwórz to menu ponownie.',
      return: 'Naciśnij Enter, aby wrócić do menu',
      actionError:
        'Nie udało się wykonać tej czynności. Sprawdź konfigurację lub uruchom diagnostykę.',
      settingsSaved: 'Zapisano ustawienia instalacji.',
      settingsLocked: 'Nie zmieniono ustawień. Zatrzymaj JamRelay przed edycją instalacji.',
    },
    de: {
      experimental: 'experimentell',
      title: 'JamRelay · Verwaltung',
      intro: 'Wähle einen Bereich. Die Beschreibung erklärt die markierte Option.',
      status: 'Serverstatus',
      statusHelp: 'Prüfe, ob JamRelay und die Datenbank bereit sind.',
      'Inspect configuration and saved state for problems.':
        'Konfiguration und gespeicherten Status auf Probleme prüfen.',
      'Create a backup or review saved backups.':
        'Sicherung erstellen oder gespeicherte Sicherungen ansehen.',
      'Check the selected update channel and show guidance.':
        'Release-Kanal prüfen und Update-Hinweise anzeigen.',
      'Edit the saved installation settings.':
        'Gespeicherte Installationseinstellungen bearbeiten.',
      'Return to the main menu.': 'Zum Hauptmenü zurückkehren.',
      'List backups already saved by JamRelay.': 'Von JamRelay gespeicherte Sicherungen auflisten.',
      'Copy the database and supported credential files into a new backup.':
        'Datenbank und unterstützte Zugangsdaten in eine neue Sicherung kopieren.',
      'Return to maintenance.': 'Zur Wartung zurückkehren.',
      'App access permissions were saved.': 'App-Berechtigungen gespeichert.',
      music: 'Musikdienste',
      musicHelp: 'Musikdienst einrichten oder gespeicherte Kontoverbindungen ansehen.',
      clients: 'KI-Apps (MCP)',
      clientsHelp: 'KI-App verbinden, Tools prüfen oder Berechtigungen ändern.',
      network: 'Netzwerkzugriff',
      networkHelp: 'Lokalen oder öffentlichen Zugriff für MCP-Clients einrichten.',
      maintenance: 'Wartung',
      maintenanceHelp: 'Diagnose, Sicherungen, Updates oder Installationseinstellungen öffnen.',
      exit: 'Menü schließen',
      exitHelp: 'Verwaltungsmenü schließen und zum Terminal zurückkehren.',
      musicTitle: 'Musikdienste',
      configureProvider: 'Dienst einrichten oder autorisieren',
      configureProviderHelp:
        'Zugangsdaten der Dienst-App speichern; die Kontoautorisierung erfolgt separat.',
      listConnections: 'Gespeicherte Verbindungen ansehen',
      listConnectionsHelp:
        'Gespeicherte Kontodatensätze prüfen; dies bestätigt nicht die Gültigkeit des Tokens.',
      back: 'Zurück',
      clientsTitle: 'KI-Apps · MCP',
      configureClient: 'KI-App verbinden',
      listClients: 'Registrierte Apps ansehen',
      verifyClient: 'Anmeldung und Tools prüfen',
      permissions: 'App-Zugriff ändern',
      configureClientHelp: 'JamRelay hinzufügen und Endpunkt sowie Einrichtungshinweise anzeigen.',
      listClientsHelp: 'Apps und den Status von Anmeldung und Tool-Erkennung prüfen.',
      verifyHelp:
        'Nach der Anmeldung im MCP-Client die JamRelay-Tools anfordern und diese Prüfung starten.',
      permissionsHelp: 'Musikkonten und Tools für eine verbundene App auswählen.',
      maintenanceTitle: 'Wartung',
      diagnostics: 'Diagnose ausführen',
      backups: 'Sicherungen',
      updates: 'Nach Updates suchen',
      settings: 'Installationseinstellungen',
      backupTitle: 'Sicherungen',
      backupList: 'Sicherungen ansehen',
      backupCreate: 'Jetzt Sicherung erstellen',
      chooseService: 'Musikdienst auswählen',
      chooseClient: 'KI-App auswählen',
      verifyTitle: 'App zur Prüfung auswählen',
      generic: 'Andere MCP-kompatible App',
      plugin: 'Claude-Skills-Paket (nur Anleitung)',
      pluginHelp:
        'Dieses optionale ZIP enthält nur Anleitungen und verbindet Claude nicht mit JamRelay. Für eine echte Verbindung Claude Code oder Desktop als MCP-Client einrichten.',
      checking: 'JamRelay wird geprüft…',
      retryUpdates: 'Jetzt erneut prüfen',
      retryUpdatesHelp: 'Aktuelle Update-Informationen erneut abrufen.',
      noConnections: 'Keine gespeicherten Musikverbindungen gefunden.',
      noClients: 'Noch keine KI-Apps registriert.',
      noGrant: 'Keine aktiven App-Berechtigungen zum Ändern.',
      noData: 'Keine gespeicherten Einträge gefunden.',
      verified: 'Verifiziert',
      notVerified: 'Nicht verifiziert',
      noSetup: 'Einmal jamrelay setup ausführen und danach dieses Menü erneut öffnen.',
      return: 'Enter drücken, um zum Menü zurückzukehren',
      actionError: 'Aktion fehlgeschlagen. Prüfe die Konfiguration oder führe die Diagnose aus.',
      settingsSaved: 'Installationseinstellungen gespeichert.',
      settingsLocked: 'Keine Einstellungen geändert. Stoppe JamRelay vor der Bearbeitung.',
    },
    fr: {
      experimental: 'expérimental',
      title: 'JamRelay · Gestion',
      intro: 'Choisissez une rubrique. La description explique l’option sélectionnée.',
      status: 'État du serveur',
      statusHelp: 'Vérifier que JamRelay et sa base de données sont prêts.',
      'Inspect configuration and saved state for problems.':
        'Examiner la configuration et l’état enregistré.',
      'Create a backup or review saved backups.':
        'Créer une sauvegarde ou consulter les sauvegardes existantes.',
      'Check the selected update channel and show guidance.':
        'Vérifier le canal choisi et afficher les instructions.',
      'Edit the saved installation settings.':
        'Modifier les paramètres enregistrés de l’installation.',
      'Return to the main menu.': 'Revenir au menu principal.',
      'List backups already saved by JamRelay.':
        'Lister les sauvegardes enregistrées par JamRelay.',
      'Copy the database and supported credential files into a new backup.':
        'Copier la base de données et les identifiants pris en charge dans une nouvelle sauvegarde.',
      'Return to maintenance.': 'Revenir à la maintenance.',
      'App access permissions were saved.': 'Les autorisations de l’application sont enregistrées.',
      music: 'Services musicaux',
      musicHelp: 'Configurer un service ou consulter les connexions enregistrées.',
      clients: 'Applications IA (MCP)',
      clientsHelp: 'Connecter une application, vérifier ses outils ou modifier ses accès.',
      network: 'Accès réseau',
      networkHelp: 'Configurer un accès local ou public pour les clients MCP.',
      maintenance: 'Maintenance',
      maintenanceHelp: 'Ouvrir les diagnostics, sauvegardes, mises à jour ou paramètres.',
      exit: 'Fermer le menu',
      exitHelp: 'Fermer le menu de gestion et revenir au terminal.',
      musicTitle: 'Services musicaux',
      configureProvider: 'Configurer ou autoriser un service',
      configureProviderHelp:
        'Enregistrer les identifiants du service ; l’autorisation du compte est séparée.',
      listConnections: 'Voir les connexions enregistrées',
      listConnectionsHelp:
        'Consulter les enregistrements ; cela ne confirme pas la validité du jeton.',
      back: 'Retour',
      clientsTitle: 'Applications IA · MCP',
      configureClient: 'Connecter une application IA',
      listClients: 'Voir les applications enregistrées',
      verifyClient: 'Vérifier la connexion et les outils',
      permissions: 'Modifier les accès',
      configureClientHelp: 'Ajouter JamRelay et afficher son adresse et les instructions.',
      listClientsHelp:
        'Consulter les applications et vérifier la connexion et la découverte des outils.',
      verifyHelp:
        'Après connexion, demandez les outils JamRelay dans le client MCP puis lancez cette vérification.',
      permissionsHelp: 'Choisir les comptes et outils accessibles à une application connectée.',
      maintenanceTitle: 'Maintenance',
      diagnostics: 'Lancer les diagnostics',
      backups: 'Sauvegardes',
      updates: 'Rechercher des mises à jour',
      settings: 'Paramètres d’installation',
      backupTitle: 'Sauvegardes',
      backupList: 'Voir les sauvegardes',
      backupCreate: 'Créer une sauvegarde',
      chooseService: 'Choisir un service musical',
      chooseClient: 'Choisir une application IA',
      verifyTitle: 'Choisir l’application à vérifier',
      generic: 'Autre application compatible MCP',
      plugin: 'Archive Claude (instructions seulement)',
      pluginHelp:
        'Cette archive facultative contient uniquement des instructions et ne connecte pas Claude à JamRelay. Configurez Claude Code ou Desktop comme client MCP.',
      checking: 'Vérification de JamRelay…',
      retryUpdates: 'Réessayer maintenant',
      retryUpdatesHelp: 'Demander à nouveau les informations actuelles de mise à jour.',
      noConnections: 'Aucune connexion musicale enregistrée.',
      noClients: 'Aucune application IA enregistrée.',
      noGrant: 'Aucun accès actif à modifier.',
      noData: 'Aucun élément enregistré.',
      verified: 'Vérifié',
      notVerified: 'Non vérifié',
      noSetup: 'Exécutez une fois jamrelay setup, puis rouvrez ce menu.',
      return: 'Appuyez sur Entrée pour revenir au menu',
      actionError: 'Action impossible. Vérifiez la configuration ou lancez les diagnostics.',
      settingsSaved: 'Paramètres enregistrés.',
      settingsLocked: 'Aucun paramètre modifié. Arrêtez JamRelay avant la modification.',
    },
    es: {
      experimental: 'experimental',
      title: 'JamRelay · Gestión',
      intro: 'Elige una sección. La descripción explica la opción seleccionada.',
      status: 'Estado del servidor',
      statusHelp: 'Comprobar si JamRelay y la base de datos están listos.',
      'Inspect configuration and saved state for problems.':
        'Revisar la configuración y el estado guardado.',
      'Create a backup or review saved backups.':
        'Crear una copia o consultar las copias guardadas.',
      'Check the selected update channel and show guidance.':
        'Comprobar el canal elegido y mostrar instrucciones.',
      'Edit the saved installation settings.': 'Editar los ajustes guardados de la instalación.',
      'Return to the main menu.': 'Volver al menú principal.',
      'List backups already saved by JamRelay.': 'Mostrar las copias guardadas por JamRelay.',
      'Copy the database and supported credential files into a new backup.':
        'Copiar la base de datos y credenciales compatibles en una copia nueva.',
      'Return to maintenance.': 'Volver a mantenimiento.',
      'App access permissions were saved.': 'Se guardaron los permisos de acceso de la aplicación.',
      music: 'Servicios de música',
      musicHelp: 'Configurar un servicio o consultar conexiones guardadas.',
      clients: 'Aplicaciones de IA (MCP)',
      clientsHelp: 'Conectar una aplicación, comprobar sus herramientas o cambiar permisos.',
      network: 'Acceso de red',
      networkHelp: 'Configurar acceso local o público para clientes MCP.',
      maintenance: 'Mantenimiento',
      maintenanceHelp: 'Abrir diagnósticos, copias, actualizaciones o ajustes.',
      exit: 'Cerrar menú',
      exitHelp: 'Cerrar el menú de gestión y volver al terminal.',
      musicTitle: 'Servicios de música',
      configureProvider: 'Configurar o autorizar un servicio',
      configureProviderHelp:
        'Guardar credenciales del servicio; autorizar la cuenta es un paso separado.',
      listConnections: 'Ver conexiones guardadas',
      listConnectionsHelp:
        'Consultar registros guardados; esto no confirma que el token siga siendo válido.',
      back: 'Volver',
      clientsTitle: 'Aplicaciones de IA · MCP',
      configureClient: 'Conectar una aplicación de IA',
      listClients: 'Ver aplicaciones registradas',
      verifyClient: 'Comprobar acceso y herramientas',
      permissions: 'Cambiar acceso de una aplicación',
      configureClientHelp: 'Añadir JamRelay y mostrar su dirección e instrucciones.',
      listClientsHelp: 'Consultar aplicaciones y el estado del acceso y las herramientas.',
      verifyHelp:
        'Tras iniciar sesión, pide las herramientas JamRelay al cliente MCP y ejecuta esta comprobación.',
      permissionsHelp:
        'Elegir las cuentas y herramientas disponibles para una aplicación conectada.',
      maintenanceTitle: 'Mantenimiento',
      diagnostics: 'Ejecutar diagnósticos',
      backups: 'Copias de seguridad',
      updates: 'Buscar actualizaciones',
      settings: 'Ajustes de instalación',
      backupTitle: 'Copias de seguridad',
      backupList: 'Ver copias guardadas',
      backupCreate: 'Crear una copia ahora',
      chooseService: 'Elige un servicio de música',
      chooseClient: 'Elige una aplicación de IA',
      verifyTitle: 'Elige la aplicación que quieres comprobar',
      generic: 'Otra aplicación compatible con MCP',
      plugin: 'Paquete Claude (solo instrucciones)',
      pluginHelp:
        'Este ZIP opcional solo contiene instrucciones y no conecta Claude con JamRelay. Configura Claude Code o Desktop como cliente MCP para conectarlo.',
      checking: 'Comprobando JamRelay…',
      retryUpdates: 'Comprobar de nuevo ahora',
      retryUpdatesHelp: 'Solicitar de nuevo la información actualizada.',
      noConnections: 'No hay conexiones de música guardadas.',
      noClients: 'Todavía no hay aplicaciones de IA registradas.',
      noGrant: 'No hay permisos activos que cambiar.',
      noData: 'No se encontraron elementos guardados.',
      verified: 'Verificado',
      notVerified: 'Sin verificar',
      noSetup: 'Ejecuta jamrelay setup una vez y vuelve a abrir este menú.',
      return: 'Pulsa Intro para volver al menú',
      actionError:
        'No se pudo completar la acción. Revisa la configuración o ejecuta los diagnósticos.',
      settingsSaved: 'Se guardaron los ajustes.',
      settingsLocked: 'No se cambió nada. Detén JamRelay antes de editar la instalación.',
    },
  };
  const w = (key: string) => words[language][key] ?? words.en[key] ?? key;
  const providers = Object.keys(providerRows) as Provider[];
  const clientOptions: { label: string; value: InstallClient }[] = [
    { label: 'Codex Desktop / CLI', value: 'codex' },
    { label: `Gemini CLI — ${w('experimental')}`, value: 'gemini-cli' },
    { label: 'Claude Code', value: 'claude-code' },
    { label: `Claude Desktop — ${w('experimental')}`, value: 'claude-desktop' },
    { label: `ChatGPT — ${w('experimental')}`, value: 'chatgpt' },
    { label: `Cursor — ${w('experimental')}`, value: 'cursor' },
    { label: `VS Code — ${w('experimental')}`, value: 'vscode' },
    { label: `${w('generic')} — ${w('experimental')}`, value: 'generic' },
  ];
  const section = <T extends string>(
    title: string,
    options: readonly { label: string; value: T }[],
    details: string[],
  ) => {
    clearPanelContext();
    return selectOption(options, 0, (cursor) =>
      menuPanel(
        title,
        options.map((option) => option.label),
        cursor,
        title === w('title')
          ? `${w('intro')}\n\n${details[cursor] ?? ''}`
          : (details[cursor] ?? ''),
      ),
    );
  };
  const pause = () => waitForEnter(w('return'));
  const operator = async (args: string[], title: string, loading?: string) => {
    const { runOperator } = await import('../operator.js');
    let output = '';
    const stop = loading ? showLoadingPanel(title, loading) : () => {};
    let code: number;
    try {
      code = await runOperator(args, (value) => {
        output = value;
      });
    } finally {
      stop();
    }
    showPanel(title, output || w('noData'));
    return { code, output };
  };
  const runInfo = async () => {
    const { runInformation } = await import('./information.js');
    const output: string[] = [];
    const oldLog = console.log,
      oldError = console.error;
    const stop = showLoadingPanel(w('updates'), w('checking'));
    let code: number;
    try {
      console.log = (...args: unknown[]) => output.push(args.map(String).join(' '));
      console.error = (...args: unknown[]) => output.push(args.map(String).join(' '));
      code = await runInformation(['update', 'check', '--refresh']);
    } finally {
      console.log = oldLog;
      console.error = oldError;
      stop();
    }
    showPanel(w('updates'), output.join('\n\n') || w('noData'));
    return code;
  };
  if (!existsSync(paths.config) && !process.env.TOKEN_ENCRYPTION_KEY) {
    showPanel(w('title'), w('noSetup'));
    await pause();
    return;
  }
  const connectivity = await import('./connectivity.js');
  const providerMenu = [
    { label: w('configureProvider'), value: 'configure' },
    { label: w('listConnections'), value: 'list' },
    { label: w('back'), value: 'back' },
  ] as const;
  const clientMenu = [
    { label: w('configureClient'), value: 'configure' },
    { label: w('listClients'), value: 'list' },
    { label: w('verifyClient'), value: 'verify' },
    { label: w('permissions'), value: 'permissions' },
    { label: w('back'), value: 'back' },
  ] as const;
  const maintenanceMenu = [
    { label: w('diagnostics'), value: 'diagnostics' },
    { label: w('backups'), value: 'backups' },
    { label: w('updates'), value: 'updates' },
    { label: w('settings'), value: 'settings' },
    { label: w('back'), value: 'back' },
  ] as const;
  const root = [
    { label: w('status'), value: 'status' },
    { label: w('music'), value: 'music' },
    { label: w('clients'), value: 'clients' },
    { label: w('network'), value: 'network' },
    { label: w('maintenance'), value: 'maintenance' },
    { label: w('exit'), value: 'exit' },
  ] as const;
  const rootDetails = [
    'statusHelp',
    'musicHelp',
    'clientsHelp',
    'networkHelp',
    'maintenanceHelp',
    'exitHelp',
  ].map(w);
  for (;;) {
    setTuiContext({ step: null, total: null, language });
    const action = await section(w('title'), root, rootDetails);
    if (!action || action === 'exit') break;
    try {
      if (action === 'status') {
        const { code, output } = await operator(['status', '--json'], w('status'), w('checking'));
        if (code === 0) {
          const state = JSON.parse(output) as {
            version: string;
            configuration: string;
            runtime: string;
            database: unknown;
            providers_configured: string[];
          };
          showPanel(
            w('status'),
            `${tr('Version', language)}: ${state.version}\n${tr('Configuration', language)}: ${state.configuration}\n${tr('Runtime', language)}: ${state.runtime}\n${tr('Database', language)}: ${JSON.stringify(state.database, null, 2)}\n${tr('Providers', language)}: ${state.providers_configured.join(', ') || tr('none', language)}`,
          );
        }
        await pause();
      } else if (action === 'music') {
        const choice = await section(w('musicTitle'), providerMenu, [
          w('configureProviderHelp'),
          w('listConnectionsHelp'),
          w('back'),
        ]);
        if (choice === 'list') {
          const { code, output } = await operator(['connections', 'list'], w('listConnections'));
          if (code === 0) {
            const records = JSON.parse(output) as { connection_id: string; created_at?: string }[];
            showPanel(
              w('listConnections'),
              records.length
                ? records
                    .map(
                      (record) =>
                        `${record.connection_id}${record.created_at ? ` · ${record.created_at}` : ''}`,
                    )
                    .join('\n')
                : w('noConnections'),
            );
          }
          await pause();
        } else if (choice === 'configure') {
          const options = [
            ...providers.map((provider) => ({
              label:
                provider === 'spotify'
                  ? providerRows[provider].name
                  : `${providerRows[provider].name} — ${w('experimental')}`,
              value: provider,
            })),
            { label: w('back'), value: 'back' as const },
          ];
          const provider = await section(
            w('chooseService'),
            options,
            options.map((_, index) =>
              index === options.length - 1 ? w('back') : w('configureProvider'),
            ),
          );
          if (provider && provider !== 'back') {
            await connectProvider(provider);
            await pause();
          }
        }
      } else if (action === 'clients') {
        const descriptions = [
          w('configureClientHelp'),
          w('listClientsHelp'),
          w('verifyHelp'),
          w('permissionsHelp'),
          w('back'),
        ];
        const choice = await section(w('clientsTitle'), clientMenu, descriptions);
        if (choice === 'configure') {
          const options = [
            ...clientOptions,
            { label: w('plugin'), value: 'claude-plugin' as const },
            { label: w('back'), value: 'back' as const },
          ];
          const selected = await section(
            w('chooseClient'),
            options,
            options.map((_, index) =>
              index === options.length - 2
                ? w('pluginHelp')
                : index === options.length - 1
                  ? w('back')
                  : w('configureClientHelp'),
            ),
          );
          if (selected === 'claude-plugin') {
            const packagePath = resolve('marketplace/jamrelay-claude-plugin-1.5.9.zip');
            showPanel(
              w('plugin'),
              `${existsSync(packagePath) ? packagePath : 'marketplace/jamrelay-claude-plugin-1.5.9.zip'}\n\n${w('pluginHelp')}`,
            );
            await pause();
          } else if (selected && selected !== 'back') {
            await connectClient(selected);
            await pause();
          }
        } else if (choice === 'list') {
          const { code, output } = await operator(['clients', 'list', '--json'], w('listClients'));
          if (code === 0) {
            const data = JSON.parse(output) as {
              clients?: { clientId: string; clientName: string; verified?: boolean }[];
            };
            const clients = data.clients ?? [];
            showPanel(
              w('listClients'),
              clients.length
                ? clients
                    .map(
                      (client) =>
                        `${client.clientName}\n  ${client.clientId}\n  ${client.verified ? w('verified') : w('notVerified')}`,
                    )
                    .join('\n\n')
                : w('noClients'),
            );
          }
          await pause();
        } else if (choice === 'verify') {
          const options = [...clientOptions, { label: w('back'), value: 'back' as const }];
          const selected = await section(
            w('verifyTitle'),
            options,
            options.map((_, index) => (index === options.length - 1 ? w('back') : w('verifyHelp'))),
          );
          if (selected && selected !== 'back') {
            await connectClient(selected, true);
            await pause();
          }
        } else if (choice === 'permissions') {
          const { code, output } = await operator(['clients', 'list', '--json'], w('listClients'));
          if (code === 0) {
            const data = JSON.parse(output) as {
              clients?: { clientId: string; clientName: string }[];
              grants?: { clientId: string; revoked: boolean }[];
            };
            const active = new Set(
              (data.grants ?? []).filter((grant) => !grant.revoked).map((grant) => grant.clientId),
            );
            const clients = (data.clients ?? []).filter((client) => active.has(client.clientId));
            if (!clients.length) {
              showPanel(w('permissions'), w('noGrant'));
              await pause();
            } else {
              const options = [
                ...clients.map((client) => ({
                  label: `${client.clientName} (${client.clientId})`,
                  value: client.clientId,
                })),
                { label: w('back'), value: 'back' as const },
              ];
              const selected = await section(
                w('permissions'),
                options,
                options.map((_, index) =>
                  index === options.length - 1 ? w('back') : w('permissionsHelp'),
                ),
              );
              if (selected && selected !== 'back') {
                const { code: editCode } = await operator(
                  ['clients', 'permissions', 'set', selected],
                  w('permissions'),
                );
                if (editCode === 0)
                  showPanel(w('permissions'), w('App access permissions were saved.'));
                await pause();
              }
            }
          }
        }
      } else if (action === 'network') {
        await connectivity.configureConnectivity();
        await pause();
      } else if (action === 'maintenance') {
        const details = [
          w('Inspect configuration and saved state for problems.'),
          w('Create a backup or review saved backups.'),
          w('Check the selected update channel and show guidance.'),
          w('Edit the saved installation settings.'),
          w('Return to the main menu.'),
        ];
        const choice = await section(w('maintenanceTitle'), maintenanceMenu, details);
        if (choice === 'diagnostics') {
          await operator(['diagnostics'], w('diagnostics'));
          await pause();
        } else if (choice === 'backups') {
          const backup = await section(
            w('backupTitle'),
            [
              { label: w('backupList'), value: 'list' },
              { label: w('backupCreate'), value: 'create' },
              { label: w('back'), value: 'back' },
            ],
            [
              w('List backups already saved by JamRelay.'),
              w('Copy the database and supported credential files into a new backup.'),
              w('Return to maintenance.'),
            ],
          );
          if (backup && backup !== 'back') {
            await operator(['backup', backup], w('backupTitle'));
            await pause();
          }
        } else if (choice === 'updates') {
          let retry = true;
          while (retry) {
            await runInfo();
            retry =
              (await section(
                w('updates'),
                [
                  { label: w('retryUpdates'), value: 'retry' },
                  { label: w('back'), value: 'back' },
                ],
                [w('retryUpdatesHelp'), w('Return to maintenance.')],
              )) === 'retry';
          }
        } else if (choice === 'settings') {
          const result = await (await import('../runtime/setup.js')).setup(false, true);
          showPanel(w('settings'), result === 'locked' ? w('settingsLocked') : w('settingsSaved'));
          await pause();
        }
      }
    } catch (error) {
      // Esc inside a submenu goes back to the menu it was opened from, not out of onboarding.
      if (error instanceof Error && error.message === 'Setup cancelled.') continue;
      const detail =
        action === 'network' && error instanceof Error
          ? error.message
              .replace(/(password|secret|token|api[_-]?key)(\s*[=:]\s*)\S+/gi, '$1$2[ukryto]')
              .replace(/(https?:\/\/)[^\s/@]+:[^\s/@]+@/gi, '$1[ukryto]@')
              .slice(0, 360)
          : '';
      showPanel(
        w(action === 'network' ? 'network' : 'maintenance'),
        detail ? `${w('actionError')}\n\n${detail}` : w('actionError'),
      );
      await pause();
    }
  }
}
export async function initialOnboarding() {
  return onboard();
}

export async function guidedConnect(kind: 'provider' | 'client', name: string, verify = false) {
  if (kind === 'provider') {
    if (!Object.hasOwn(providerRows, name)) throw new Error('Unknown provider');
    return connectProvider(name as Provider);
  }
  if (
    ![
      'chatgpt',
      'codex',
      'gemini-cli',
      'claude',
      'claude-code',
      'claude-desktop',
      'cursor',
      'vscode',
      'generic',
    ].includes(name)
  )
    throw new Error('Unknown client');
  return connectClient(name as Client | InstallClient, verify);
}
