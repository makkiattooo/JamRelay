import { openBrowser as openUrl } from './browser.js';
import { attachConnectorToNetwork, detectEnvironment } from './environment.js';
import { probeOrigin, probeOrigins, isLoopbackHttp } from './network-context.js';
import { resolve4, resolve6 } from 'node:dns/promises';
import { isIP } from 'node:net';
import { domainToASCII } from 'node:url';
import { isAbsolute, resolve as resolvePath } from 'node:path';
import { existsSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { isContainer } from './browser.js';
import { stdin, stdout } from 'node:process';
import { currentLanguage, type Language } from './i18n/index.js';
import { changeState, readState, type connectivityMethodSchema } from './state.js';
import {
  installationPaths,
  loadInstallation,
  lockInstallation,
  INSTALLATION_LOCKED_MESSAGE,
  queueSettingsRestart,
  readSettingsRestartResult,
  readSettings,
  saveSettings,
} from '../runtime/installation.js';
import {
  clearScreen,
  menuPanel,
  promptText,
  selectOption,
  setTuiContext,
  showPanel,
  showLoadingPanel,
  terminalLink,
} from './tui.js';
import { effectiveBaseUrl, localBaseUrl } from '../config.js';
import { APP_VERSION } from '../version.js';

type Method = (typeof connectivityMethodSchema)['options'][number];
type DomainMethod = 'cloudflare-tunnel' | 'direct-proxy' | 'existing-proxy';
type Checks = {
  dns: boolean | null;
  https: boolean | null;
  health: boolean;
  mcpProtected: boolean;
  oauthDiscovery: boolean;
  oauthRedirects: boolean | null;
};
const PORTAL = {
  cloudflare: 'https://dash.cloudflare.com/',
  cloudflareDns: 'https://dash.cloudflare.com/?to=%2F%3Aaccount%2F%3Azone%2Fdns%2Frecords',
  cloudflareTunnels: 'https://one.dash.cloudflare.com/',
  tailscale: 'https://tailscale.com/download',
  tailscaleAdmin: 'https://login.tailscale.com/admin/machines',
  ngrok: 'https://dashboard.ngrok.com/get-started/your-authtoken',
  ngrokInstall: 'https://ngrok.com/download',
  icann: 'https://lookup.icann.org/',
  caddy: 'https://caddyserver.com/docs/install',
  nginx: 'https://nginx.org/en/linux_packages.html',
};

const copy: Record<Language, Record<string, string>> = {
  en: {
    title: 'How will your AI assistant connect?',
    modeTitle: 'Choose a setup mode',
    networkSummary:
      'Quick configures this computer. Standard guides common choices. Advanced shows every network and proxy setting. Remote MCP requires public HTTPS.',
    standardMode: 'Standard — guided public tunnel, local, or private network setup',
    advancedMode: 'Advanced — VPS, reverse proxy, custom URLs, DNS and configuration files',
    vpsChoice: 'Public VPS / Dedicated Server — recommended for 24/7 remote MCP',
    tunnelChoice: 'Cloudflare Tunnel — public HTTPS without an inbound port',
    proxyChoice: 'Existing reverse proxy — Caddy, Nginx, Traefik or other',
    privateChoice: 'Private server / NAS — LAN, VPN or private tunnel',
    localhostChoice: 'Localhost — development and testing only',
    advancedChoice: 'Custom / Advanced configuration',
    domainBase: 'Enter your base domain (for example example.com)',
    hostnameChoice: 'Choose the public hostname',
    hostnameMcp: 'Use the mcp subdomain (only if your Cloudflare route uses it)',
    hostnameRoot: 'Use the root domain',
    hostnameCustom: 'Enter a custom subdomain',
    hostnameFull: 'Enter a full custom HTTPS origin',
    subdomainPrompt:
      'Enter the subdomain used by your public route; leave blank to use the root domain',
    domainPreview: 'Preview',
    customOrigin: 'Full public HTTPS origin (no path), for example https://music.example.com:8443',
    dnsProviderChoice: 'Where is your DNS managed?',
    dnsCloudflare: 'Cloudflare',
    dnsOvh: 'OVHcloud',
    dnsRoute53: 'Route 53',
    dnsOther: 'Other DNS provider',
    dnsUnknown: "I don't know",
    dnsManual: 'Configure DNS manually',
    local: 'This computer only (localhost)',
    localNetwork: 'Home or office LAN (private IP)',
    lanAddress: 'Private IPv4 or IPv6 address of the JamRelay host',
    invalidLan: 'Enter a private RFC1918 IPv4 address or a private IPv6 address.',
    lanHelp:
      'LAN access is available only to devices on your private network. JamRelay will bind to the LAN and use HTTP; do not port-forward this address to the internet. Spotify OAuth callbacks require an accepted loopback or public HTTPS callback, so LAN-only access may not authorize Spotify.',
    funnel: 'Tailscale Funnel (public HTTPS, no purchased domain)',
    ngrok: 'ngrok (public HTTPS, no purchased domain)',
    quick: 'Cloudflare Quick Tunnel (temporary testing)',
    own: 'I own a domain',
    hosting: 'Self-managed VPS or hosting',
    later: 'Configure later',
    back: 'Back',
    cancel: 'Cancel',
    localHelp:
      'A local MCP client on this computer can use loopback. Cloud-hosted assistants cannot reach localhost. No public exposure or third-party tunnel account is needed.',
    tailscaleHelp:
      'Funnel publishes your service to the public internet using your own stable *.ts.net hostname. It is different from private tailnet access. It requires a Tailscale account, enabled MagicDNS/HTTPS and Funnel policy approval. Tailscale currently lists Funnel on all plans; Funnel is beta, limited to TLS ports 443, 8443 and 10000, and has bandwidth limits.',
    ngrokHelp:
      'Use your own ngrok account. The free plan currently includes one assigned development domain, up to 3 online endpoints, 1 GB transfer and 20,000 HTTP/S requests, with a browser interstitial on HTTP/S. That interstitial may prevent an MCP/OAuth client from completing a request, so verify the actual client flow; use an eligible paid plan if you need to remove it or use a custom domain.',
    quickHelp:
      'Cloudflare Quick Tunnels need no Cloudflare account or domain, but create a random trycloudflare.com URL that changes and is for development only. Cloudflare documents no SSE support and no SLA; JamRelay will test the real MCP endpoint before marking it verified.',
    domainHelp:
      'Choose Cloudflare Tunnel, a direct public VPS with Caddy/Nginx, or a domain already routed by your reverse proxy. JamRelay cannot edit registrar, DNS, firewall or third-party accounts for you.',
    hostingHelp:
      'JamRelay provides software only. You supply a Linux host with a persistent Node process and storage. A public domain is optional; choose a tunnel or enter your existing HTTPS endpoint after hosting the server.',
    askDomain: 'Domain or subdomain (for example music.example.net)',
    invalidDomain: 'Enter a public domain name without https://, a path, port or wildcard.',
    dnsProvider: 'Who hosts authoritative DNS for this domain?',
    registrar: 'Where is the domain registered? (type unknown if unsure)',
    dnsExplain:
      'The registrar sells/renews the domain. The DNS provider publishes records for it; these can be different companies. Nameservers delegate DNS authority. DNS changes can take time to appear globally. Keep existing records and never replace an unrelated record.',
    domainMethod: 'Choose the setup for your domain',
    cf: 'Cloudflare Tunnel + custom hostname',
    manualProxy: 'Manual reverse-proxy setup',
    saveProxy: 'Save this snippet to a new file? Existing files are never overwritten.',
    proxyFilePath: 'New configuration file path',
    proxySaved: 'Proxy configuration saved',
    proxySaveFailed:
      'Could not save the proxy configuration. Check the parent directory and permissions.',
    dockerProxySave:
      'This wizard is inside Docker and cannot write to the host. Copy the configuration below to your host proxy.',
    nginxCertificate: 'Absolute path to the issued TLS certificate (full chain)',
    nginxPrivateKey: 'Absolute path to the matching TLS private key',
    dnsDashboard: 'Open Cloudflare DNS records for a selected zone',
    tunnelDashboard: 'Open Cloudflare Tunnels',
    cloudflareDashboardHelp:
      'Cloudflare publishes an official DNS Records dashboard link. It opens the selected account/zone when available; otherwise sign in and select the domain. JamRelay does not create or change DNS records.',
    cloudflareRouteTitle: 'Values for Cloudflare · Published application',
    cloudflareSubdomain: 'Subdomain',
    cloudflareDomain: 'Domain',
    cloudflareFullHostname: 'Full hostname',
    cloudflarePath: 'Path (leave empty)',
    cloudflareServiceUrl: 'Service URL',
    cloudflareRouteHelp:
      'In Cloudflare, open Networking → Tunnels → your connected tunnel → Routes → Add route → Published application. Enter the exact values below, leave Path empty, then save. JamRelay cannot create Cloudflare routes without access to your account.',
    cloudflareRouteAction: 'Cloudflare route',
    cloudflareRouteOpen: 'Open Cloudflare Tunnels to add the route',
    cloudflareRouteDone: 'I saved the route — verify this hostname now',
    cloudflareRouteLater: 'I will add the route later',
    cloudflareRoutePending:
      'JamRelay saved the hostname, but the Cloudflare route was not created. Add the Published application route using the values shown earlier, then return here and choose Verify saved endpoint.',
    direct: 'Public VPS + Caddy or Nginx',
    existing: 'Existing reverse proxy and domain',
    cloudflareIntro:
      'Add the domain as a site in your Cloudflare account. Cloudflare will scan existing DNS records; review/import them before changing nameservers. In the registrar account, replace the authoritative nameservers only with the exact pair Cloudflare shows for this zone. Do not change nameservers if the zone is already Active in Cloudflare.',
    nameserverOne:
      'Cloudflare nameserver 1 (exact value from the zone Overview; blank if already active)',
    nameserverTwo:
      'Cloudflare nameserver 2 (exact value from the zone Overview; blank if already active)',
    cloudflareSteps:
      'Before saving the route, confirm the selected tunnel shows Connected. This step does not install or start cloudflared.',
    tunnelUuid:
      'Actual Cloudflare Tunnel UUID (copy from Networking → Tunnels; blank to use dashboard auto-DNS)',
    dockerNetwork: 'Where will cloudflared or the reverse proxy run?',
    host: 'On the host',
    sameDocker: 'In the same Docker network as JamRelay',
    restartTitle: 'Applying public address',
    restartApplying: 'Saving the address and restarting the JamRelay container…',
    restartChecking: 'Waiting for JamRelay to become available again…',
    restartNoAck:
      'The running container did not accept the configuration change. Check that it uses the same /data volume.',
    restartFailed:
      'The configuration was saved, but JamRelay did not become healthy after restart. Check the container logs.',
    hostOrigin: 'Host-side proxy/tunnel origin',
    dockerOrigin: 'Same-network container origin',
    caddyConfig:
      'Caddyfile (Caddy obtains and renews public HTTPS certificates automatically when DNS and ports are ready)',
    nginxConfig:
      'Nginx site configuration (install a certificate with Certbot or your existing ACME tooling)',
    caddyPorts:
      'Caddy needs public inbound TCP ports 80 and 443 for normal ACME validation and HTTPS. Do not open ports automatically; configure your provider firewall/router yourself. A/AAAA must point to this VPS, and stale AAAA records can break validation.',
    nginxPorts:
      'Nginx needs public inbound TCP 443. For HTTP-01 certificate issuance it also needs TCP 80; use Certbot or your existing ACME process. JamRelay will not change firewall rules.',
    publicIp:
      'Public IPv4 address of the VPS (actual address only; leave blank if using IPv6 only)',
    publicIpv6: 'Public IPv6 address of the VPS (optional)',
    cnameTarget: 'Exact current CNAME target for this hostname, if already configured (optional)',
    existingSteps:
      'Confirm that your existing proxy routes this hostname to JamRelay, preserves the Host header and X-Forwarded-Proto, supports long-lived HTTP requests, and terminates HTTPS with a valid certificate. Do not turn on TRUST_PROXY unless this proxy is controlled by you.',
    continue: 'Continue to endpoint verification',
    continueLater: 'Save progress and continue later',
    enterOrigin:
      'Enter the HTTPS origin shown by the tunnel/proxy (for example https://music.example.net)',
    invalidOrigin: 'Enter an https:// origin with a valid hostname and no path, query or fragment.',
    proposed: 'Proposed DNS record',
    name: 'Name',
    type: 'Type',
    value: 'Value',
    proxyStatus: 'Proxy status',
    proxyAutomatic: 'Proxied by Cloudflare Tunnel',
    proxyProvider: 'Set per DNS/proxy provider',
    noIp: 'No IP address was supplied, so no A/AAAA value is guessed. Obtain the public address from your hosting provider.',
    cfNameServers:
      'At the registrar, set both Cloudflare nameservers from the Cloudflare zone. Keep the other DNS records intact. Wait until Cloudflare shows Active; DNS propagation may take minutes or longer.',
    directDns:
      'At the DNS provider, add the record shown. Use A for IPv4 and AAAA for IPv6; add both only when the server really accepts traffic over both. A CNAME points a hostname to another hostname and cannot be used at the zone apex. Do not leave an AAAA record pointing to an unreachable address.',
    errors:
      'Common recovery: confirm the domain spelling and authoritative nameservers; query public DNS; remove only stale records you own; check VPS security-group/router ports without disabling the firewall; wait for DNS/TLS issuance; confirm the tunnel process is online; check that Docker proxy networking uses the host-published port or shared service name; update provider redirect URLs after the origin changes. If your ISP uses CGNAT, use a tunnel or public VPS instead of port forwarding.',
    checkTitle: 'Checking DNS, HTTPS, server health and MCP protection',
    dnsOk: 'Public DNS resolves',
    dnsBad: 'Public DNS does not resolve',
    httpsOk: 'HTTPS and certificate verified',
    httpsBad: 'HTTPS or TLS verification failed',
    healthOk: 'JamRelay /health responds',
    healthBad: 'JamRelay /health did not respond',
    mcpOk: 'MCP endpoint is reachable and requires authentication',
    mcpBad: 'MCP endpoint did not return the expected protected response',
    oauthDiscoveryOk: 'OAuth authorization discovery matches the public origin',
    oauthDiscoveryBad: 'OAuth authorization discovery is unavailable or has a mismatched issuer',
    oauthRedirectsOk: 'Configured provider callback URLs match this public origin',
    oauthRedirectsBad: 'Provider callback URLs need updating in JamRelay and provider dashboards',
    failedChecks: 'Checks that need attention',
    oauthNotApplicable: 'Provider callback URLs',
    statusVerified: 'Verified',
    statusLocal: 'Ready on this computer',
    statusFailed: 'Failed',
    statusPending: 'Pending',
    statusNotChecked: 'Not checked',
    statusNotApplicable: 'Not applicable',
    redirectChanged:
      'Changing the public origin affects provider OAuth callback URLs. Update the saved redirect URIs in each provider dashboard before reconnecting.',
    redirectCancelled: 'The existing public origin and provider callbacks were kept.',
    ready: 'Secure endpoint verified',
    pending: 'Not verified yet. Configuration remains resumable.',
    callbacks:
      'Provider redirect URLs for this origin (update each developer application before authorizing):',
    spotify: 'Spotify callback',
    soundcloud: 'SoundCloud callback',
    youtube: 'YouTube callback',
    apple: 'Apple Music uses MusicKit tokens, not this OAuth callback.',
    recovery:
      'The failed checks are listed below. Fix the matching DNS, Cloudflare route, certificate or provider callback, then choose Verify again.',
    saved: 'Connectivity progress saved.',
    noTty:
      'Connectivity setup needs an interactive terminal. Run jamrelay connectivity in a terminal.',
    mcpEndpoint: 'MCP endpoint',
    localReady:
      'Local endpoint is ready for a same-computer MCP client. Cloud-hosted clients cannot access loopback.',
    status: 'Connectivity status',
    unknown: 'Not configured',
    method: 'Method',
    origin: 'Origin',
    lastCheck: 'Last verified',
    offerBrowser: 'Open the official setup page now?',
    open: 'Open browser',
    show: 'Show URL only',
    ownerCosts:
      'You provide and pay for your own registrar, hosting and third-party accounts. JamRelay does not create these accounts or change their settings.',
    cfDomain:
      'Cloudflare must host the DNS zone for a public-hostname tunnel. If your domain uses another DNS provider, choose direct VPS/reverse proxy or move the authoritative nameservers yourself after reviewing existing records.',
    advancedWarningTitle: 'Advanced setup is experimental',
    advancedWarning:
      'Advanced setup is still in development and may not work yet. Custom domains are only checked with Cloudflare, provider integrations only with Spotify, and other domains, providers, MCP clients and models may behave unpredictably. Continue only if you can check and debug the result yourself.',
    cfCreateTitle: 'Create the Cloudflare tunnel',
    cfCreateBody:
      'In Cloudflare Zero Trust open Networks → Tunnels → Create a tunnel → Cloudflared and give it a name such as jamrelay. Cloudflare then shows an install command containing a secret token. Run that command on this computer yourself, as Administrator. Do not paste the token into JamRelay. Wait until the tunnel shows Connected, then continue.',
    cfPublishTitle: 'Publish the application',
    cfPublishBody:
      'In the tunnel, open Public Hostname → Add a public hostname and enter the values below. Service type: HTTP. Cloudflare creates the DNS record automatically, so you do not need to add a CNAME yourself.',
    connectedTitle: 'Connection is working',
    connectedRecheck: 'Check again',
    connectedChange: 'Change connection method',
  },
  pl: {
    title: 'Jak asystent AI połączy się z JamRelay?',
    modeTitle: 'Wybierz tryb konfiguracji',
    networkSummary:
      'Szybki konfiguruje tylko ten komputer. Standardowy prowadzi przez typowe opcje. Zaawansowany pokazuje wszystkie ustawienia sieci i proxy. Zdalny MCP wymaga publicznego HTTPS.',
    standardMode: 'Standardowy — proste prowadzenie: publiczny tunel, komputer lub sieć prywatna',
    advancedMode: 'Zaawansowany — VPS, reverse proxy, własne adresy, DNS i pliki konfiguracji',
    vpsChoice: 'Publiczny VPS / serwer dedykowany — zalecany dla dostępu MCP 24/7',
    tunnelChoice: 'Cloudflare Tunnel — publiczny HTTPS bez otwierania portu przychodzącego',
    proxyChoice: 'Istniejący reverse proxy — Caddy, Nginx, Traefik lub inny',
    privateChoice: 'Serwer prywatny / NAS — LAN, VPN lub prywatny tunel',
    localhostChoice: 'Localhost — tylko programowanie i testy',
    advancedChoice: 'Własna / zaawansowana konfiguracja',
    domainBase: 'Podaj domenę główną (np. example.pl)',
    hostnameChoice: 'Wybierz publiczną nazwę hosta',
    hostnameMcp: 'Użyj subdomeny mcp tylko wtedy, gdy taką nazwę ma trasa Cloudflare',
    hostnameRoot: 'Użyj domeny głównej',
    hostnameCustom: 'Wpisz własną subdomenę',
    hostnameFull: 'Wpisz pełny własny adres HTTPS',
    subdomainPrompt:
      'Wpisz subdomenę z publicznej trasy; zostaw puste pole, aby użyć domeny głównej',
    domainPreview: 'Podgląd',
    customOrigin: 'Pełny publiczny adres HTTPS bez ścieżki, np. https://muzyka.example.pl:8443',
    dnsProviderChoice: 'Gdzie zarządzasz DNS tej domeny?',
    dnsCloudflare: 'Cloudflare',
    dnsOvh: 'OVHcloud',
    dnsRoute53: 'Route 53',
    dnsOther: 'Inny dostawca DNS',
    dnsUnknown: 'Nie wiem',
    dnsManual: 'Skonfiguruję DNS ręcznie',
    local: 'Tylko ten komputer (localhost)',
    localNetwork: 'Domowa lub firmowa sieć LAN (prywatny adres IP)',
    lanAddress: 'Prywatny adres IPv4 lub IPv6 hosta JamRelay',
    invalidLan: 'Wpisz prywatny adres IPv4 z zakresu RFC1918 albo prywatny adres IPv6.',
    lanHelp:
      'Dostęp LAN działa tylko na urządzeniach w sieci prywatnej. JamRelay nasłuchuje w sieci LAN przez HTTP; nie przekierowuj tego adresu do Internetu. Spotify wymaga zaakceptowanego callbacku loopback lub publicznego HTTPS, więc sam dostęp LAN może nie wystarczyć do autoryzacji Spotify.',
    funnel: 'Tailscale Funnel (publiczne HTTPS bez kupionej domeny)',
    ngrok: 'ngrok (publiczne HTTPS bez kupionej domeny)',
    quick: 'Cloudflare Quick Tunnel (tymczasowe testy)',
    own: 'Mam własną domenę',
    hosting: 'Własny VPS lub hosting',
    later: 'Skonfiguruj później',
    back: 'Wstecz',
    cancel: 'Anuluj',
    localHelp:
      'Lokalny klient MCP na tym komputerze może użyć loopback. Asystenci działający w chmurze nie mają dostępu do localhost. Nie wystawiasz usługi publicznie i nie potrzebujesz konta u operatora tunelu.',
    tailscaleHelp:
      'Funnel publikuje usługę w Internecie pod stabilną nazwą *.ts.net na Twoim koncie. To publiczny dostęp, odrębny od prywatnej sieci tailnet. Wymaga konta Tailscale, włączonych MagicDNS/HTTPS i zgody w polityce Funnel. Tailscale podaje Funnel dla wszystkich planów; funkcja jest beta, używa portów TLS 443, 8443 lub 10000 i ma limity przepustowości.',
    ngrokHelp:
      'Użyj własnego konta ngrok. Darmowy plan obejmuje obecnie jedną przydzieloną domenę deweloperską, do 3 aktywnych endpointów, 1 GB transferu i 20 000 żądań HTTP/S; pokazuje też stronę pośrednią w przeglądarce. Może ona przeszkodzić klientowi MCP/OAuth, więc sprawdź rzeczywiste połączenie. Plan płatny usuwa to ograniczenie i umożliwia własną domenę.',
    quickHelp:
      'Quick Tunnel nie wymaga konta Cloudflare ani domeny, ale tworzy losowy adres trycloudflare.com, który się zmienia. To rozwiązanie do testów. Cloudflare nie gwarantuje dostępności i nie obsługuje SSE na Quick Tunnel; JamRelay sprawdzi rzeczywisty endpoint MCP przed oznaczeniem go jako gotowego.',
    domainHelp:
      'Wybierz Cloudflare Tunnel, publiczny VPS z Caddy/Nginx albo domenę już skierowaną przez Twój reverse proxy. JamRelay nie zmienia rejestratora, DNS, zapory ani kont zewnętrznych.',
    hostingHelp:
      'JamRelay dostarcza oprogramowanie. Potrzebujesz własnego hosta Linux z trwałym procesem Node i miejscem na dane. Domena publiczna jest opcjonalna: możesz wybrać tunel albo podać używany już adres HTTPS.',
    askDomain: 'Domena lub subdomena (np. muzyka.example.pl)',
    invalidDomain: 'Wpisz publiczną domenę bez https://, ścieżki, portu ani gwiazdki.',
    dnsProvider: 'Kto obsługuje autorytatywny DNS tej domeny?',
    registrar: 'U kogo zarejestrowano domenę? (wpisz nie wiem, jeśli nie masz pewności)',
    dnsExplain:
      'Rejestrator sprzedaje i odnawia domenę. Dostawca DNS publikuje jej rekordy; to mogą być różne firmy. Serwery nazw wskazują, kto zarządza DNS. Zmiany mogą rozchodzić się w Internecie przez pewien czas. Zachowaj istniejące rekordy i nie zastępuj cudzych wpisów.',
    domainMethod: 'Wybierz sposób skonfigurowania domeny',
    cf: 'Cloudflare Tunnel + własna nazwa hosta',
    dnsDashboard: 'Otwórz rekordy DNS wybranej strefy Cloudflare',
    tunnelDashboard: 'Otwórz Cloudflare Tunnels',
    cloudflareDashboardHelp:
      'Cloudflare udostępnia oficjalny odnośnik do rekordów DNS. Otworzy wybrane konto/strefę, jeśli są dostępne; w przeciwnym razie zaloguj się i wybierz domenę. JamRelay nie tworzy ani nie zmienia rekordów DNS.',
    cloudflareRouteTitle: 'Wartości do Cloudflare · Published application',
    cloudflareSubdomain: 'Subdomena',
    cloudflareDomain: 'Domena',
    cloudflareFullHostname: 'Pełna nazwa hosta',
    cloudflarePath: 'Ścieżka (zostaw puste)',
    cloudflareServiceUrl: 'Adres usługi',
    cloudflareRouteHelp:
      'W Cloudflare otwórz Networking → Tunnels → wybrany połączony tunel → Routes → Add route → Published application. Wpisz dokładnie wartości poniżej, zostaw Path puste i zapisz trasę. JamRelay nie tworzy tras Cloudflare bez dostępu do Twojego konta.',
    cloudflareRouteAction: 'Trasa Cloudflare',
    cloudflareRouteOpen: 'Otwórz Cloudflare Tunnels, aby dodać trasę',
    cloudflareRouteDone: 'Trasa zapisana — sprawdź teraz ten adres',
    cloudflareRouteLater: 'Dodam trasę później',
    cloudflareRoutePending:
      'JamRelay zapisał nazwę hosta, ale trasa Cloudflare nie została utworzona. Dodaj Published application z pokazanymi wcześniej wartościami, wróć tutaj i wybierz weryfikację zapisanego endpointu.',
    direct: 'Publiczny VPS + Caddy lub Nginx',
    existing: 'Istniejący reverse proxy i domena',
    cloudflareIntro:
      'Dodaj domenę jako witrynę na swoim koncie Cloudflare. Cloudflare przeskanuje istniejące rekordy — sprawdź je lub zaimportuj przed zmianą serwerów nazw. U rejestratora zastąp serwery nazw wyłącznie dokładną parą podaną w strefie Cloudflare. Nie zmieniaj ich, jeśli strefa ma już status Active.',
    nameserverOne:
      'Serwer nazw Cloudflare 1 (dokładna wartość z Overview; puste, jeśli strefa jest aktywna)',
    nameserverTwo:
      'Serwer nazw Cloudflare 2 (dokładna wartość z Overview; puste, jeśli strefa jest aktywna)',
    cloudflareSteps:
      'Przed zapisaniem trasy sprawdź, czy wybrany tunel ma status Connected. Ten krok nie instaluje ani nie uruchamia cloudflared.',
    tunnelUuid:
      'Aktualny UUID tunelu Cloudflare (skopiuj z Networking → Tunnels; puste, aby użyć automatycznego DNS w panelu)',
    dockerNetwork: 'Gdzie będzie działać cloudflared lub reverse proxy?',
    host: 'Na hoście',
    sameDocker: 'W tej samej sieci Docker co JamRelay',
    hostOrigin: 'Adres źródłowy dla programu na hoście',
    dockerOrigin: 'Adres źródłowy dla kontenera w tej samej sieci',
    restartTitle: 'Zmieniam publiczny adres',
    restartApplying: 'Zapisuję adres i ponownie uruchamiam kontener JamRelay…',
    restartChecking: 'Czekam, aż JamRelay ponownie będzie dostępny…',
    restartNoAck:
      'Działający kontener nie odebrał zmiany. Sprawdź, czy używa tego samego woluminu /data.',
    restartFailed:
      'Zapisano konfigurację, ale JamRelay nie wrócił do zdrowego stanu. Sprawdź logi kontenera.',
    caddyConfig:
      'Caddyfile (Caddy automatycznie uzyska i odnowi certyfikat HTTPS po skonfigurowaniu DNS i portów)',
    nginxConfig:
      'Konfiguracja witryny Nginx (certyfikat uzyskaj przez Certbot lub własny proces ACME)',
    caddyPorts:
      'Caddy potrzebuje publicznie dostępnych portów TCP 80 i 443 do standardowej walidacji ACME i HTTPS. Nie otwieramy portów automatycznie — skonfiguruj zaporę/router u dostawcy. A/AAAA muszą wskazywać VPS; nieaktualny AAAA może uniemożliwić walidację.',
    nginxPorts:
      'Nginx potrzebuje publicznego TCP 443. Do uzyskania certyfikatu metodą HTTP-01 potrzebny jest też TCP 80. Użyj Certbota lub własnego ACME. JamRelay nie zmienia reguł zapory.',
    publicIp:
      'Publiczny adres IPv4 VPS (tylko rzeczywisty adres; puste, jeśli używasz wyłącznie IPv6)',
    publicIpv6: 'Publiczny adres IPv6 VPS (opcjonalnie)',
    cnameTarget: 'Dokładny, już skonfigurowany cel CNAME tej nazwy (opcjonalnie)',
    existingSteps:
      'Sprawdź, czy reverse proxy kieruje tę nazwę do JamRelay, zachowuje Host i X-Forwarded-Proto, obsługuje długie żądania HTTP oraz kończy TLS ważnym certyfikatem. Włączaj TRUST_PROXY tylko dla proxy, które kontrolujesz.',
    continue: 'Przejdź do weryfikacji endpointu',
    continueLater: 'Zapisz postęp i wróć później',
    enterOrigin: 'Wpisz adres HTTPS tunelu/proxy (np. https://muzyka.example.pl)',
    invalidOrigin: 'Wpisz adres https:// z poprawnym hostem, bez ścieżki, zapytania i fragmentu.',
    proposed: 'Proponowany rekord DNS',
    name: 'Nazwa',
    type: 'Typ',
    value: 'Wartość',
    proxyStatus: 'Proxy',
    proxyAutomatic: 'Proxy w Cloudflare Tunnel',
    proxyProvider: 'Ustaw według dostawcy DNS/proxy',
    noIp: 'Nie podano adresu IP, więc nie zgadujemy wartości A/AAAA. Sprawdź publiczny adres u dostawcy hostingu.',
    cfNameServers:
      'U rejestratora ustaw oba serwery nazw z panelu Cloudflare. Zachowaj pozostałe rekordy DNS. Poczekaj, aż Cloudflare pokaże Active; propagacja może potrwać kilka minut lub dłużej.',
    directDns:
      'U dostawcy DNS dodaj pokazany rekord. A służy do IPv4, AAAA do IPv6; dodaj oba tylko wtedy, gdy serwer rzeczywiście przyjmuje ruch na obu. CNAME kieruje nazwę na inną nazwę i nie działa dla wierzchołka strefy. Usuń tylko własny AAAA wskazujący na niedostępny adres.',
    errors:
      'Typowe naprawy: sprawdź pisownię domeny i autorytatywne serwery nazw; odczytaj publiczny DNS; usuń wyłącznie własne, nieaktualne rekordy; sprawdź reguły zapory VPS/routera bez jej wyłączania; poczekaj na DNS i certyfikat; sprawdź, czy tunel działa; dla Dockera użyj portu wystawionego na hoście albo nazwy usługi we wspólnej sieci; po zmianie adresu zaktualizuj callbacki w panelach dostawców. Przy CGNAT użyj tunelu lub publicznego VPS zamiast przekierowania portów.',
    checkTitle: 'Sprawdzam DNS, HTTPS, zdrowie serwera i ochronę MCP',
    dnsOk: 'Publiczny DNS działa',
    dnsBad: 'Publiczny DNS nie rozwiązuje nazwy',
    httpsOk: 'HTTPS i certyfikat są poprawne',
    httpsBad: 'Błąd HTTPS lub certyfikatu TLS',
    healthOk: 'JamRelay odpowiada na /health',
    healthBad: 'Brak odpowiedzi JamRelay na /health',
    mcpOk: 'Endpoint MCP jest dostępny i wymaga uwierzytelnienia',
    mcpBad: 'Endpoint MCP nie zwrócił oczekiwanej odpowiedzi chronionej',
    oauthDiscoveryOk: 'Odkrywanie OAuth odpowiada publicznemu adresowi',
    oauthDiscoveryBad: 'Odkrywanie OAuth jest niedostępne lub ma inny adres issuer',
    oauthRedirectsOk: 'Adresy callbacku dostawców pasują do publicznego adresu',
    oauthRedirectsBad: 'Adresy callbacku wymagają aktualizacji w JamRelay i panelach dostawców',
    failedChecks: 'Sprawdzenia wymagające poprawy',
    oauthNotApplicable: 'Callbacki dostawców',
    statusVerified: 'Zweryfikowano',
    statusLocal: 'Działa na tym komputerze',
    statusFailed: 'Niepowodzenie',
    statusPending: 'Wymaga dokończenia',
    statusNotChecked: 'Nie sprawdzono',
    statusNotApplicable: 'Nie dotyczy',
    redirectChanged:
      'Zmiana publicznego adresu wpływa na callbacki OAuth dostawców. Przed ponownym połączeniem zaktualizuj zapisane adresy zwrotne w panelach dostawców.',
    redirectCancelled: 'Zachowano dotychczasowy publiczny adres i callbacki dostawców.',
    ready: 'Bezpieczny endpoint zweryfikowany',
    pending: 'Jeszcze niezweryfikowany. Możesz wznowić konfigurację później.',
    callbacks:
      'Adresy przekierowania dostawców dla tej domeny (zaktualizuj każdą aplikację przed autoryzacją):',
    spotify: 'Callback Spotify',
    soundcloud: 'Callback SoundCloud',
    youtube: 'Callback YouTube',
    apple: 'Apple Music używa tokenów MusicKit, a nie tego callbacku OAuth.',
    recovery:
      'Poniżej są sprawdzenia, które nie przeszły. Popraw wskazany DNS, trasę Cloudflare, certyfikat lub callback dostawcy, a potem wybierz ponowną weryfikację.',
    saved: 'Zapisano postęp konfiguracji.',
    noTty: 'Konfiguracja łączności wymaga terminala. Uruchom jamrelay connectivity w terminalu.',
    mcpEndpoint: 'Endpoint MCP',
    localReady:
      'Lokalny endpoint jest gotowy dla klienta MCP na tym samym komputerze. Asystent chmurowy nie ma dostępu do loopback.',
    status: 'Stan łączności',
    unknown: 'Nie skonfigurowano',
    method: 'Metoda',
    origin: 'Adres',
    lastCheck: 'Ostatnia weryfikacja',
    offerBrowser: 'Otworzyć oficjalną stronę konfiguracji?',
    open: 'Otwórz przeglądarkę',
    show: 'Pokaż tylko adres',
    ownerCosts:
      'Zapewniasz i opłacasz własnego rejestratora, hosting i konta zewnętrzne. JamRelay ich nie zakłada ani nie zmienia ich ustawień.',
    cfDomain:
      'Tunel z publiczną nazwą hosta wymaga strefy DNS obsługiwanej przez Cloudflare. Jeśli domenę obsługuje ktoś inny, wybierz VPS/reverse proxy lub samodzielnie przenieś autorytatywne serwery nazw po sprawdzeniu obecnych rekordów.',
    manualProxy: 'Ręczna konfiguracja reverse proxy',
    saveProxy: 'Zapisać ten fragment do nowego pliku? Istniejące pliki nigdy nie są nadpisywane.',
    proxyFilePath: 'Ścieżka nowego pliku konfiguracji',
    proxySaved: 'Zapisano konfigurację proxy',
    proxySaveFailed:
      'Nie udało się zapisać konfiguracji proxy. Sprawdź katalog nadrzędny i uprawnienia.',
    dockerProxySave:
      'Kreator działa w Dockerze i nie może zapisać pliku na hoście. Skopiuj konfigurację poniżej do proxy na hoście.',
    nginxCertificate: 'Bezwzględna ścieżka do wydanego certyfikatu TLS (pełny łańcuch)',
    nginxPrivateKey: 'Bezwzględna ścieżka do pasującego klucza prywatnego TLS',
    advancedWarningTitle: 'Konfiguracja zaawansowana jest eksperymentalna',
    advancedWarning:
      'Konfiguracja zaawansowana jest nadal rozwijana i może jeszcze nie działać. Własne domeny sprawdzamy tylko z Cloudflare, integracje dostawców tylko ze Spotify, a inne domeny, dostawcy, klienci i modele MCP mogą działać nieprzewidywalnie. Kontynuuj tylko, jeśli potrafisz sam sprawdzić i naprawić wynik.',
    cfCreateTitle: 'Utwórz tunel Cloudflare',
    cfCreateBody:
      'W Cloudflare Zero Trust otwórz Networks → Tunnels → Create a tunnel → Cloudflared i nadaj nazwę, np. jamrelay. Cloudflare pokaże polecenie instalacji z sekretnym tokenem. Uruchom je samodzielnie na tym komputerze jako administrator. Nie wklejaj tokenu do JamRelay. Poczekaj, aż tunel pokaże status Connected, i przejdź dalej.',
    cfPublishTitle: 'Opublikuj aplikację',
    cfPublishBody:
      'W tunelu otwórz Public Hostname → Add a public hostname i wpisz poniższe wartości. Typ usługi: HTTP. Cloudflare sam utworzy rekord DNS, więc nie musisz dodawać CNAME ręcznie.',
    connectedTitle: 'Połączenie działa',
    connectedRecheck: 'Sprawdź ponownie',
    connectedChange: 'Zmień sposób połączenia',
  },
  de: {
    title: 'Wie verbindet sich dein KI-Assistent?',
    modeTitle: 'Einrichtungsmodus auswählen',
    networkSummary:
      'Schnell richtet nur diesen Computer ein. Standard führt durch gängige Optionen. Erweitert zeigt alle Netzwerk- und Proxy-Einstellungen. Entferntes MCP benötigt öffentliches HTTPS.',
    standardMode: 'Standard — geführte Einrichtung für Tunnel, Computer oder privates Netzwerk',
    advancedMode: 'Erweitert — VPS, Reverse Proxy, eigene URLs, DNS und Konfigurationsdateien',
    vpsChoice: 'Öffentlicher VPS / dedizierter Server — empfohlen für 24/7-MCP',
    tunnelChoice: 'Cloudflare Tunnel — öffentliches HTTPS ohne eingehenden Port',
    proxyChoice: 'Vorhandener Reverse Proxy — Caddy, Nginx, Traefik oder andere',
    privateChoice: 'Privater Server / NAS — LAN, VPN oder privater Tunnel',
    localhostChoice: 'Localhost — nur Entwicklung und Tests',
    advancedChoice: 'Benutzerdefinierte / erweiterte Konfiguration',
    domainBase: 'Stammdomain eingeben (zum Beispiel example.de)',
    hostnameChoice: 'Öffentlichen Hostnamen auswählen',
    hostnameMcp: 'Subdomain mcp nur verwenden, wenn deine Cloudflare-Route diesen Hostnamen nutzt',
    hostnameRoot: 'Stammdomain verwenden',
    hostnameCustom: 'Eigene Subdomain eingeben',
    hostnameFull: 'Vollständigen eigenen HTTPS-Endpunkt eingeben',
    subdomainPrompt:
      'Subdomain aus deiner öffentlichen Route eingeben; leer lassen für die Stammdomain',
    domainPreview: 'Vorschau',
    customOrigin:
      'Vollständiger öffentlicher HTTPS-Ursprung ohne Pfad, z. B. https://musik.example.de:8443',
    dnsProviderChoice: 'Wo wird DNS für diese Domain verwaltet?',
    dnsCloudflare: 'Cloudflare',
    dnsOvh: 'OVHcloud',
    dnsRoute53: 'Route 53',
    dnsOther: 'Anderer DNS-Anbieter',
    dnsUnknown: 'Weiß ich nicht',
    dnsManual: 'DNS manuell konfigurieren',
    local: 'Nur dieser Computer (localhost)',
    localNetwork: 'Heim- oder Büronetzwerk (private IP-Adresse)',
    lanAddress: 'Private IPv4- oder IPv6-Adresse des JamRelay-Hosts',
    invalidLan: 'Gib eine private IPv4-Adresse nach RFC 1918 oder eine private IPv6-Adresse ein.',
    lanHelp:
      'LAN-Zugriff ist nur für Geräte in deinem privaten Netzwerk verfügbar. JamRelay bindet sich an das LAN und verwendet HTTP; leite diese Adresse nicht ins Internet weiter. Spotify OAuth benötigt einen akzeptierten Loopback- oder öffentlichen HTTPS-Callback, daher reicht LAN-Zugriff allein möglicherweise nicht für die Spotify-Autorisierung.',
    funnel: 'Tailscale Funnel (öffentliches HTTPS, keine gekaufte Domain)',
    ngrok: 'ngrok (öffentliches HTTPS, keine gekaufte Domain)',
    quick: 'Cloudflare Quick Tunnel (temporäre Tests)',
    own: 'Ich besitze eine Domain',
    hosting: 'Eigener VPS oder Hosting',
    later: 'Später einrichten',
    back: 'Zurück',
    cancel: 'Abbrechen',
    localHelp:
      'Ein MCP-Client auf diesem Computer kann Loopback verwenden. Cloud-gehostete Assistenten erreichen localhost nicht. Keine öffentliche Freigabe und kein Tunnelkonto erforderlich.',
    tailscaleHelp:
      'Funnel veröffentlicht deinen Dienst unter einem stabilen *.ts.net-Namen. Das ist öffentlicher Zugriff, getrennt vom privaten Tailnet. Erfordert Tailscale-Konto, MagicDNS/HTTPS und Funnel-Richtlinienfreigabe. Laut Tailscale für alle Tarife verfügbar, derzeit Beta; TLS-Ports 443, 8443 oder 10000 und Bandbreitenlimits.',
    ngrokHelp:
      'Verwende dein eigenes ngrok-Konto. Der kostenlose Tarif bietet derzeit eine zugewiesene Entwicklungsdomain, bis zu 3 aktive Endpoints, 1 GB Transfer und 20.000 HTTP/S-Anfragen, zeigt aber eine Browser-Zwischenseite. Diese kann MCP/OAuth stören; prüfe den tatsächlichen Clientablauf. Ein berechtigter Bezahl-Tarif entfernt sie und unterstützt eigene Domains.',
    quickHelp:
      'Quick Tunnels benötigen weder Domain noch Cloudflare-Konto, erstellen aber eine wechselnde Zufallsadresse unter trycloudflare.com und sind nur für Entwicklung gedacht. Cloudflare garantiert keine Verfügbarkeit und unterstützt dort kein SSE. JamRelay prüft den echten MCP-Endpunkt.',
    domainHelp:
      'Wähle Cloudflare Tunnel, einen öffentlichen VPS mit Caddy/Nginx oder eine vorhandene Domain hinter deinem Reverse Proxy. JamRelay ändert keine DNS-, Registrar-, Firewall- oder Kontoeinstellungen.',
    hostingHelp:
      'JamRelay liefert die Software. Du stellst einen Linux-Host mit dauerhaftem Node-Prozess und Speicher bereit. Eine Domain ist optional; du kannst einen Tunnel oder deinen bestehenden HTTPS-Endpunkt verwenden.',
    askDomain: 'Domain oder Subdomain (zum Beispiel musik.example.net)',
    invalidDomain: 'Gib eine öffentliche Domain ohne https://, Pfad, Port oder Wildcard ein.',
    dnsProvider: 'Wer betreibt den autoritativen DNS dieser Domain?',
    registrar: 'Bei wem ist die Domain registriert? (unbekannt, falls unsicher)',
    dnsExplain:
      'Der Registrar verkauft und verlängert die Domain. Der DNS-Anbieter veröffentlicht ihre Einträge; das können verschiedene Firmen sein. Nameserver delegieren die DNS-Verwaltung. Änderungen brauchen Zeit zur weltweiten Verteilung. Behalte bestehende Einträge bei und ersetze keine fremden Datensätze.',
    domainMethod: 'Einrichtungsmethode wählen',
    cf: 'Cloudflare Tunnel + eigener Hostname',
    dnsDashboard: 'DNS-Einträge der ausgewählten Cloudflare-Zone öffnen',
    tunnelDashboard: 'Cloudflare Tunnels öffnen',
    cloudflareDashboardHelp:
      'Cloudflare stellt einen offiziellen Link zu den DNS-Einträgen bereit. Er öffnet das ausgewählte Konto bzw. die Zone, sofern verfügbar; andernfalls anmelden und die Domain auswählen. JamRelay erstellt oder ändert keine DNS-Einträge.',
    cloudflareRouteTitle: 'Werte für Cloudflare · Published application',
    cloudflareSubdomain: 'Subdomain',
    cloudflareDomain: 'Domain',
    cloudflareFullHostname: 'Vollständiger Hostname',
    cloudflarePath: 'Pfad (leer lassen)',
    cloudflareServiceUrl: 'Dienst-URL',
    cloudflareRouteHelp:
      'Öffne in Cloudflare Networking → Tunnels → den verbundenen Tunnel → Routes → Add route → Published application. Trage die Werte unten ein, lasse Path leer und speichere die Route. JamRelay erstellt ohne Zugriff auf dein Konto keine Cloudflare-Route.',
    cloudflareRouteAction: 'Cloudflare-Route',
    cloudflareRouteOpen: 'Cloudflare Tunnels öffnen, um die Route hinzuzufügen',
    cloudflareRouteDone: 'Route gespeichert — Hostnamen jetzt prüfen',
    cloudflareRouteLater: 'Route später hinzufügen',
    cloudflareRoutePending:
      'JamRelay hat den Hostnamen gespeichert, aber die Cloudflare-Route wurde nicht erstellt. Füge die Published application mit den zuvor gezeigten Werten hinzu und wähle danach „Gespeicherten Endpunkt prüfen“.',
    direct: 'Öffentlicher VPS + Caddy oder Nginx',
    existing: 'Vorhandener Reverse Proxy und Domain',
    cloudflareIntro:
      'Füge die Domain als Website in deinem Cloudflare-Konto hinzu. Prüfe oder importiere erkannte DNS-Einträge vor einer Nameserver-Änderung. Ersetze beim Registrar die autoritativen Nameserver nur durch das genaue Paar aus der Cloudflare-Zonenübersicht. Bei Status Active ist keine Änderung nötig.',
    nameserverOne: 'Cloudflare-Nameserver 1 (genauer Wert aus Overview; leer lassen, wenn aktiv)',
    nameserverTwo: 'Cloudflare-Nameserver 2 (genauer Wert aus Overview; leer lassen, wenn aktiv)',
    cloudflareSteps:
      'Prüfe vor dem Speichern, ob der gewählte Tunnel als Connected angezeigt wird. Dieser Schritt installiert oder startet cloudflared nicht.',
    tunnelUuid:
      'Tatsächliche Cloudflare-Tunnel-UUID (aus Networking → Tunnels; leer für automatische Dashboard-DNS)',
    dockerNetwork: 'Wo laufen cloudflared oder der Reverse Proxy?',
    host: 'Auf dem Host',
    sameDocker: 'Im selben Docker-Netzwerk wie JamRelay',
    hostOrigin: 'Ziel für einen Prozess auf dem Host',
    dockerOrigin: 'Ziel für einen Container im gemeinsamen Netzwerk',
    caddyConfig:
      'Caddyfile (Caddy bezieht und erneuert öffentliche HTTPS-Zertifikate automatisch, sobald DNS und Ports bereit sind)',
    nginxConfig:
      'Nginx-Site-Konfiguration (Zertifikat mit Certbot oder deinem ACME-Verfahren installieren)',
    caddyPorts:
      'Caddy benötigt öffentlich erreichbare TCP-Ports 80 und 443 für normale ACME-Prüfung und HTTPS. Firewall und Router konfigurierst du selbst. A/AAAA müssen auf den VPS zeigen; ein veralteter AAAA-Eintrag kann die Prüfung verhindern.',
    nginxPorts:
      'Nginx benötigt öffentliches TCP 443. Für HTTP-01-Zertifikate auch TCP 80. Nutze Certbot oder dein ACME-Verfahren. JamRelay ändert keine Firewall-Regeln.',
    publicIp: 'Öffentliche IPv4-Adresse des VPS (tatsächlicher Wert; leer bei IPv6-only)',
    publicIpv6: 'Öffentliche IPv6-Adresse des VPS (optional)',
    cnameTarget: 'Exaktes bestehendes CNAME-Ziel dieses Hostnamens (optional)',
    existingSteps:
      'Prüfe, dass dein Proxy den Hostnamen an JamRelay leitet, Host und X-Forwarded-Proto erhält, lange HTTP-Anfragen unterstützt und HTTPS mit gültigem Zertifikat beendet. TRUST_PROXY nur für einen von dir kontrollierten Proxy aktivieren.',
    continue: 'Mit Endpoint-Prüfung fortfahren',
    continueLater: 'Fortschritt speichern und später fortsetzen',
    enterOrigin: 'HTTPS-Ursprung des Tunnels/Proxys eingeben (z. B. https://musik.example.net)',
    invalidOrigin:
      'Gib einen https://-Ursprung mit gültigem Host ohne Pfad, Query oder Fragment ein.',
    proposed: 'Vorgeschlagener DNS-Eintrag',
    name: 'Name',
    type: 'Typ',
    value: 'Wert',
    proxyStatus: 'Proxy-Status',
    proxyAutomatic: 'Proxy über Cloudflare Tunnel',
    proxyProvider: 'Nach DNS-/Proxy-Anbieter einstellen',
    noIp: 'Keine IP-Adresse angegeben; es wird kein A/AAAA-Wert erfunden. Ermittle die öffentliche Adresse beim Hostinganbieter.',
    cfNameServers:
      'Trage beim Registrar beide Nameserver aus Cloudflare ein. Erhalte alle übrigen DNS-Einträge. Warte auf Status Active; die Verteilung kann Minuten oder länger dauern.',
    directDns:
      'Lege den Eintrag beim DNS-Anbieter an. A steht für IPv4, AAAA für IPv6; beide nur, wenn der Server beides erreicht. CNAME verweist auf einen Hostnamen und ist am Zonen-Apex nicht zulässig. Entferne nur einen eigenen, nicht erreichbaren AAAA-Eintrag.',
    errors:
      'Fehlerbehebung: Domain und autoritative Nameserver prüfen; öffentlichen DNS abfragen; nur eigene veraltete Einträge entfernen; VPS-Firewall/Router prüfen, ohne sie abzuschalten; DNS und Zertifikate abwarten; Tunnelstatus prüfen; bei Docker den veröffentlichten Host-Port oder einen gemeinsamen Dienstnamen verwenden; nach einer Änderung Anbieter-Redirects aktualisieren. Bei CGNAT Tunnel oder öffentlichen VPS statt Portweiterleitung verwenden.',
    checkTitle: 'Prüfe DNS, HTTPS, Serverstatus und MCP-Schutz',
    dnsOk: 'Öffentlicher DNS löst auf',
    dnsBad: 'Öffentlicher DNS löst nicht auf',
    httpsOk: 'HTTPS und Zertifikat geprüft',
    httpsBad: 'HTTPS- oder TLS-Prüfung fehlgeschlagen',
    healthOk: 'JamRelay /health antwortet',
    healthBad: 'JamRelay /health antwortet nicht',
    mcpOk: 'MCP erreichbar und erfordert Authentifizierung',
    mcpBad: 'MCP lieferte nicht die erwartete geschützte Antwort',
    oauthDiscoveryOk: 'OAuth-Discovery stimmt mit dem öffentlichen Ursprung überein',
    oauthDiscoveryBad: 'OAuth-Discovery fehlt oder hat einen abweichenden Issuer',
    oauthRedirectsOk: 'Provider-Callbacks stimmen mit dem öffentlichen Ursprung überein',
    oauthRedirectsBad:
      'Provider-Callbacks müssen in JamRelay und Anbieterportalen aktualisiert werden',
    failedChecks: 'Prüfungen mit Handlungsbedarf',
    oauthNotApplicable: 'Provider-Callbacks',
    statusVerified: 'Verifiziert',
    statusLocal: 'Auf diesem Computer bereit',
    statusFailed: 'Fehlgeschlagen',
    statusPending: 'Ausstehend',
    statusNotChecked: 'Nicht geprüft',
    statusNotApplicable: 'Nicht zutreffend',
    redirectChanged:
      'Eine Änderung des öffentlichen Ursprungs betrifft OAuth-Callbacks. Aktualisiere die gespeicherten Redirect-URIs in den Anbieterportalen, bevor du erneut verbindest.',
    redirectCancelled:
      'Der bisherige öffentliche Ursprung und die Provider-Callbacks bleiben erhalten.',
    ready: 'Sicherer Endpunkt geprüft',
    pending: 'Noch nicht geprüft. Die Einrichtung kann fortgesetzt werden.',
    callbacks:
      'Provider-Redirect-URLs für diesen Ursprung (vor Autorisierung in jeder Entwickler-App aktualisieren):',
    spotify: 'Spotify-Callback',
    soundcloud: 'SoundCloud-Callback',
    youtube: 'YouTube-Callback',
    apple: 'Apple Music verwendet MusicKit-Tokens statt dieses OAuth-Callbacks.',
    recovery:
      'DNS-Werte, Tunnel-/Proxystatus, Portweiterleitung und Zertifikatsprotokolle prüfen, Problem beheben und jamrelay connectivity erneut starten.',
    saved: 'Einrichtungsfortschritt gespeichert.',
    noTty: 'Die Verbindungseinrichtung benötigt ein Terminal. Starte dort jamrelay connectivity.',
    mcpEndpoint: 'MCP-Endpunkt',
    localReady:
      'Lokaler Endpunkt für einen MCP-Client auf demselben Rechner bereit. Cloud-Assistenten erreichen Loopback nicht.',
    status: 'Verbindungsstatus',
    unknown: 'Nicht eingerichtet',
    method: 'Methode',
    origin: 'Ursprung',
    lastCheck: 'Zuletzt geprüft',
    offerBrowser: 'Offizielle Einrichtungsseite öffnen?',
    open: 'Im Browser öffnen',
    show: 'Nur URL anzeigen',
    ownerCosts:
      'Du stellst und bezahlst Registrar, Hosting und externe Konten selbst. JamRelay erstellt keine Konten und ändert keine Einstellungen.',
    cfDomain:
      'Ein Cloudflare-Tunnel mit öffentlichem Hostnamen benötigt eine von Cloudflare verwaltete DNS-Zone. Bei einem anderen Anbieter wähle VPS/Reverse Proxy oder ändere Nameserver selbst, nachdem du vorhandene Einträge geprüft hast.',
    manualProxy: 'Manuelle Reverse-Proxy-Einrichtung',
    saveProxy:
      'Diesen Ausschnitt in eine neue Datei speichern? Bestehende Dateien werden nie überschrieben.',
    proxyFilePath: 'Pfad der neuen Konfigurationsdatei',
    proxySaved: 'Proxy-Konfiguration gespeichert',
    proxySaveFailed:
      'Die Proxy-Konfiguration konnte nicht gespeichert werden. Prüfe das übergeordnete Verzeichnis und die Berechtigungen.',
    dockerProxySave:
      'Dieser Assistent läuft in Docker und kann nicht auf den Host schreiben. Kopiere die Konfiguration unten in deinen Host-Proxy.',
    nginxCertificate: 'Absoluter Pfad zum ausgestellten TLS-Zertifikat (vollständige Kette)',
    nginxPrivateKey: 'Absoluter Pfad zum passenden TLS-Privatschlüssel',
    restartTitle: 'Öffentliche Adresse wird übernommen',
    restartApplying: 'Adresse wird gespeichert und der JamRelay-Container neu gestartet…',
    restartChecking: 'Warte, bis JamRelay wieder erreichbar ist…',
    restartNoAck:
      'Der laufende Container hat die Änderung nicht übernommen. Prüfe, ob er dasselbe /data-Volume verwendet.',
    restartFailed:
      'Die Konfiguration wurde gespeichert, aber JamRelay ist nach dem Neustart nicht gesund. Prüfe die Container-Logs.',
    advancedWarningTitle: 'Erweiterte Einrichtung ist experimentell',
    advancedWarning:
      'Die erweiterte Einrichtung wird noch entwickelt und funktioniert möglicherweise noch nicht. Eigene Domains werden nur mit Cloudflare geprüft, Anbieter-Integrationen nur mit Spotify; andere Domains, Anbieter, MCP-Clients und Modelle können sich unvorhersehbar verhalten. Fahre nur fort, wenn du das Ergebnis selbst prüfen und beheben kannst.',
    cfCreateTitle: 'Cloudflare-Tunnel erstellen',
    cfCreateBody:
      'Öffne in Cloudflare Zero Trust Networks → Tunnels → Create a tunnel → Cloudflared und vergib einen Namen, zum Beispiel jamrelay. Cloudflare zeigt dann einen Installationsbefehl mit einem geheimen Token. Führe diesen Befehl selbst auf diesem Computer als Administrator aus. Füge das Token nicht in JamRelay ein. Warte, bis der Tunnel Connected anzeigt, und fahre dann fort.',
    cfPublishTitle: 'Anwendung veröffentlichen',
    cfPublishBody:
      'Öffne im Tunnel Public Hostname → Add a public hostname und trage die folgenden Werte ein. Dienst-Typ: HTTP. Cloudflare legt den DNS-Eintrag automatisch an, ein CNAME musst du nicht selbst hinzufügen.',
    connectedTitle: 'Verbindung funktioniert',
    connectedRecheck: 'Erneut prüfen',
    connectedChange: 'Verbindungsart ändern',
  },
  fr: {
    title: 'Comment votre assistant IA se connectera-t-il ?',
    modeTitle: 'Choisissez le mode de configuration',
    networkSummary:
      'Rapide configure cet ordinateur. Standard guide les choix courants. Avancé affiche tous les réglages réseau et proxy. Le MCP distant nécessite un HTTPS public.',
    standardMode: 'Standard — configuration guidée du tunnel, de l’ordinateur ou du réseau privé',
    advancedMode:
      'Avancé — VPS, proxy inverse, URL personnalisées, DNS et fichiers de configuration',
    vpsChoice: 'VPS public / serveur dédié — recommandé pour MCP distant 24 h/24',
    tunnelChoice: 'Cloudflare Tunnel — HTTPS public sans port entrant',
    proxyChoice: 'Reverse proxy existant — Caddy, Nginx, Traefik ou autre',
    privateChoice: 'Serveur privé / NAS — LAN, VPN ou tunnel privé',
    localhostChoice: 'Localhost — développement et tests uniquement',
    advancedChoice: 'Configuration personnalisée / avancée',
    domainBase: 'Saisissez le domaine racine (exemple : example.fr)',
    hostnameChoice: 'Choisissez le nom d’hôte public',
    hostnameMcp: 'Utiliser la sous-domaine mcp uniquement si la route Cloudflare utilise ce nom',
    hostnameRoot: 'Utiliser le domaine racine',
    hostnameCustom: 'Saisir une sous-domaine personnalisée',
    hostnameFull: 'Saisir un endpoint HTTPS personnalisé complet',
    subdomainPrompt:
      'Saisissez la sous-domaine de la route publique ; laissez vide pour le domaine racine',
    domainPreview: 'Aperçu',
    customOrigin:
      'Origine HTTPS publique complète sans chemin, ex. https://musique.example.fr:8443',
    dnsProviderChoice: 'Où le DNS de ce domaine est-il géré ?',
    dnsCloudflare: 'Cloudflare',
    dnsOvh: 'OVHcloud',
    dnsRoute53: 'Route 53',
    dnsOther: 'Autre fournisseur DNS',
    dnsUnknown: 'Je ne sais pas',
    dnsManual: 'Configurer le DNS manuellement',
    local: 'Cet ordinateur uniquement (localhost)',
    localNetwork: 'Réseau domestique ou professionnel (IP privée)',
    lanAddress: 'Adresse IPv4 ou IPv6 privée de l’hôte JamRelay',
    invalidLan: 'Saisissez une adresse IPv4 privée RFC 1918 ou une adresse IPv6 privée.',
    lanHelp:
      'L’accès LAN est limité aux appareils de votre réseau privé. JamRelay écoutera sur le LAN en HTTP ; ne redirigez pas cette adresse vers Internet. Spotify OAuth exige une adresse de retour loopback acceptée ou un HTTPS public ; le LAN seul peut donc ne pas suffire pour autoriser Spotify.',
    funnel: 'Tailscale Funnel (HTTPS public sans domaine acheté)',
    ngrok: 'ngrok (HTTPS public sans domaine acheté)',
    quick: 'Cloudflare Quick Tunnel (test temporaire)',
    own: 'Je possède un domaine',
    hosting: 'VPS ou hébergement personnel',
    later: 'Configurer plus tard',
    back: 'Retour',
    cancel: 'Annuler',
    localHelp:
      'Un client MCP sur cet ordinateur peut utiliser loopback. Les assistants hébergés dans le cloud ne peuvent pas joindre localhost. Aucun accès public ni compte de tunnel requis.',
    tailscaleHelp:
      'Funnel publie votre service sous un nom stable *.ts.net. Il donne un accès public, distinct du réseau privé tailnet. Compte Tailscale, MagicDNS/HTTPS et approbation de la politique Funnel requis. Tailscale le propose actuellement sur tous les forfaits; la fonction est en bêta, limitée aux ports TLS 443, 8443 et 10000 et soumise à des limites de bande passante.',
    ngrokHelp:
      'Utilisez votre propre compte ngrok. Le forfait gratuit inclut actuellement un domaine de développement attribué, jusqu’à 3 endpoints actifs, 1 Go de transfert et 20 000 requêtes HTTP/S, avec une page intermédiaire dans le navigateur. Elle peut gêner MCP/OAuth; vérifiez le parcours réel. Un forfait payant admissible la retire et permet un domaine personnalisé.',
    quickHelp:
      'Quick Tunnel ne demande ni domaine ni compte Cloudflare, mais génère une URL trycloudflare.com aléatoire et changeante, réservée au développement. Cloudflare ne garantit pas sa disponibilité et ne prend pas en charge SSE. JamRelay vérifiera le véritable endpoint MCP.',
    domainHelp:
      'Choisissez Cloudflare Tunnel, un VPS public avec Caddy/Nginx ou un domaine déjà routé par votre proxy inverse. JamRelay ne modifie pas les comptes registrar, DNS, pare-feu ou tiers.',
    hostingHelp:
      'JamRelay fournit le logiciel. Vous fournissez un hôte Linux, un processus Node persistant et du stockage persistant. Le domaine est facultatif: utilisez un tunnel ou un endpoint HTTPS existant.',
    askDomain: 'Domaine ou sous-domaine (par exemple musique.example.net)',
    invalidDomain: 'Saisissez un domaine public sans https://, chemin, port ni joker.',
    dnsProvider: 'Qui héberge le DNS faisant autorité pour ce domaine ?',
    registrar: 'Où le domaine est-il enregistré ? (inconnu si vous ne savez pas)',
    dnsExplain:
      'Le registrar vend et renouvelle le domaine. Le fournisseur DNS publie ses enregistrements; il peut s’agir d’entreprises différentes. Les serveurs de noms délèguent l’autorité DNS. La propagation prend du temps. Conservez les enregistrements existants et ne remplacez aucun enregistrement sans rapport.',
    domainMethod: 'Choisir la méthode de domaine',
    cf: 'Cloudflare Tunnel + nom d’hôte personnalisé',
    dnsDashboard: 'Ouvrir les enregistrements DNS de la zone Cloudflare sélectionnée',
    tunnelDashboard: 'Ouvrir Cloudflare Tunnels',
    cloudflareDashboardHelp:
      'Cloudflare fournit un lien officiel vers les enregistrements DNS. Il ouvre le compte/la zone sélectionné si disponible ; sinon, connectez-vous et choisissez le domaine. JamRelay ne crée ni ne modifie aucun enregistrement DNS.',
    cloudflareRouteTitle: 'Valeurs Cloudflare · Published application',
    cloudflareSubdomain: 'Sous-domaine',
    cloudflareDomain: 'Domaine',
    cloudflareFullHostname: 'Nom d’hôte complet',
    cloudflarePath: 'Chemin (laisser vide)',
    cloudflareServiceUrl: 'URL du service',
    cloudflareRouteHelp:
      'Dans Cloudflare, ouvrez Networking → Tunnels → le tunnel connecté → Routes → Add route → Published application. Saisissez les valeurs ci-dessous, laissez Path vide, puis enregistrez. JamRelay ne crée pas de route sans accès à votre compte.',
    cloudflareRouteAction: 'Route Cloudflare',
    cloudflareRouteOpen: 'Ouvrir Cloudflare Tunnels pour ajouter la route',
    cloudflareRouteDone: 'Route enregistrée — vérifier ce nom d’hôte',
    cloudflareRouteLater: 'Ajouter la route plus tard',
    cloudflareRoutePending:
      'JamRelay a enregistré le nom d’hôte, mais la route Cloudflare n’a pas été créée. Ajoutez la Published application avec les valeurs affichées, puis choisissez Vérifier l’endpoint enregistré.',
    direct: 'VPS public + Caddy ou Nginx',
    existing: 'Proxy inverse et domaine existants',
    cloudflareIntro:
      'Ajoutez le domaine comme site dans votre compte Cloudflare. Vérifiez ou importez les enregistrements DNS détectés avant de changer les serveurs de noms. Chez le registrar, remplacez-les uniquement par la paire exacte affichée dans la zone Cloudflare. Ne les changez pas si la zone est déjà Active.',
    nameserverOne: 'Serveur de noms Cloudflare 1 (valeur exacte de Overview; vide si déjà actif)',
    nameserverTwo: 'Serveur de noms Cloudflare 2 (valeur exacte de Overview; vide si déjà actif)',
    cloudflareSteps:
      'Avant d’enregistrer la route, vérifiez que le tunnel sélectionné est Connected. Cette étape n’installe ni ne démarre cloudflared.',
    tunnelUuid:
      'UUID réel du tunnel Cloudflare (copiez-le depuis Networking → Tunnels; vide pour le DNS automatique)',
    dockerNetwork: 'Où tourneront cloudflared ou le proxy inverse ?',
    host: 'Sur l’hôte',
    sameDocker: 'Dans le même réseau Docker que JamRelay',
    hostOrigin: 'Origine pour un processus sur l’hôte',
    dockerOrigin: 'Origine pour un conteneur sur le réseau partagé',
    caddyConfig:
      'Caddyfile (Caddy obtient et renouvelle automatiquement les certificats HTTPS publics quand DNS et ports sont prêts)',
    nginxConfig:
      'Configuration du site Nginx (installez un certificat avec Certbot ou votre processus ACME)',
    caddyPorts:
      'Caddy a besoin des ports TCP publics 80 et 443 pour la validation ACME standard et HTTPS. Configurez vous-même pare-feu et routeur. A/AAAA doivent pointer vers le VPS; un AAAA obsolète peut bloquer la validation.',
    nginxPorts:
      'Nginx nécessite TCP 443 public. La validation HTTP-01 nécessite aussi TCP 80. Utilisez Certbot ou votre ACME existant. JamRelay ne change pas le pare-feu.',
    publicIp: 'Adresse IPv4 publique du VPS (valeur réelle; vide si IPv6 uniquement)',
    publicIpv6: 'Adresse IPv6 publique du VPS (facultatif)',
    cnameTarget: 'Cible CNAME actuelle exacte pour cet hôte, si configurée (facultatif)',
    existingSteps:
      'Vérifiez que le proxy route cet hôte vers JamRelay, conserve Host et X-Forwarded-Proto, prend en charge les requêtes HTTP longues et termine HTTPS avec un certificat valide. N’activez TRUST_PROXY que pour un proxy sous votre contrôle.',
    continue: 'Continuer vers la vérification',
    continueLater: 'Enregistrer et continuer plus tard',
    enterOrigin: 'Saisissez l’origine HTTPS du tunnel/proxy (ex. https://musique.example.net)',
    invalidOrigin:
      'Saisissez une origine https:// avec un hôte valide, sans chemin, requête ni fragment.',
    proposed: 'Enregistrement DNS proposé',
    name: 'Nom',
    type: 'Type',
    value: 'Valeur',
    proxyStatus: 'État du proxy',
    proxyAutomatic: 'Proxy via Cloudflare Tunnel',
    proxyProvider: 'Selon le fournisseur DNS/proxy',
    noIp: 'Aucune IP fournie; aucune valeur A/AAAA ne sera inventée. Demandez l’adresse publique à votre hébergeur.',
    cfNameServers:
      'Configurez chez le registrar les deux serveurs de noms Cloudflare. Conservez les autres entrées DNS. Attendez le statut Active; la propagation peut prendre quelques minutes ou plus.',
    directDns:
      'Ajoutez l’entrée chez le fournisseur DNS. A désigne IPv4, AAAA IPv6; ajoutez les deux seulement si les deux sont accessibles. CNAME pointe vers un nom d’hôte et ne convient pas à l’apex. Supprimez uniquement un AAAA obsolète que vous gérez.',
    errors:
      'Dépannage: vérifiez le domaine et les serveurs DNS faisant autorité; interrogez le DNS public; retirez uniquement vos entrées obsolètes; vérifiez pare-feu et routeur sans désactiver la protection; attendez DNS et certificat; vérifiez le tunnel; avec Docker utilisez le port publié sur l’hôte ou le nom du service partagé; mettez à jour les URL de redirection après changement. En CGNAT, utilisez un tunnel ou un VPS public plutôt qu’une redirection de ports.',
    checkTitle: 'Vérification du DNS, HTTPS, serveur et protection MCP',
    dnsOk: 'DNS public résolu',
    dnsBad: 'DNS public non résolu',
    httpsOk: 'HTTPS et certificat vérifiés',
    httpsBad: 'Échec HTTPS ou certificat TLS',
    healthOk: 'JamRelay répond sur /health',
    healthBad: 'JamRelay ne répond pas sur /health',
    mcpOk: 'MCP accessible et authentification exigée',
    mcpBad: 'MCP n’a pas renvoyé la réponse protégée attendue',
    oauthDiscoveryOk: 'La découverte OAuth correspond à l’origine publique',
    oauthDiscoveryBad: 'La découverte OAuth est indisponible ou son issuer diffère',
    oauthRedirectsOk: 'Les callbacks des fournisseurs correspondent à l’origine publique',
    oauthRedirectsBad: 'Mettez à jour les callbacks dans JamRelay et les portails fournisseurs',
    failedChecks: 'Vérifications à corriger',
    oauthNotApplicable: 'Callbacks fournisseurs',
    statusVerified: 'Vérifié',
    statusLocal: 'Prêt sur cet ordinateur',
    statusFailed: 'Échec',
    statusPending: 'En attente',
    statusNotChecked: 'Non vérifié',
    statusNotApplicable: 'Sans objet',
    redirectChanged:
      'La modification de l’origine publique affecte les callbacks OAuth. Mettez à jour les URI de redirection dans les portails fournisseurs avant de reconnecter.',
    redirectCancelled: 'L’origine publique et les callbacks fournisseurs existants sont conservés.',
    ready: 'Endpoint sécurisé vérifié',
    pending: 'Pas encore vérifié. La configuration peut reprendre plus tard.',
    callbacks:
      'URL de redirection fournisseur pour cette origine (à mettre à jour dans chaque application avant autorisation):',
    spotify: 'Callback Spotify',
    soundcloud: 'Callback SoundCloud',
    youtube: 'Callback YouTube',
    apple: 'Apple Music utilise des jetons MusicKit, pas ce callback OAuth.',
    recovery:
      'Vérifiez DNS, tunnel/proxy, ports et journaux du certificat, corrigez puis relancez jamrelay connectivity.',
    saved: 'Progression enregistrée.',
    noTty: 'La configuration nécessite un terminal. Lancez jamrelay connectivity dans un terminal.',
    mcpEndpoint: 'Endpoint MCP',
    localReady:
      'Endpoint local prêt pour un client MCP sur le même ordinateur. Les assistants cloud ne peuvent pas joindre loopback.',
    status: 'État de connexion',
    unknown: 'Non configuré',
    method: 'Méthode',
    origin: 'Origine',
    lastCheck: 'Dernière vérification',
    offerBrowser: 'Ouvrir la page officielle de configuration ?',
    open: 'Ouvrir le navigateur',
    show: 'Afficher uniquement l’URL',
    ownerCosts:
      'Vous fournissez et payez votre registrar, hébergement et comptes tiers. JamRelay ne crée pas ces comptes et ne modifie pas leurs réglages.',
    cfDomain:
      'Un tunnel Cloudflare avec nom public exige que Cloudflare héberge la zone DNS. Sinon, choisissez VPS/proxy ou changez vous-même les serveurs de noms après vérification des enregistrements existants.',
    manualProxy: 'Configuration manuelle du reverse proxy',
    saveProxy:
      'Enregistrer cet extrait dans un nouveau fichier ? Les fichiers existants ne sont jamais écrasés.',
    proxyFilePath: 'Chemin du nouveau fichier de configuration',
    proxySaved: 'Configuration du proxy enregistrée',
    proxySaveFailed:
      'Impossible d’enregistrer la configuration du proxy. Vérifiez le dossier parent et les permissions.',
    dockerProxySave:
      'Cet assistant tourne dans Docker et ne peut pas écrire sur l’hôte. Copiez la configuration ci-dessous dans votre proxy hôte.',
    nginxCertificate: 'Chemin absolu du certificat TLS délivré (chaîne complète)',
    nginxPrivateKey: 'Chemin absolu de la clé privée TLS correspondante',
    restartTitle: 'Application de l’adresse publique',
    restartApplying: 'Enregistrement de l’adresse et redémarrage du conteneur JamRelay…',
    restartChecking: 'Attente du retour de JamRelay…',
    restartNoAck:
      'Le conteneur en cours n’a pas accepté la modification. Vérifiez qu’il utilise le même volume /data.',
    restartFailed:
      'La configuration a été enregistrée, mais JamRelay n’est pas revenu en bonne santé après redémarrage. Consultez les journaux du conteneur.',
    advancedWarningTitle: 'La configuration avancée est expérimentale',
    advancedWarning:
      'La configuration avancée est encore en développement et peut ne pas fonctionner. Les domaines personnalisés ne sont vérifiés qu’avec Cloudflare, les intégrations de fournisseurs qu’avec Spotify ; les autres domaines, fournisseurs, clients et modèles MCP peuvent se comporter de façon imprévisible. Continuez seulement si vous pouvez vérifier et corriger le résultat vous-même.',
    cfCreateTitle: 'Créer le tunnel Cloudflare',
    cfCreateBody:
      'Dans Cloudflare Zero Trust, ouvrez Networks → Tunnels → Create a tunnel → Cloudflared et donnez-lui un nom, par exemple jamrelay. Cloudflare affiche une commande d’installation contenant un jeton secret. Exécutez-la vous-même sur cet ordinateur en administrateur. Ne collez pas le jeton dans JamRelay. Attendez que le tunnel affiche Connected, puis continuez.',
    cfPublishTitle: 'Publier l’application',
    cfPublishBody:
      'Dans le tunnel, ouvrez Public Hostname → Add a public hostname et saisissez les valeurs ci-dessous. Type de service : HTTP. Cloudflare crée automatiquement l’enregistrement DNS, inutile d’ajouter un CNAME vous-même.',
    connectedTitle: 'La connexion fonctionne',
    connectedRecheck: 'Vérifier à nouveau',
    connectedChange: 'Changer le mode de connexion',
  },
  es: {
    title: '¿Cómo se conectará tu asistente de IA?',
    modeTitle: 'Elige el modo de configuración',
    networkSummary:
      'Rápido configura solo este equipo. Estándar guía las opciones habituales. Avanzado muestra todos los ajustes de red y proxy. MCP remoto requiere HTTPS público.',
    standardMode: 'Estándar — guía para túnel público, equipo o red privada',
    advancedMode:
      'Avanzado — VPS, proxy inverso, URL personalizadas, DNS y archivos de configuración',
    vpsChoice: 'VPS público / servidor dedicado — recomendado para MCP 24/7',
    tunnelChoice: 'Cloudflare Tunnel — HTTPS público sin puerto entrante',
    proxyChoice: 'Proxy inverso existente — Caddy, Nginx, Traefik u otro',
    privateChoice: 'Servidor privado / NAS — LAN, VPN o túnel privado',
    localhostChoice: 'Localhost — solo desarrollo y pruebas',
    advancedChoice: 'Configuración personalizada / avanzada',
    domainBase: 'Introduce el dominio base (por ejemplo example.es)',
    hostnameChoice: 'Elige el nombre de host público',
    hostnameMcp: 'Usa el subdominio mcp solo si la ruta de Cloudflare usa ese nombre',
    hostnameRoot: 'Usar el dominio raíz',
    hostnameCustom: 'Introducir un subdominio personalizado',
    hostnameFull: 'Introducir un endpoint HTTPS personalizado completo',
    subdomainPrompt:
      'Escribe el subdominio de la ruta pública; déjalo vacío para usar el dominio raíz',
    domainPreview: 'Vista previa',
    customOrigin:
      'Origen HTTPS público completo sin ruta, por ejemplo https://musica.example.es:8443',
    dnsProviderChoice: '¿Dónde se administra el DNS de este dominio?',
    dnsCloudflare: 'Cloudflare',
    dnsOvh: 'OVHcloud',
    dnsRoute53: 'Route 53',
    dnsOther: 'Otro proveedor DNS',
    dnsUnknown: 'No lo sé',
    dnsManual: 'Configurar DNS manualmente',
    local: 'Solo este equipo (localhost)',
    localNetwork: 'Red doméstica o de oficina (IP privada)',
    lanAddress: 'Dirección IPv4 o IPv6 privada del host de JamRelay',
    invalidLan: 'Introduce una dirección IPv4 privada RFC 1918 o una dirección IPv6 privada.',
    lanHelp:
      'El acceso LAN solo está disponible para dispositivos de tu red privada. JamRelay escuchará en la LAN mediante HTTP; no redirijas esta dirección a Internet. Spotify OAuth requiere una callback loopback aceptada o HTTPS público, por lo que el acceso LAN por sí solo puede no permitir autorizar Spotify.',
    funnel: 'Tailscale Funnel (HTTPS público, sin comprar dominio)',
    ngrok: 'ngrok (HTTPS público, sin comprar dominio)',
    quick: 'Cloudflare Quick Tunnel (pruebas temporales)',
    own: 'Tengo un dominio',
    hosting: 'VPS o alojamiento propio',
    later: 'Configurar más tarde',
    back: 'Volver',
    cancel: 'Cancelar',
    localHelp:
      'Un cliente MCP en este equipo puede usar loopback. Los asistentes alojados en la nube no pueden acceder a localhost. No requiere exposición pública ni cuenta de túnel.',
    tailscaleHelp:
      'Funnel publica el servicio con un nombre estable *.ts.net. Es acceso público, distinto de la red privada tailnet. Requiere cuenta Tailscale, MagicDNS/HTTPS y aprobación de la política Funnel. Tailscale lo ofrece actualmente en todos los planes; está en beta, limitado a puertos TLS 443, 8443 o 10000 y sujeto a límites de ancho de banda.',
    ngrokHelp:
      'Usa tu propia cuenta de ngrok. El plan gratuito incluye actualmente un dominio de desarrollo asignado, hasta 3 endpoints activos, 1 GB de transferencia y 20 000 solicitudes HTTP/S; muestra una página intermedia en el navegador. Puede impedir MCP/OAuth, así que verifica el flujo real. Un plan de pago elegible la elimina y permite dominios propios.',
    quickHelp:
      'Quick Tunnel no necesita dominio ni cuenta Cloudflare, pero crea una URL aleatoria trycloudflare.com que cambia y solo sirve para desarrollo. Cloudflare no garantiza disponibilidad ni admite SSE allí. JamRelay probará el endpoint MCP real.',
    domainHelp:
      'Elige Cloudflare Tunnel, un VPS público con Caddy/Nginx o un dominio ya dirigido por tu proxy inverso. JamRelay no cambia cuentas de registrador, DNS, firewall ni de terceros.',
    hostingHelp:
      'JamRelay proporciona el software. Tú proporcionas un host Linux, un proceso Node persistente y almacenamiento persistente. El dominio es opcional: usa un túnel o introduce tu endpoint HTTPS existente.',
    askDomain: 'Dominio o subdominio (por ejemplo musica.example.net)',
    invalidDomain: 'Introduce un dominio público sin https://, ruta, puerto ni comodín.',
    dnsProvider: '¿Quién aloja el DNS autoritativo del dominio?',
    registrar: '¿Dónde registraste el dominio? (escribe no lo sé si dudas)',
    dnsExplain:
      'El registrador vende y renueva el dominio. El proveedor DNS publica sus registros; pueden ser empresas distintas. Los servidores de nombres delegan la autoridad DNS. Los cambios tardan en propagarse. Conserva los registros existentes y no sustituyas entradas ajenas.',
    domainMethod: 'Elige la configuración del dominio',
    cf: 'Cloudflare Tunnel + hostname propio',
    dnsDashboard: 'Abrir los registros DNS de la zona de Cloudflare seleccionada',
    tunnelDashboard: 'Abrir Cloudflare Tunnels',
    cloudflareDashboardHelp:
      'Cloudflare ofrece un enlace oficial a los registros DNS. Abre la cuenta/zona seleccionada si está disponible; si no, inicia sesión y elige el dominio. JamRelay no crea ni modifica registros DNS.',
    cloudflareRouteTitle: 'Valores para Cloudflare · Published application',
    cloudflareSubdomain: 'Subdominio',
    cloudflareDomain: 'Dominio',
    cloudflareFullHostname: 'Nombre de host completo',
    cloudflarePath: 'Ruta (dejar vacía)',
    cloudflareServiceUrl: 'URL del servicio',
    cloudflareRouteHelp:
      'En Cloudflare, abre Networking → Tunnels → el túnel conectado → Routes → Add route → Published application. Introduce los valores de abajo, deja Path vacío y guarda. JamRelay no crea la ruta sin acceso a tu cuenta.',
    cloudflareRouteAction: 'Ruta de Cloudflare',
    cloudflareRouteOpen: 'Abrir Cloudflare Tunnels para añadir la ruta',
    cloudflareRouteDone: 'Ruta guardada — comprobar ahora este hostname',
    cloudflareRouteLater: 'Añadir la ruta más tarde',
    cloudflareRoutePending:
      'JamRelay guardó el hostname, pero no creó la ruta de Cloudflare. Añade Published application con los valores mostrados y después elige Verificar endpoint guardado.',
    direct: 'VPS público + Caddy o Nginx',
    existing: 'Proxy inverso y dominio existentes',
    cloudflareIntro:
      'Añade el dominio como sitio en tu cuenta Cloudflare. Revisa o importa los registros detectados antes de cambiar nameservers. En el registrador, reemplaza los servidores autoritativos solo por el par exacto que muestra la zona Cloudflare. No los cambies si la zona ya está Active.',
    nameserverOne: 'Nameserver Cloudflare 1 (valor exacto de Overview; vacío si ya está activo)',
    nameserverTwo: 'Nameserver Cloudflare 2 (valor exacto de Overview; vacío si ya está activo)',
    cloudflareSteps:
      'Antes de guardar la ruta, confirma que el túnel seleccionado muestra Connected. Este paso no instala ni inicia cloudflared.',
    tunnelUuid:
      'UUID real del túnel Cloudflare (cópialo de Networking → Tunnels; vacío para DNS automático del panel)',
    dockerNetwork: '¿Dónde se ejecutarán cloudflared o el proxy inverso?',
    host: 'En el host',
    sameDocker: 'En la misma red Docker que JamRelay',
    hostOrigin: 'Origen para el proceso en el host',
    dockerOrigin: 'Origen para un contenedor en la red compartida',
    caddyConfig:
      'Caddyfile (Caddy obtiene y renueva automáticamente certificados HTTPS públicos cuando DNS y puertos estén listos)',
    nginxConfig:
      'Configuración del sitio Nginx (instala el certificado con Certbot o tu proceso ACME)',
    caddyPorts:
      'Caddy necesita los puertos TCP públicos 80 y 443 para la validación ACME normal y HTTPS. Configura firewall y router tú mismo. A/AAAA deben apuntar al VPS; un AAAA obsoleto puede impedir la validación.',
    nginxPorts:
      'Nginx requiere TCP 443 público. La validación HTTP-01 también necesita TCP 80. Usa Certbot o tu ACME actual. JamRelay no cambia las reglas del firewall.',
    publicIp: 'Dirección IPv4 pública del VPS (valor real; vacío si solo IPv6)',
    publicIpv6: 'Dirección IPv6 pública del VPS (opcional)',
    cnameTarget: 'Destino CNAME exacto ya configurado para este hostname (opcional)',
    existingSteps:
      'Comprueba que el proxy dirige este hostname a JamRelay, conserva Host y X-Forwarded-Proto, admite solicitudes HTTP largas y termina HTTPS con certificado válido. Activa TRUST_PROXY solo para un proxy que controles.',
    continue: 'Continuar a verificar endpoint',
    continueLater: 'Guardar y continuar más tarde',
    enterOrigin:
      'Introduce el origen HTTPS del túnel/proxy (por ejemplo https://musica.example.net)',
    invalidOrigin:
      'Introduce un origen https:// con hostname válido y sin ruta, consulta ni fragmento.',
    proposed: 'Registro DNS propuesto',
    name: 'Nombre',
    type: 'Tipo',
    value: 'Valor',
    proxyStatus: 'Estado del proxy',
    proxyAutomatic: 'Proxy mediante Cloudflare Tunnel',
    proxyProvider: 'Según el proveedor DNS/proxy',
    noIp: 'No se indicó IP; no se inventa el valor A/AAAA. Obtén la dirección pública de tu proveedor de alojamiento.',
    cfNameServers:
      'En el registrador establece ambos nameservers de Cloudflare. Conserva los demás registros. Espera a que Cloudflare muestre Active; la propagación puede tardar minutos o más.',
    directDns:
      'Añade el registro en tu proveedor DNS. A es para IPv4 y AAAA para IPv6; añade ambos solo si el servidor acepta tráfico en ambos. CNAME apunta a otro hostname y no sirve en el apex. Elimina solo un AAAA obsoleto que controles.',
    errors:
      'Solución de problemas: revisa dominio y nameservers autoritativos; consulta DNS público; elimina solo registros propios obsoletos; revisa firewall del VPS/router sin desactivarlo; espera DNS y certificado; verifica que el túnel esté activo; en Docker usa el puerto publicado del host o el nombre del servicio compartido; actualiza redirects tras cambiar el origen. Con CGNAT usa túnel o VPS público, no reenvío de puertos.',
    checkTitle: 'Comprobando DNS, HTTPS, salud del servidor y protección MCP',
    dnsOk: 'DNS público resuelve',
    dnsBad: 'DNS público no resuelve',
    httpsOk: 'HTTPS y certificado verificados',
    httpsBad: 'Falló HTTPS o la validación TLS',
    healthOk: 'JamRelay responde en /health',
    healthBad: 'JamRelay no respondió en /health',
    mcpOk: 'MCP accesible y requiere autenticación',
    mcpBad: 'MCP no devolvió la respuesta protegida esperada',
    oauthDiscoveryOk: 'El descubrimiento OAuth coincide con el origen público',
    oauthDiscoveryBad: 'El descubrimiento OAuth no está disponible o el issuer no coincide',
    oauthRedirectsOk: 'Los callbacks configurados coinciden con el origen público',
    oauthRedirectsBad: 'Actualiza los callbacks en JamRelay y en los paneles de proveedores',
    failedChecks: 'Comprobaciones que requieren atención',
    oauthNotApplicable: 'Callbacks de proveedores',
    statusVerified: 'Verificado',
    statusLocal: 'Listo en este equipo',
    statusFailed: 'Fallido',
    statusPending: 'Pendiente',
    statusNotChecked: 'Sin comprobar',
    statusNotApplicable: 'No aplicable',
    redirectChanged:
      'Cambiar el origen público afecta a los callbacks OAuth. Actualiza las URI guardadas en los paneles de proveedores antes de volver a conectar.',
    redirectCancelled: 'Se conservaron el origen público y los callbacks actuales.',
    ready: 'Endpoint seguro verificado',
    pending: 'Aún sin verificar. La configuración se puede reanudar.',
    callbacks:
      'URLs de redirección para este origen (actualiza cada aplicación antes de autorizar):',
    spotify: 'Callback de Spotify',
    soundcloud: 'Callback de SoundCloud',
    youtube: 'Callback de YouTube',
    apple: 'Apple Music usa tokens MusicKit, no este callback OAuth.',
    recovery:
      'Revisa DNS, estado del túnel/proxy, puertos y registros del certificado; corrige y vuelve a ejecutar jamrelay connectivity.',
    saved: 'Progreso guardado.',
    noTty: 'La configuración requiere una terminal. Ejecuta jamrelay connectivity en una terminal.',
    mcpEndpoint: 'Endpoint MCP',
    localReady:
      'Endpoint local listo para un cliente MCP en el mismo equipo. Los asistentes en la nube no pueden acceder a loopback.',
    status: 'Estado de conexión',
    unknown: 'Sin configurar',
    method: 'Método',
    origin: 'Origen',
    lastCheck: 'Última verificación',
    offerBrowser: '¿Abrir la página oficial de configuración?',
    open: 'Abrir en el navegador',
    show: 'Mostrar solo la URL',
    ownerCosts:
      'Tú proporcionas y pagas el registrador, alojamiento y cuentas externas. JamRelay no crea esas cuentas ni cambia sus ajustes.',
    cfDomain:
      'Un túnel Cloudflare con hostname público requiere que Cloudflare aloje la zona DNS. Si no es así, elige VPS/proxy o cambia tú mismo los nameservers tras revisar los registros actuales.',
    manualProxy: 'Configuración manual de reverse proxy',
    saveProxy:
      '¿Guardar este fragmento en un archivo nuevo? Los archivos existentes nunca se sobrescriben.',
    proxyFilePath: 'Ruta del nuevo archivo de configuración',
    proxySaved: 'Configuración del proxy guardada',
    proxySaveFailed:
      'No se pudo guardar la configuración del proxy. Revisa el directorio padre y los permisos.',
    dockerProxySave:
      'Este asistente está dentro de Docker y no puede escribir en el host. Copia la configuración de abajo a tu proxy del host.',
    nginxCertificate: 'Ruta absoluta al certificado TLS emitido (cadena completa)',
    nginxPrivateKey: 'Ruta absoluta a la clave privada TLS correspondiente',
    restartTitle: 'Aplicando la dirección pública',
    restartApplying: 'Guardando la dirección y reiniciando el contenedor de JamRelay…',
    restartChecking: 'Esperando a que JamRelay vuelva a estar disponible…',
    restartNoAck:
      'El contenedor en ejecución no aceptó el cambio. Comprueba que usa el mismo volumen /data.',
    restartFailed:
      'La configuración se guardó, pero JamRelay no volvió a estar en buen estado tras reiniciar. Revisa los logs del contenedor.',
    advancedWarningTitle: 'La configuración avanzada es experimental',
    advancedWarning:
      'La configuración avanzada sigue en desarrollo y puede que aún no funcione. Los dominios propios solo se comprueban con Cloudflare, las integraciones de proveedores solo con Spotify, y otros dominios, proveedores, clientes y modelos MCP pueden comportarse de forma impredecible. Continúa solo si puedes comprobar y depurar el resultado tú mismo.',
    cfCreateTitle: 'Crear el túnel de Cloudflare',
    cfCreateBody:
      'En Cloudflare Zero Trust abre Networks → Tunnels → Create a tunnel → Cloudflared y ponle un nombre, por ejemplo jamrelay. Cloudflare muestra un comando de instalación con un token secreto. Ejecútalo tú mismo en este equipo como administrador. No pegues el token en JamRelay. Espera a que el túnel muestre Connected y luego continúa.',
    cfPublishTitle: 'Publicar la aplicación',
    cfPublishBody:
      'En el túnel, abre Public Hostname → Add a public hostname e introduce los valores de abajo. Tipo de servicio: HTTP. Cloudflare crea el registro DNS automáticamente, no necesitas añadir un CNAME.',
    connectedTitle: 'La conexión funciona',
    connectedRecheck: 'Volver a comprobar',
    connectedChange: 'Cambiar el método de conexión',
  },
};

const methodKeys: Record<Method, string> = {
  local: 'local',
  'local-network': 'local',
  'tailscale-funnel': 'funnel',
  ngrok: 'ngrok',
  'cloudflare-quick': 'quick',
  'cloudflare-tunnel': 'cf',
  'direct-proxy': 'direct',
  'existing-proxy': 'existing',
  hosting: 'hosting',
  later: 'later',
};
const methodHelp: Partial<Record<Method, string>> = {
  local: 'localHelp',
  'local-network': 'lanHelp',
  'tailscale-funnel': 'tailscaleHelp',
  ngrok: 'ngrokHelp',
  'cloudflare-quick': 'quickHelp',
  'cloudflare-tunnel': 'domainHelp',
  'direct-proxy': 'domainHelp',
  'existing-proxy': 'domainHelp',
  hosting: 'hostingHelp',
};
const zonePrompt: Record<Language, string> = {
  en: 'DNS zone/root domain containing this hostname (for example example.net)',
  pl: 'Strefa DNS/domena główna zawierająca tę nazwę (np. example.pl)',
  de: 'DNS-Zone/Stammdomain dieses Hostnamens (zum Beispiel example.de)',
  fr: 'Zone DNS/domaine racine contenant ce nom d’hôte (ex. example.fr)',
  es: 'Zona DNS/dominio raíz que contiene este hostname (por ejemplo example.es)',
};
const resumeCopy: Record<Language, Record<string, string>> = {
  en: {
    resumeTitle: 'Resume saved connectivity setup',
    resumeDescription:
      'This address is saved by the setup wizard, but may not be active or verified yet. Choose an action or enter a different address:',
    applyHelp:
      'Applies this as JamRelay’s public address. A running Docker Compose service saves the change and restarts automatically; stop a local Node.js server before applying.',
    verifyHelp:
      'Checks DNS, HTTPS and whether JamRelay responds at this address. This does not change the config file.',
    applyOrigin: 'Apply this as JamRelay’s public address',
    applyRestart: 'Apply address, restart JamRelay and verify endpoint',
    changeOrigin: 'Enter a different public address',
    newOriginPrompt:
      'Enter the full HTTPS hostname used by your Cloudflare Published application route',
    verifyOrigin: 'Check whether JamRelay is reachable here',
    stopFirst:
      'For a local Node.js server, stop JamRelay before applying the saved address. Docker Compose applies the change and restarts the service automatically.',
    startVerify:
      'Start JamRelay, then run jamrelay connectivity again and choose Verify saved endpoint.',
    uuidError: 'The Cloudflare tunnel ID is invalid. Use the UUID shown in Cloudflare.',
    cloudflareDns:
      'Cloudflare creates this CNAME when you add the Published application route. For manual DNS, use the actual tunnel UUID.',
    existingDns:
      'Add only the DNS record specified by your existing proxy provider. Do not guess the target or overwrite an existing record.',
  },
  pl: {
    resumeTitle: 'Wznów zapisaną konfigurację łączności',
    resumeDescription:
      'Ten adres jest zapisany w konfiguracji JamRelay. Nie został pobrany z Cloudflare. Możesz go zastosować, sprawdzić albo wpisać dokładny adres użyty w trasie Cloudflare:',
    applyHelp:
      'Ustawi adres, automatycznie ponownie uruchomi JamRelay i sprawdzi endpoint. Lokalny serwer Node.js trzeba najpierw zatrzymać.',
    verifyHelp:
      'Sprawdzi DNS, HTTPS i czy JamRelay odpowiada pod tym adresem. Nie zmieni pliku konfiguracji.',
    applyOrigin: 'Zastosuj ten adres jako publiczny adres JamRelay',
    applyRestart: 'Zastosuj adres, uruchom ponownie JamRelay i sprawdź endpoint',
    changeOrigin: 'Wpisz inny publiczny adres',
    newOriginPrompt: 'Wpisz pełny adres HTTPS dokładnie taki, jak host w trasie Cloudflare',
    verifyOrigin: 'Sprawdź, czy JamRelay jest dostępny pod tym adresem',
    stopFirst:
      'Lokalny serwer Node.js zatrzymaj przed zastosowaniem adresu. Docker Compose zapisze zmianę i automatycznie uruchomi usługę ponownie.',
    startVerify:
      'Uruchom JamRelay, a potem ponownie wykonaj jamrelay connectivity i wybierz weryfikację endpointu.',
    uuidError:
      'Identyfikator tunelu Cloudflare jest nieprawidłowy. Użyj UUID widocznego w panelu Cloudflare.',
    cloudflareDns:
      'Cloudflare tworzy rekord CNAME po dodaniu trasy Published application. Przy ręcznej konfiguracji DNS użyj prawdziwego UUID tunelu.',
    existingDns:
      'Dodaj tylko rekord DNS wskazany przez używanego dostawcę proxy. Nie zgaduj celu ani nie zastępuj istniejących rekordów.',
  },
  de: {
    resumeTitle: 'Gespeicherte Verbindungseinrichtung fortsetzen',
    resumeDescription:
      'Die Einrichtung hat diese Adresse gespeichert. Sie ist möglicherweise noch nicht aktiv oder geprüft. Wähle eine Aktion:',
    applyHelp:
      'Speichern setzt diese Adresse als PUBLIC_BASE_URL in der Konfigurationsdatei. Stoppe JamRelay vorher und starte es danach neu.',
    verifyHelp:
      'Die Prüfung sendet Anfragen an diese Adresse und testet Health- und MCP-Endpunkt. Die Konfiguration bleibt unverändert.',
    applyOrigin: 'Adresse in der Konfiguration speichern (JamRelay vorher stoppen)',
    verifyOrigin: 'Erreichbarkeit dieser Adresse prüfen',
    stopFirst:
      'Stoppe JamRelay, starte jamrelay connectivity und wähle „Ursprung übernehmen“. Starte JamRelay erneut und wähle danach „Endpunkt prüfen“.',
    startVerify:
      'Starte JamRelay und führe jamrelay connectivity erneut aus. Wähle danach „Endpunkt prüfen“.',
    uuidError: 'Die Cloudflare-Tunnel-ID ist ungültig. Verwende die in Cloudflare angezeigte UUID.',
    cloudflareDns:
      'Cloudflare erstellt diesen CNAME beim Hinzufügen der Published application-Route. Für manuelles DNS nutze die echte Tunnel-UUID.',
    existingDns:
      'Füge nur den DNS-Eintrag hinzu, den dein vorhandener Proxy-Anbieter vorgibt. Rate das Ziel nicht und überschreibe keine bestehenden Einträge.',
  },
  fr: {
    resumeTitle: 'Reprendre la configuration enregistrée',
    resumeDescription:
      'La configuration a enregistré cette adresse. Elle n’est peut-être pas encore active ni vérifiée. Choisissez une action :',
    applyHelp:
      'Enregistrer définit cette adresse comme PUBLIC_BASE_URL dans le fichier de configuration. Arrêtez JamRelay avant, puis redémarrez-le.',
    verifyHelp:
      'La vérification envoie des requêtes à cette adresse et teste les endpoints de santé et MCP. La configuration reste inchangée.',
    applyOrigin: 'Enregistrer cette adresse dans la configuration (arrêtez JamRelay avant)',
    verifyOrigin: 'Vérifier si cette adresse répond',
    stopFirst:
      'Arrêtez JamRelay, lancez jamrelay connectivity et choisissez Appliquer l’origine. Redémarrez JamRelay, relancez la commande et choisissez Vérifier cet endpoint.',
    startVerify:
      'Redémarrez JamRelay, relancez jamrelay connectivity et choisissez Vérifier cet endpoint.',
    uuidError:
      'L’identifiant du tunnel Cloudflare est invalide. Utilisez l’UUID affiché dans Cloudflare.',
    cloudflareDns:
      'Cloudflare crée ce CNAME lors de l’ajout de la route Published application. Pour un DNS manuel, utilisez le véritable UUID du tunnel.',
    existingDns:
      'Ajoutez uniquement l’enregistrement DNS indiqué par votre fournisseur de proxy existant. Ne devinez pas la cible et ne remplacez aucun enregistrement existant.',
  },
  es: {
    resumeTitle: 'Reanudar la configuración guardada',
    resumeDescription:
      'La configuración guardó esta dirección. Puede que aún no esté activa ni verificada. Elige una acción:',
    applyHelp:
      'Guardar establece esta dirección como PUBLIC_BASE_URL en el archivo de configuración. Detén JamRelay antes y reinícialo después.',
    verifyHelp:
      'La comprobación envía solicitudes a esta dirección y prueba los endpoints de salud y MCP. No cambia la configuración.',
    applyOrigin: 'Guardar esta dirección en la configuración (detén JamRelay antes)',
    verifyOrigin: 'Comprobar si esta dirección responde',
    stopFirst:
      'Detén JamRelay, ejecuta jamrelay connectivity y elige Aplicar origen. Reinicia JamRelay, repite el comando y elige Verificar endpoint.',
    startVerify:
      'Inicia JamRelay, vuelve a ejecutar jamrelay connectivity y elige Verificar endpoint.',
    uuidError:
      'El identificador del túnel de Cloudflare no es válido. Usa el UUID que aparece en Cloudflare.',
    cloudflareDns:
      'Cloudflare crea este CNAME al añadir la ruta Published application. Para configurar DNS manualmente, usa el UUID real del túnel.',
    existingDns:
      'Añade solo el registro DNS que indique tu proveedor de proxy actual. No inventes el destino ni sobrescribas otros registros.',
  },
};
const t = (key: string, language = currentLanguage()) =>
  copy[language][key] ?? resumeCopy[language][key] ?? copy.en[key] ?? resumeCopy.en[key] ?? key;

function languageNames(language: Language) {
  return {
    local: t('local', language),
    localNetwork: t('localNetwork', language),
    tailscale: t('funnel', language),
    ngrok: t('ngrok', language),
    quick: t('quick', language),
    own: t('own', language),
    hosting: t('hosting', language),
    later: t('later', language),
  };
}

async function choose(title: string, options: readonly { label: string; value: string }[]) {
  return selectOption(options, 0, (cursor) =>
    menuPanel(
      title,
      options.map((o) => o.label),
      cursor,
    ),
  );
}

async function ask(prompt: string, fallback = '') {
  return (await promptText(prompt, fallback)).trim();
}

async function confirm(prompt: string, language: Language) {
  const value = await choose(prompt, [
    {
      value: 'yes',
      label:
        language === 'pl'
          ? 'Tak'
          : language === 'de'
            ? 'Ja'
            : language === 'fr'
              ? 'Oui'
              : language === 'es'
                ? 'Sí'
                : 'Yes',
    },
    {
      value: 'no',
      label:
        language === 'pl'
          ? 'Nie'
          : language === 'de'
            ? 'Nein'
            : language === 'fr'
              ? 'Non'
              : language === 'es'
                ? 'No'
                : 'No',
    },
  ]);
  return value === 'yes';
}

export function normalizeDomain(value: string) {
  const raw = value.trim().replace(/\.$/, '');
  if (!raw || raw.includes('://') || raw.includes('/') || raw.includes(':') || raw.includes('*'))
    return undefined;
  const ascii = domainToASCII(raw).toLowerCase();
  if (!ascii || ascii.length > 253 || !ascii.includes('.')) return undefined;
  if (/\.(local|localhost|test|example|invalid|arpa)$/.test(ascii)) return undefined;
  const labels = ascii.split('.');
  if (
    labels.some(
      (label) => !label || label.length > 63 || !/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(label),
    )
  )
    return undefined;
  if (isIP(ascii)) return undefined;
  return ascii;
}

export function recordNameForHost(host: string, zone: string) {
  const normalizedHost = normalizeDomain(host);
  const normalizedZone = normalizeDomain(zone);
  if (!normalizedHost || !normalizedZone) return undefined;
  if (normalizedHost === normalizedZone) return '@';
  if (normalizedHost.endsWith(`.${normalizedZone}`))
    return normalizedHost.slice(0, -(normalizedZone.length + 1));
  return undefined;
}

export function tunnelDnsTarget(uuid: string) {
  const id = uuid.trim().toLowerCase();
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(id)
    ? `${id}.cfargotunnel.com`
    : undefined;
}

function safeOrigin(value: string, secure: boolean) {
  try {
    const url = new URL(value.trim());
    if (url.username || url.password || url.pathname !== '/' || url.search || url.hash)
      return undefined;
    if (secure && url.protocol !== 'https:') return undefined;
    if (!secure && !['http:', 'https:'].includes(url.protocol)) return undefined;
    if (!url.hostname || (secure && isIP(url.hostname))) return undefined;
    return url.origin;
  } catch {
    return undefined;
  }
}

function privateLanAddress(value: string) {
  const host = value
    .trim()
    .replace(/^\[|\]$/g, '')
    .toLowerCase();
  const version = isIP(host);
  if (version === 4) {
    const [a, b] = host.split('.').map(Number);
    return a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168);
  }
  return version === 6 && (/^(fc|fd|fe8)/.test(host) || host === '::1');
}

export async function verifyEndpoint(origin: string, local = false): Promise<Checks> {
  const url = new URL(origin);
  const localHttp =
    local &&
    url.protocol === 'http:' &&
    (isLoopbackHttp(origin) || privateLanAddress(url.hostname));
  let target = new URL(probeOrigin(origin));
  let dns: boolean | null = localHttp ? null : isIP(url.hostname) !== 0;
  if (dns === false) {
    try {
      await Promise.any([resolve4(url.hostname), resolve6(url.hostname)]);
      dns = true;
    } catch {
      dns = false;
    }
  }
  let health = false;
  let https: boolean | null = localHttp ? null : false;
  void local;
  for (const candidate of probeOrigins(origin)) {
    target = new URL(candidate);
    try {
      const response = await fetch(new URL('/health', target), {
        signal: AbortSignal.timeout(8000),
        redirect: 'manual',
      });
      const body = (await response.json().catch(() => null)) as {
        status?: string;
        version?: string;
        database?: { schemaState?: string };
      } | null;
      health =
        response.status === 200 &&
        body?.status === 'ok' &&
        body.version === APP_VERSION &&
        body.database?.schemaState === 'current';
      if (url.protocol === 'https:') https = response.status > 0;
    } catch {
      /* DNS, TLS, firewall, proxy and tunnel errors are reported below. */
    }
    if (health) break;
  }
  let mcpProtected = false;
  try {
    const response = await fetch(new URL('/mcp', target), {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: 'application/json, text/event-stream',
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 'jamrelay-connectivity-check',
        method: 'initialize',
        params: {
          protocolVersion: '2025-03-26',
          capabilities: {},
          clientInfo: { name: 'jamrelay-connectivity-check', version: '1' },
        },
      }),
      signal: AbortSignal.timeout(8000),
      redirect: 'manual',
    });
    mcpProtected = response.status === 401;
  } catch {
    /* summarized as a failed MCP check */
  }
  let oauthDiscovery = false;
  try {
    const response = await fetch(new URL('/.well-known/oauth-authorization-server', target), {
      signal: AbortSignal.timeout(8000),
      redirect: 'manual',
    });
    const metadata = (await response.json().catch(() => null)) as { issuer?: string } | null;
    oauthDiscovery = response.status === 200 && metadata?.issuer === origin;
  } catch {
    /* Discovery remains unverified when it cannot be reached. */
  }
  let oauthRedirects: boolean | null = null;
  try {
    const configured = readSettings(installationPaths().config);
    const expected = providerRedirectUris(origin);
    const active = [
      ['SPOTIFY_CLIENT_ID', 'SPOTIFY_REDIRECT_URI', expected.spotify],
      ['SOUNDCLOUD_CLIENT_ID', 'SOUNDCLOUD_REDIRECT_URI', expected.soundcloud],
      ['YOUTUBE_CLIENT_ID', 'YOUTUBE_REDIRECT_URI', expected.youtube],
    ] as const;
    const providers = active.filter(([id]) => Boolean(configured[id]));
    oauthRedirects = providers.length
      ? providers.every(([, redirect, uri]) => configured[redirect] === uri)
      : null;
  } catch {
    oauthRedirects = null;
  }
  return { dns, https, health, mcpProtected, oauthDiscovery, oauthRedirects };
}

export function providerRedirectUris(origin: string) {
  const u = new URL(origin);
  const spotifyOrigin = ['localhost', '[::1]'].includes(u.hostname)
    ? `http://127.0.0.1:${u.port || '80'}`
    : origin;
  return {
    spotify: `${spotifyOrigin}/auth/providers/spotify/callback`,
    soundcloud: `${origin}/auth/providers/soundcloud/callback`,
    youtube: `${origin}/auth/providers/youtube/callback`,
  };
}

async function confirmOriginChange(origin: string, local: boolean, language: Language) {
  if (local) return true;
  const settings = readSettings(installationPaths().config);
  const previous = effectiveBaseUrl(settings);
  const configured = ['SPOTIFY_CLIENT_ID', 'SOUNDCLOUD_CLIENT_ID', 'YOUTUBE_CLIENT_ID'].some(
    (key) => Boolean(settings[key]),
  );
  if (!configured || previous === origin) return true;
  const callbacks = providerRedirectUris(origin);
  showPanel(
    t('redirectChanged', language),
    `${t('redirectChanged', language)}\n\nSpotify: ${callbacks.spotify}\nSoundCloud: ${callbacks.soundcloud}\nYouTube: ${callbacks.youtube}`,
  );
  if (await confirm(t('continue', language), language)) return true;
  showPanel(t('redirectCancelled', language), t('redirectCancelled', language));
  return false;
}

async function confirmAdvancedMode(language: Language) {
  showPanel(t('advancedWarningTitle', language), t('advancedWarning', language));
  return confirm(t('continue', language), language);
}

async function saveOrigin(origin: string, exposeToLan = false) {
  const paths = loadInstallation();
  const current = readSettings(paths.config);
  if (effectiveBaseUrl(current) === origin && (!exposeToLan || current.HOST === '0.0.0.0')) return;
  if (
    process.env.PUBLIC_BASE_URL &&
    process.env.PUBLIC_BASE_URL !== current.PUBLIC_BASE_URL &&
    process.env.PUBLIC_BASE_URL !== origin
  )
    throw new Error(
      'PUBLIC_BASE_URL is set in the environment. Update that environment value before using the saved origin.',
    );
  const nextSettings: Record<string, string> = { PUBLIC_BASE_URL: origin };
  if (exposeToLan) nextSettings.HOST = '0.0.0.0';
  let release: (() => void) | undefined;
  try {
    release = await lockInstallation(paths.config);
  } catch (error) {
    if (
      process.env.JAMRELAY_INSTALL_MODE !== 'docker' ||
      !isContainer() ||
      !(error instanceof Error) ||
      error.message !== INSTALLATION_LOCKED_MESSAGE
    )
      throw error;
    const pending = queueSettingsRestart(paths.config, nextSettings);
    let stopLoading = showLoadingPanel(
      t('restartTitle', currentLanguage()),
      t('restartApplying', currentLanguage()),
    );
    try {
      const deadline = Date.now() + 30_000;
      let result: ReturnType<typeof readSettingsRestartResult>;
      while (Date.now() < deadline) {
        result = readSettingsRestartResult(pending.result);
        if (result?.id === pending.id) {
          if (!result.ok) throw new Error(result.message || t('restartFailed', currentLanguage()));
          break;
        }
        await new Promise((resolve) => setTimeout(resolve, 250));
      }
      if (!result || result.id !== pending.id) {
        try {
          if (
            existsSync(pending.request) &&
            (JSON.parse(readFileSync(pending.request, 'utf8')) as { id?: string }).id === pending.id
          )
            unlinkSync(pending.request);
        } catch {
          // Keep a request that may already have been claimed by the server.
        }
        throw new Error(t('restartNoAck', currentLanguage()));
      }
      unlinkSync(pending.result);
      stopLoading();
      stopLoading = showLoadingPanel(
        t('restartTitle', currentLanguage()),
        t('restartChecking', currentLanguage()),
      );
      const service = process.env.JAMRELAY_SERVICE_URL || localBaseUrl();
      const restartDeadline = Date.now() + 90_000;
      let online = false;
      while (Date.now() < restartDeadline && !online) {
        try {
          const response = await fetch(new URL('/health', service), {
            signal: AbortSignal.timeout(3000),
            redirect: 'manual',
          });
          online = response.status === 200;
        } catch {
          await new Promise((resolve) => setTimeout(resolve, 500));
        }
      }
      if (!online) throw new Error(t('restartFailed', currentLanguage()));
    } finally {
      stopLoading();
    }
  }
  if (release) {
    try {
      const settings = readSettings(paths.config);
      settings.PUBLIC_BASE_URL = origin;
      if (exposeToLan) settings.HOST = '0.0.0.0';
      saveSettings(paths.config, settings);
    } finally {
      release();
    }
  }
  process.env.PUBLIC_BASE_URL = origin;
  if (exposeToLan) process.env.HOST = '0.0.0.0';
}

async function persist(
  method: Method,
  origin: string | null,
  status: 'local' | 'pending' | 'verified',
  domain: string | null,
  dnsProvider: string | null,
  registrar: string | null,
  checks: Checks = {
    dns: false,
    https: false,
    health: false,
    mcpProtected: false,
    oauthDiscovery: false,
    oauthRedirects: null,
  },
  zone: string | null = null,
) {
  await changeState((state) => {
    state.connectivity = {
      method,
      origin,
      status,
      domain,
      zone,
      dnsProvider,
      registrar,
      checks,
      checkedAt: status === 'verified' || status === 'local' ? new Date().toISOString() : null,
    };
  });
}

async function maybeOpen(url: string, language: Language) {
  showPanel(t('offerBrowser', language), `${t('offerBrowser', language)}\n${terminalLink(url)}`);
  const action = await choose(t('offerBrowser', language), [
    { value: 'open', label: t('open', language) },
    { value: 'show', label: t('show', language) },
  ]);
  if (action === 'open' && !(await openUrl(url))) showPanel(t('offerBrowser', language), url);
}

function printReadyChecks(checks: Checks, language: Language, pending = false, local = false) {
  const rows = [
    [checks.dns, 'dnsOk', 'dnsBad'],
    [checks.https, 'httpsOk', 'httpsBad'],
    [checks.health, 'healthOk', 'healthBad'],
    [checks.mcpProtected, 'mcpOk', 'mcpBad'],
    [checks.oauthDiscovery, 'oauthDiscoveryOk', 'oauthDiscoveryBad'],
    [checks.oauthRedirects, 'oauthRedirectsOk', 'oauthRedirectsBad'],
  ] as const;
  showPanel(
    t('checkTitle', language),
    rows
      .map(([condition, okKey, badKey]) => {
        if (condition === null) {
          const notApplicable = local && (okKey === 'dnsOk' || okKey === 'httpsOk');
          const label =
            okKey === 'dnsOk'
              ? 'DNS'
              : okKey === 'httpsOk'
                ? 'TLS'
                : t('oauthNotApplicable', language);
          return `${notApplicable ? t('statusNotApplicable', language) : t('statusNotChecked', language)} — ${label}`;
        }
        const state = condition
          ? t('statusVerified', language)
          : pending
            ? t('statusPending', language)
            : t('statusFailed', language);
        return `${condition ? '✓' : pending ? '…' : '✗'} ${state} — ${t(condition ? okKey : badKey, language)}`;
      })
      .join('\n'),
  );
}

async function verifyAndSave(
  method: Method,
  origin: string,
  domain: string | null,
  dnsProvider: string | null,
  registrar: string | null,
  language: Language,
  local = false,
  zone: string | null = null,
  confirmChange = true,
) {
  if (confirmChange && !(await confirmOriginChange(origin, local, language))) return false;
  // The server advertises its OAuth issuer from PUBLIC_BASE_URL at startup, so the origin
  // must be in the configuration before endpoint checks can pass. Saving is a no-op when the
  // origin is already active, so a running server only blocks changes that need a restart.
  try {
    await saveOrigin(origin, method === 'local-network');
  } catch (error) {
    if (!(error instanceof Error) || !error.message.includes('JamRelay is running')) throw error;
    await persist(method, origin, 'pending', domain, dnsProvider, registrar, undefined, zone);
    showPanel(
      t('saved', language),
      `${t('saved', language)}\nJamRelay is running with the previous address. Stop it, run jamrelay onboard and choose this address again to save it, then start JamRelay and verify.`,
    );
    return false;
  }
  const checks = await verifyEndpoint(origin, local);
  printReadyChecks(checks, language, false, local);
  const verified =
    checks.dns !== false &&
    checks.https !== false &&
    checks.health &&
    checks.mcpProtected &&
    checks.oauthDiscovery &&
    checks.oauthRedirects !== false;
  const checkMessages: Array<[keyof Checks, string]> = [
    ['dns', 'dnsBad'],
    ['https', 'httpsBad'],
    ['health', 'healthBad'],
    ['mcpProtected', 'mcpBad'],
    ['oauthDiscovery', 'oauthDiscoveryBad'],
    ['oauthRedirects', 'oauthRedirectsBad'],
  ];
  const failedChecks = checkMessages
    .filter(([key]) => checks[key] === false)
    .map(([, message]) => t(message, language));
  await persist(
    method,
    origin,
    verified ? (local ? 'local' : 'verified') : 'pending',
    domain,
    dnsProvider,
    registrar,
    checks,
    zone,
  );
  if (!verified) {
    showPanel(
      t('pending', language),
      `${t('recovery', language)}${failedChecks.length ? `\n\n${t('failedChecks', language)}:\n• ${failedChecks.join('\n• ')}` : ''}\n\n${t('errors', language)}${process.env.JAMRELAY_INSTALL_MODE === 'docker' && isLoopbackHttp(origin) ? `\nProbe from Docker: ${probeOrigin(origin)}. On the host run docker compose up -d --wait; check that both containers share the Compose network. Client URL: ${origin}/mcp.` : ''}`,
    );
    return false;
  }
  let result = `✓ ${t(local ? 'localReady' : 'ready', language)}\n${t('mcpEndpoint', language)}: ${origin}/mcp\nOwner login: ${origin}/owner/login\nOAuth discovery: ${origin}/.well-known/oauth-authorization-server\nProtected resource: ${origin}/.well-known/oauth-protected-resource`;
  if (!local) {
    const cb = providerRedirectUris(origin);
    result += `\n\n${t('callbacks', language)}\nSpotify: ${cb.spotify}\nSoundCloud: ${cb.soundcloud}\nYouTube: ${cb.youtube}\n${t('apple', language)}`;
  }
  result += `\n\n${t('ownerCosts', language)}`;
  showPanel(t('ready', language), result);
  return true;
}

async function domainInfo(language: Language, advanced: boolean, method: DomainMethod) {
  let zone = '';
  while (!zone) {
    zone = normalizeDomain(await ask(t('domainBase', language))) ?? '';
    if (!zone) showPanel(t('invalidDomain', language), t('invalidDomain', language));
  }
  const hostChoice = advanced
    ? await choose(t('hostnameChoice', language), [
        { value: 'mcp', label: t('hostnameMcp', language) },
        { value: 'custom-subdomain', label: t('hostnameCustom', language) },
        { value: 'root', label: t('hostnameRoot', language) },
        { value: 'full-origin', label: t('hostnameFull', language) },
      ])
    : 'custom-subdomain';
  if (!hostChoice) throw new Error('Setup cancelled.');
  let domain: string;
  let origin: string | null = null;
  if (hostChoice === 'full-origin') {
    while (!origin) {
      origin = safeOrigin(await ask(t('customOrigin', language)), true) ?? null;
      if (!origin) showPanel(t('invalidOrigin', language), t('invalidOrigin', language));
    }
    domain = new URL(origin).hostname;
    if (!recordNameForHost(domain, zone)) {
      let adjustedZone = '';
      while (!recordNameForHost(domain, adjustedZone)) {
        adjustedZone = normalizeDomain(await ask(zonePrompt[language])) ?? '';
        if (!recordNameForHost(domain, adjustedZone))
          showPanel(t('invalidDomain', language), t('invalidDomain', language));
      }
      zone = adjustedZone;
    }
  } else if (hostChoice === 'root') domain = zone;
  else {
    const subdomain =
      hostChoice === 'mcp'
        ? 'mcp'
        : (
            await promptText(t('subdomainPrompt', language), '', {
              context: (value) =>
                `${t('domainPreview', language)}: ${value.trim() ? (normalizeDomain(`${value}.${zone}`) ?? zone) : zone}`,
            })
          ).trim();
    domain = subdomain ? (normalizeDomain(`${subdomain}.${zone}`) ?? '') : zone;
    if (!domain) {
      showPanel(t('invalidDomain', language), t('invalidDomain', language));
      return domainInfo(language, advanced, method);
    }
  }
  showPanel(t('hostnameChoice', language), `${domain}${origin ? `\n${origin}` : ''}`);
  let selectedProvider: string | null = method === 'cloudflare-tunnel' ? 'Cloudflare' : null;
  if (advanced && method !== 'cloudflare-tunnel') {
    showPanel(t('dnsExplain', language), t('dnsExplain', language));
    const dnsProvider = await choose(t('dnsProviderChoice', language), [
      { value: 'Cloudflare', label: t('dnsCloudflare', language) },
      { value: 'OVHcloud', label: t('dnsOvh', language) },
      { value: 'Route 53', label: t('dnsRoute53', language) },
      { value: 'other', label: t('dnsOther', language) },
      { value: 'unknown', label: t('dnsUnknown', language) },
      { value: 'manual', label: t('dnsManual', language) },
    ]);
    if (!dnsProvider) throw new Error('Setup cancelled.');
    selectedProvider =
      dnsProvider === 'other' ? await ask(t('dnsProvider', language)) : dnsProvider;
  }
  return {
    domain,
    zone,
    origin,
    dnsProvider: selectedProvider || null,
    registrar: null,
  };
}

async function printRecord(name: string, type: string, value: string, language: Language) {
  const proxy = t(type === 'CNAME' ? 'proxyAutomatic' : 'proxyProvider', language);
  showPanel(
    t('proposed', language),
    `${t('type', language)} | ${t('name', language)} | ${t('value', language)} | ${t('proxyStatus', language)}\n${type} | ${name} | ${value} | ${proxy}`,
  );
}

async function configureCloudflareTunnel(
  domain: string,
  zone: string,
  dnsProvider: string | null,
  registrar: string | null,
  language: Language,
  publicOrigin?: string | null,
  advanced = true,
) {
  const host = domain;
  const subdomain = recordNameForHost(host, zone)!;
  // If the connector runs in Docker on this host, attach it to the JamRelay network and use the
  // service name. Inside the JamRelay container this is impossible, so the user chooses the route.
  const environment = await detectEnvironment();
  const connectorAttached = await attachConnectorToNetwork(environment);
  const placement = connectorAttached
    ? 'docker'
    : advanced || process.env.JAMRELAY_INSTALL_MODE === 'docker'
      ? await choose(t('dockerNetwork', language), [
          { value: 'host', label: t('host', language) },
          { value: 'docker', label: t('sameDocker', language) },
        ])
      : 'host';
  if (!placement) throw new Error('Setup cancelled.');
  const origin = placement === 'docker' ? 'http://jamrelay:5267' : localBaseUrl();
  const result = (routeConfigured: boolean) => ({
    method: 'cloudflare-tunnel' as const,
    origin: publicOrigin ?? `https://${host}`,
    domain: host,
    dnsProvider: 'Cloudflare',
    registrar,
    routeConfigured,
  });
  // Opening the dashboard must not replace these instructions. When no host browser can be
  // launched (always the case inside Docker), the clickable address is appended instead.
  const openDashboard = async (redraw: (note: string) => void) => {
    const opened = await openUrl(PORTAL.cloudflareTunnels);
    redraw(opened ? '' : terminalLink(PORTAL.cloudflareTunnels));
  };
  // Step 1: the tunnel is created in the Cloudflare dashboard and its connector runs on this computer.
  const createPanel = (note = isContainer() ? terminalLink(PORTAL.cloudflareTunnels) : '') =>
    showPanel(
      t('cfCreateTitle', language),
      `${t('cfCreateBody', language)}${note ? `\n\n${note}` : ''}`,
    );
  createPanel();
  let connected = false;
  for (;;) {
    const action = await choose(t('cfCreateTitle', language), [
      ...(isContainer() ? [] : [{ value: 'open', label: t('cloudflareRouteOpen', language) }]),
      { value: 'connected', label: t('continue', language) },
      { value: 'later', label: t('continueLater', language) },
    ]);
    if (action === 'open') {
      await openDashboard(createPanel);
      continue;
    }
    connected = action === 'connected';
    break;
  }
  if (!connected) return result(false);
  // Step 2: the published hostname creates the DNS record in Cloudflare; no CNAME is needed here.
  const serviceUrl = origin.replace(/\/$/, '');
  const publishPanel = (note = isContainer() ? terminalLink(PORTAL.cloudflareTunnels) : '') =>
    showPanel(
      t('cfPublishTitle', language),
      `${t('cfPublishBody', language)}\n\n${t('cloudflareSubdomain', language)}: ${subdomain === '@' ? '(leave empty)' : subdomain}\n${t('cloudflareDomain', language)}: ${zone}\n${t('cloudflareFullHostname', language)}: ${host}\n${t('cloudflareServiceUrl', language)}: ${serviceUrl}${note ? `\n\n${note}` : ''}`,
    );
  publishPanel();
  let routeConfigured = false;
  for (;;) {
    const action = await choose(t('cfPublishTitle', language), [
      ...(isContainer() ? [] : [{ value: 'open', label: t('cloudflareRouteOpen', language) }]),
      { value: 'done', label: t('cloudflareRouteDone', language) },
      { value: 'later', label: t('cloudflareRouteLater', language) },
    ]);
    if (action === 'open') {
      await openDashboard(publishPanel);
      continue;
    }
    routeConfigured = action === 'done';
    break;
  }
  return result(routeConfigured);
}

async function configureDirectProxy(
  domain: string,
  zone: string,
  dnsProvider: string | null,
  registrar: string | null,
  language: Language,
  publicOrigin?: string | null,
) {
  let valid4 = '';
  while (!valid4) {
    const ipv4 = await ask(t('publicIp', language));
    if (!ipv4) break;
    if (isIP(ipv4) === 4) valid4 = ipv4;
    else showPanel(t('invalidDomain', language), t('publicIp', language));
  }
  let valid6 = '';
  while (!valid6) {
    const ipv6 = await ask(t('publicIpv6', language));
    if (!ipv6) break;
    if (isIP(ipv6) === 6) valid6 = ipv6;
    else showPanel(t('invalidDomain', language), t('publicIpv6', language));
  }
  const label = recordNameForHost(domain, zone) ?? domain;
  if (valid4) await printRecord(label, 'A', valid4, language);
  if (valid6) await printRecord(label, 'AAAA', valid6, language);
  showPanel(
    t('directDns', language),
    `${!valid4 && !valid6 ? `${t('noIp', language)}\n\n` : ''}${t('directDns', language)}\n\n${t('errors', language)}`,
  );
  const placement = await choose(t('dockerNetwork', language), [
    { value: 'host', label: t('host', language) },
    { value: 'docker', label: t('sameDocker', language) },
  ]);
  const upstream = placement === 'docker' ? 'jamrelay:5267' : new URL(localBaseUrl()).host;
  const proxy = await choose(t('domainMethod', language), [
    { value: 'caddy', label: 'Caddy' },
    { value: 'nginx', label: 'Nginx' },
    { value: 'manual', label: t('manualProxy', language) },
  ]);
  const publicPort = publicOrigin ? new URL(publicOrigin).port : '';
  const listenPort = publicPort || '443';
  let generatedConfiguration = '';
  if (proxy === 'caddy') {
    generatedConfiguration = `${domain}${publicPort ? `:${publicPort}` : ''} {\n    reverse_proxy ${upstream}\n}\n`;
    showPanel(
      'Caddy',
      `${t('caddyConfig', language)}\n\n${generatedConfiguration}\n${t('caddyPorts', language)}`,
    );
    await maybeOpen(PORTAL.caddy, language);
  } else if (proxy === 'nginx') {
    let certificate = '';
    while (!certificate) {
      const value = await ask(t('nginxCertificate', language));
      if (isAbsolute(value) && !/[\r\n";]/.test(value)) certificate = value;
      else showPanel(t('invalidDomain', language), t('nginxCertificate', language));
    }
    let privateKey = '';
    while (!privateKey) {
      const value = await ask(t('nginxPrivateKey', language));
      if (isAbsolute(value) && !/[\r\n";]/.test(value)) privateKey = value;
      else showPanel(t('invalidDomain', language), t('nginxPrivateKey', language));
    }
    const nginxPath = (value: string) => `"${value.replace(/\\/g, '\\\\')}"`;
    generatedConfiguration = `server {\n    listen ${listenPort} ssl;\n    server_name ${domain};\n    ssl_certificate ${nginxPath(certificate)};\n    ssl_certificate_key ${nginxPath(privateKey)};\n\n    location / {\n        proxy_pass http://${upstream};\n        proxy_http_version 1.1;\n        proxy_set_header Host $host;\n        proxy_set_header X-Forwarded-Host $host;\n        proxy_set_header X-Forwarded-Proto $scheme;\n        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;\n        proxy_buffering off;\n        proxy_read_timeout 3600s;\n    }\n}\n`;
    showPanel(
      'Nginx',
      `${t('nginxConfig', language)}\n\n${generatedConfiguration}\n${t('nginxPorts', language)}`,
    );
    await maybeOpen(PORTAL.nginx, language);
  } else {
    showPanel(
      t('manualProxy', language),
      `${t('manualProxy', language)}\nHostname: ${domain}\nUpstream: http://${upstream}\nPublic HTTPS port: ${listenPort}\nForward Host and X-Forwarded-Proto, disable response buffering, preserve long-lived HTTP requests and use a valid certificate.`,
    );
  }
  if (generatedConfiguration) await offerProxySave(generatedConfiguration, language);
  return {
    method: 'direct-proxy' as const,
    origin: publicOrigin ?? `https://${domain}${publicPort ? `:${publicPort}` : ''}`,
    domain,
    dnsProvider,
    registrar,
  };
}

async function offerProxySave(configuration: string, language: Language) {
  if (isContainer()) {
    showPanel(
      t('dockerProxySave', language),
      `${t('dockerProxySave', language)}\n\n${configuration}`,
    );
    return;
  }
  if (!(await confirm(t('saveProxy', language), language))) return;
  const target = resolvePath(await ask(t('proxyFilePath', language)));
  try {
    writeFileSync(target, configuration, { flag: 'wx', mode: 0o600 });
    showPanel(t('proxySaved', language), `${t('proxySaved', language)}: ${target}`);
  } catch {
    showPanel(t('proxySaveFailed', language), t('proxySaveFailed', language));
  }
}

async function configureExistingProxy(
  domain: string,
  zone: string,
  dnsProvider: string | null,
  registrar: string | null,
  language: Language,
  publicOrigin?: string | null,
) {
  const target = await ask(t('cnameTarget', language));
  if (target) await printRecord(recordNameForHost(domain, zone)!, 'CNAME', target, language);
  else
    showPanel(
      t('directDns', language),
      `${t('directDns', language)}\n${t('existingDns', language)}`,
    );
  showPanel(
    t('existingSteps', language),
    `${t('existingSteps', language)}\n\n${t('errors', language)}`,
  );
  return {
    method: 'existing-proxy' as const,
    origin: publicOrigin ?? `https://${domain}`,
    domain,
    dnsProvider,
    registrar,
  };
}

async function enterAndVerify(
  method: Method,
  hint: string,
  domain: string | null,
  dnsProvider: string | null,
  registrar: string | null,
  language: Language,
  local = false,
  zone: string | null = null,
) {
  let origin = '';
  while (!origin) {
    origin = safeOrigin(await ask(t('enterOrigin', language), hint), !local) ?? '';
    if (!origin) showPanel(t('invalidOrigin', language), t('invalidOrigin', language));
  }
  // verifyAndSave persists failed checks as pending and leaves recovery steps on screen.
  // A second yes/no prompt here used to ask the user to save the same state again.
  await verifyAndSave(method, origin, domain, dnsProvider, registrar, language, local, zone);
}

async function methodInstructions(method: Method, language: Language) {
  const details = copy[language];
  const localPort = new URL(localBaseUrl()).port || '80';
  if (method === 'tailscale-funnel') {
    showPanel(
      t('funnel', language),
      `${details.tailscaleHelp}\n\n1. ${terminalLink(PORTAL.tailscale)}\n2. Install Tailscale on the machine running JamRelay and sign in. Funnel on a machine running Tailscale is public internet exposure; Serve alone is private to your tailnet.\n3. Start JamRelay. On the host run:\n\n   tailscale funnel --bg --https=443 http://127.0.0.1:${localPort}\n   tailscale funnel status\n\n4. Approve Funnel if prompted. The hostname is assigned by your tailnet; do not invent it. Funnel requires MagicDNS, HTTPS certificates and policy permission. Allowed public listener ports are 443, 8443 and 10000.`,
    );
    await maybeOpen(PORTAL.tailscale, language);
    return;
  }
  if (method === 'ngrok') {
    showPanel(
      'ngrok',
      `${details.ngrokHelp}\n\n1. ${terminalLink(PORTAL.ngrok)}\n2. Install the agent from ${PORTAL.ngrokInstall} and add your own token locally with ngrok config add-authtoken (never paste the token into JamRelay or logs).\n3. Start JamRelay, then run on the host: ngrok http ${localPort}.\n4. Copy the assigned HTTPS URL from the agent output. The free plan interstitial may block OAuth/MCP clients; verify before relying on it.`,
    );
    await maybeOpen(PORTAL.ngrok, language);
    return;
  }
  if (method === 'cloudflare-quick') {
    const port = localPort;
    const upstream =
      process.env.JAMRELAY_INSTALL_MODE === 'docker' ? `127.0.0.1:${port}` : `127.0.0.1:${port}`;
    showPanel(
      t('quick', language),
      `${details.quickHelp}\n\nStart JamRelay, then run cloudflared on the host (not inside the JamRelay container):\n\n  cloudflared tunnel --url http://${upstream}\n\nCopy the random https://…trycloudflare.com URL from cloudflared. Keep that process running. It changes when restarted and is not a persistent OAuth address.`,
    );
    return;
  }
  if (method === 'hosting')
    showPanel(
      t('hosting', language),
      `${details.hostingHelp}\n\n${details.ownerCosts}\nUse your host provider's persistent service/container manager. Keep /data (Docker) or the JamRelay data directory on persistent storage. Check provider-specific port and storage behavior before deploying.`,
    );
}

function currentMethodLabel(method: string | null, language: Language) {
  if (!method || !Object.hasOwn(methodKeys, method)) return t('unknown', language);
  return t(methodKeys[method as Method], language);
}

export async function showConnectivityStatus(json = false) {
  loadInstallation();
  const language = currentLanguage();
  setTuiContext({ step: null, total: null, language });
  const state = readState().connectivity;
  if (json) {
    console.log(JSON.stringify({ ...state, method: state.method }, null, 2));
    return state.status === 'verified' || state.status === 'local' ? 0 : 1;
  }
  const origin = state.method === 'local' ? localBaseUrl() : state.origin;
  showPanel(
    t('status', language),
    `${t('status', language)}\n  ${t('method', language)}: ${currentMethodLabel(state.method, language)}\n  ${t('origin', language)}: ${origin ?? t('unknown', language)}\n  ${t('lastCheck', language)}: ${state.checkedAt ?? t('unknown', language)}\n  ${t('mcpEndpoint', language)}: ${origin ? `${origin}/mcp` : t('unknown', language)}\n`,
  );
  if (origin && state.status !== 'pending') {
    const checks = await verifyEndpoint(origin, state.status === 'local');
    printReadyChecks(checks, language);
    return Object.values(checks).every((value) => value !== false) ? 0 : 1;
  }
  return 1;
}

export function isConnectivityConfigured() {
  const state = readState().connectivity;
  return state.status === 'verified' || state.status === 'local';
}

export async function configureConnectivity(options: { initialSetup?: boolean } = {}) {
  if (!stdin.isTTY || !stdout.isTTY) throw new Error(t('noTty'));
  loadInstallation();
  const language = currentLanguage();
  clearScreen();
  const current = readState().connectivity;
  // The mode and route menus are choices, not configuration steps. Show progress
  // only after the user has chosen a concrete route.
  setTuiContext({ step: null, total: null, language });
  if (current.method)
    showPanel(
      t('status', language),
      `${t('status', language)}: ${currentMethodLabel(current.method, language)} — ${t(current.status === 'pending' ? 'statusPending' : current.status === 'verified' ? 'statusVerified' : 'statusLocal', language)}\n`,
    );
  if ((current.status === 'verified' || current.status === 'local') && current.origin) {
    showPanel(t('connectedTitle', language), `${t('origin', language)}: ${current.origin}/mcp`);
    const next = await choose(t('connectedTitle', language), [
      { value: 'recheck', label: t('connectedRecheck', language) },
      { value: 'change', label: t('connectedChange', language) },
      { value: 'back', label: t('back', language) },
    ]);
    if (!next || next === 'back') return;
    if (next === 'recheck') {
      await verifyAndSave(
        current.method ?? 'existing-proxy',
        current.origin,
        current.domain,
        current.dnsProvider,
        current.registrar,
        language,
        current.status === 'local',
        current.zone,
        false,
      );
      return;
    }
  }
  if (current.status === 'pending' && current.origin) {
    showPanel(
      t('resumeTitle', language),
      `${t('resumeDescription', language)}\n\n${t('origin', language)}: ${current.origin}\n\n${t('applyOrigin', language)}\n${t('applyHelp', language)}\n\n${t('verifyOrigin', language)}\n${t('verifyHelp', language)}`,
    );
    const resume = await choose(t('resumeTitle', language), [
      {
        value: 'apply',
        label: t(
          process.env.JAMRELAY_INSTALL_MODE === 'docker' ? 'applyRestart' : 'applyOrigin',
          language,
        ),
      },
      { value: 'verify', label: t('verifyOrigin', language) },
      { value: 'change', label: t('changeOrigin', language) },
      { value: 'new', label: t('back', language) },
    ]);
    if (resume === 'apply') {
      await verifyAndSave(
        current.method ?? 'existing-proxy',
        current.origin,
        current.domain,
        current.dnsProvider,
        current.registrar,
        language,
        current.method === 'local',
        current.zone,
        false,
      );
      return;
    }
    if (resume === 'change') {
      let origin = '';
      while (!origin) {
        origin = safeOrigin(await ask(t('newOriginPrompt', language)), true) ?? '';
        if (!origin) showPanel(t('invalidOrigin', language), t('invalidOrigin', language));
      }
      const domain = new URL(origin).hostname;
      const method = current.method ?? 'existing-proxy';
      await persist(
        method,
        origin,
        'pending',
        domain,
        current.dnsProvider,
        current.registrar,
        undefined,
        null,
      );
      await verifyAndSave(
        method,
        origin,
        domain,
        current.dnsProvider,
        current.registrar,
        language,
        current.method === 'local',
        null,
        false,
      );
      return;
    }
    if (resume === 'verify') {
      await verifyAndSave(
        current.method ?? 'existing-proxy',
        current.origin,
        current.domain,
        current.dnsProvider,
        current.registrar,
        language,
        current.method === 'local',
        current.zone,
      );
      return;
    }
    if (!resume) return;
  }
  const labels = languageNames(language);
  let mode: string | undefined = process.env.JAMRELAY_SETUP_MODE;
  delete process.env.JAMRELAY_SETUP_MODE;
  // Older setups saved a "quick" mode; it now maps to the standard flow.
  if (mode === 'quick') mode = 'standard';
  let selected: string | undefined;
  while (!selected) {
    if (!mode) {
      showPanel(t('modeTitle', language), t('networkSummary', language));
      mode = await choose(t('modeTitle', language), [
        { value: 'standard', label: t('standardMode', language) },
        { value: 'advanced', label: t('advancedMode', language) },
      ]);
      if (!mode) return;
    }
    if (mode === 'advanced' && !(await confirmAdvancedMode(language))) {
      mode = undefined;
      continue;
    }
    selected = await choose(
      t('title', language),
      mode === 'standard'
        ? [
            { value: 'cloudflare-tunnel', label: t('tunnelChoice', language) },
            { value: 'local', label: t('localhostChoice', language) },
            { value: 'local-network', label: t('privateChoice', language) },
            { value: 'later', label: labels.later },
          ]
        : [
            { value: 'direct-proxy', label: t('vpsChoice', language) },
            { value: 'cloudflare-tunnel', label: t('tunnelChoice', language) },
            { value: 'existing-proxy', label: t('proxyChoice', language) },
            { value: 'local-network', label: t('privateChoice', language) },
            { value: 'local', label: t('localhostChoice', language) },
            { value: 'hosting', label: t('advancedChoice', language) },
            { value: 'later', label: labels.later },
          ],
    );
    // Esc from the route list goes back to the mode list, not out to JamRelay's menu.
    if (!selected) mode = undefined;
  }
  const advanced = mode === 'advanced';
  const method = selected as Method;
  const totals: Record<string, number> = {
    'standard:local': 2,
    'standard:local-network': 3,
    'standard:cloudflare-tunnel': process.env.JAMRELAY_INSTALL_MODE === 'docker' ? 5 : 4,
    'standard:later': 1,
    'advanced:local': 2,
    'advanced:local-network': 5,
    'advanced:cloudflare-tunnel': 8,
    'advanced:direct-proxy': 9,
    'advanced:existing-proxy': 6,
    'advanced:hosting': 4,
    'advanced:later': 1,
  };
  let totalSteps = totals[`${mode}:${method}`] ?? 1;
  const progress = (step: number, total = totalSteps) => {
    totalSteps = total;
    setTuiContext({ step, total, language });
  };
  if (method !== 'hosting') progress(1);
  if (method === 'later') {
    await persist(
      'later',
      current.origin,
      'pending',
      current.domain,
      current.dnsProvider,
      current.registrar,
      undefined,
      current.zone,
    );
    showPanel(t('saved', language), t('saved', language));
    return;
  }
  if (method === 'local') {
    if (totalSteps > 1) progress(2);
    const origin = localBaseUrl();
    showPanel(
      t('localHelp', language),
      `${t('localHelp', language)}\n${t('mcpEndpoint', language)}: ${origin}/mcp`,
    );
    await verifyAndSave('local', origin, null, null, null, language, true, null);
    return;
  }
  if (method === 'local-network') {
    progress(2);
    showPanel(t('localNetwork', language), t('lanHelp', language));
    let address = '';
    while (!privateLanAddress(address)) {
      address = await ask(t('lanAddress', language));
      if (!privateLanAddress(address))
        showPanel(t('invalidLan', language), t('invalidLan', language));
    }
    const host = isIP(address) === 6 ? `[${address}]` : address;
    const port = new URL(localBaseUrl()).port;
    const origin = `http://${host}${port ? `:${port}` : ''}`;
    showPanel(t('localNetwork', language), `${t('lanHelp', language)}\n\nMCP URL: ${origin}/mcp`);
    if (totalSteps > 2) progress(totalSteps - 1);
    await verifyAndSave('local-network', origin, null, null, null, language, true, null);
    return;
  }
  if (method === 'direct-proxy' || method === 'cloudflare-tunnel' || method === 'existing-proxy') {
    progress(2);
    showPanel(t('domainHelp', language), t('domainHelp', language));
    const domain = await domainInfo(language, advanced, method as DomainMethod);
    progress(
      method === 'cloudflare-tunnel'
        ? advanced
          ? 4
          : process.env.JAMRELAY_INSTALL_MODE === 'docker'
            ? 3
            : 2
        : 4,
    );
    const domainMethod = method as DomainMethod;
    const details =
      domainMethod === 'cloudflare-tunnel'
        ? await configureCloudflareTunnel(
            domain.domain,
            domain.zone,
            domain.dnsProvider,
            domain.registrar,
            language,
            domain.origin,
            advanced,
          )
        : domainMethod === 'direct-proxy'
          ? await configureDirectProxy(
              domain.domain,
              domain.zone,
              domain.dnsProvider,
              domain.registrar,
              language,
              domain.origin,
            )
          : await configureExistingProxy(
              domain.domain,
              domain.zone,
              domain.dnsProvider,
              domain.registrar,
              language,
              domain.origin,
            );
    const publicOrigin = domain.origin ?? details.origin;
    progress(totalSteps);
    const routeConfigured = !('routeConfigured' in details) || details.routeConfigured;
    const action =
      domainMethod === 'cloudflare-tunnel'
        ? routeConfigured
          ? 'verify'
          : 'later'
        : await choose(t('continue', language), [
            { value: 'verify', label: t('continue', language) },
            { value: 'later', label: t('continueLater', language) },
          ]);
    if (action !== 'verify') {
      if (options.initialSetup && !(await confirmOriginChange(publicOrigin, false, language)))
        return;
      await persist(
        details.method,
        publicOrigin,
        'pending',
        details.domain,
        details.dnsProvider,
        details.registrar,
        undefined,
        domain.zone,
      );
      if (options.initialSetup && publicOrigin) await saveOrigin(publicOrigin);
      showPanel(
        t('saved', language),
        `${t('saved', language)}${domainMethod === 'cloudflare-tunnel' && !routeConfigured ? `\n\n${t('cloudflareRoutePending', language)}` : ''}`,
      );
      return;
    }
    await enterAndVerify(
      details.method,
      publicOrigin,
      details.domain,
      details.dnsProvider,
      details.registrar,
      language,
      false,
      domain.zone,
    );
    return;
  }
  if (method === 'hosting') {
    const advanced = await choose(t('advancedChoice', language), [
      { value: 'custom', label: t('hostnameFull', language) },
      { value: 'tailscale-funnel', label: labels.tailscale },
      { value: 'ngrok', label: labels.ngrok },
      { value: 'cloudflare-quick', label: labels.quick },
    ]);
    if (!advanced) return;
    totalSteps = advanced === 'custom' ? 4 : 3;
    progress(1);
    if (advanced === 'custom') {
      let origin = '';
      while (!origin) {
        origin = safeOrigin(await ask(t('customOrigin', language)), true) ?? '';
        if (!origin) showPanel(t('invalidOrigin', language), t('invalidOrigin', language));
      }
      const confirmed = await choose(t('continue', language), [
        { value: 'verify', label: t('continue', language) },
        { value: 'later', label: t('continueLater', language) },
      ]);
      if (confirmed !== 'verify') {
        if (options.initialSetup && !(await confirmOriginChange(origin, false, language))) return;
        await persist('existing-proxy', origin, 'pending', new URL(origin).hostname, null, null);
        if (options.initialSetup) await saveOrigin(origin);
        return;
      }
      await enterAndVerify(
        'existing-proxy',
        origin,
        new URL(origin).hostname,
        null,
        null,
        language,
        false,
        null,
      );
      return;
    }
    await methodInstructions(advanced as Method, language);
    const confirmed = await choose(t('continue', language), [
      { value: 'verify', label: t('continue', language) },
      { value: 'later', label: t('continueLater', language) },
    ]);
    if (confirmed === 'verify')
      await enterAndVerify(advanced as Method, '', null, null, null, language, false, null);
    else await persist(advanced as Method, null, 'pending', null, null, null);
    return;
  }
  const helpKey = methodHelp[method];
  if (helpKey) showPanel(t(helpKey, language), t(helpKey, language));
  await methodInstructions(method, language);
  const action = await choose(t('continue', language), [
    { value: 'verify', label: t('continue', language) },
    { value: 'later', label: t('continueLater', language) },
  ]);
  if (action !== 'verify') {
    await persist(method, null, 'pending', null, null, null);
    showPanel(t('saved', language), t('saved', language));
    return;
  }
  await enterAndVerify(method, '', null, null, null, language, false, null);
}

export const connectivityTranslations = copy;
