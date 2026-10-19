import { resolve4, resolve6 } from 'node:dns/promises';
import { isIP } from 'node:net';
import { domainToASCII } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { stdin, stdout } from 'node:process';
import { currentLanguage, type Language } from './i18n/index.js';
import { changeState, readState, type connectivityMethodSchema } from './state.js';
import {
  installationPaths,
  loadInstallation,
  lockInstallation,
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
  terminalLink,
} from './tui.js';
import { localBaseUrl } from '../config.js';

type Method = (typeof connectivityMethodSchema)['options'][number];
type DomainMethod = 'cloudflare-tunnel' | 'direct-proxy' | 'existing-proxy';
type Checks = { dns: boolean; https: boolean; health: boolean; mcpProtected: boolean };
const execFileAsync = promisify(execFile);
const PORTAL = {
  cloudflare: 'https://dash.cloudflare.com/',
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
    local: 'Local network only',
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
    direct: 'Public VPS + Caddy or Nginx',
    existing: 'Existing reverse proxy and domain',
    cloudflareIntro:
      'Add the domain as a site in your Cloudflare account. Cloudflare will scan existing DNS records; review/import them before changing nameservers. In the registrar account, replace the authoritative nameservers only with the exact pair Cloudflare shows for this zone. Do not change nameservers if the zone is already Active in Cloudflare.',
    nameserverOne:
      'Cloudflare nameserver 1 (exact value from the zone Overview; blank if already active)',
    nameserverTwo:
      'Cloudflare nameserver 2 (exact value from the zone Overview; blank if already active)',
    cloudflareSteps:
      'Create/select a tunnel at Networking → Tunnels, install cloudflared on the JamRelay host, wait for it to connect, then add a Published application route. Use the public hostname you chose and route it to the JamRelay origin shown below. The dashboard can create the CNAME automatically. For a manual record, use the tunnel UUID value entered next.',
    tunnelUuid:
      'Actual Cloudflare Tunnel UUID (copy from Networking → Tunnels; blank to use dashboard auto-DNS)',
    dockerNetwork: 'Where will cloudflared or the reverse proxy run?',
    host: 'On the host',
    sameDocker: 'In the same Docker network as JamRelay',
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
    ready: 'Secure endpoint verified',
    pending: 'Not verified yet. Configuration remains resumable.',
    callbacks:
      'Provider redirect URLs for this origin (update each developer application before authorizing):',
    spotify: 'Spotify callback',
    soundcloud: 'SoundCloud callback',
    youtube: 'YouTube callback',
    apple: 'Apple Music uses MusicKit tokens, not this OAuth callback.',
    recovery:
      'Check the DNS values, tunnel/proxy status, port forwarding and certificate logs above, correct the issue, then run jamrelay connectivity again.',
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
  },
  pl: {
    title: 'Jak asystent AI połączy się z JamRelay?',
    local: 'Tylko sieć lokalna',
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
    direct: 'Publiczny VPS + Caddy lub Nginx',
    existing: 'Istniejący reverse proxy i domena',
    cloudflareIntro:
      'Dodaj domenę jako witrynę na swoim koncie Cloudflare. Cloudflare przeskanuje istniejące rekordy — sprawdź je lub zaimportuj przed zmianą serwerów nazw. U rejestratora zastąp serwery nazw wyłącznie dokładną parą podaną w strefie Cloudflare. Nie zmieniaj ich, jeśli strefa ma już status Active.',
    nameserverOne:
      'Serwer nazw Cloudflare 1 (dokładna wartość z Overview; puste, jeśli strefa jest aktywna)',
    nameserverTwo:
      'Serwer nazw Cloudflare 2 (dokładna wartość z Overview; puste, jeśli strefa jest aktywna)',
    cloudflareSteps:
      'Utwórz lub wybierz tunel w Networking → Tunnels, zainstaluj cloudflared na hoście JamRelay i poczekaj na połączenie. Dodaj trasę Published application. Wybierz publiczną nazwę hosta i skieruj ją do źródła JamRelay pokazanego niżej. Panel może automatycznie utworzyć rekord CNAME. Do ręcznego wpisu użyj UUID tunelu podanego dalej.',
    tunnelUuid:
      'Aktualny UUID tunelu Cloudflare (skopiuj z Networking → Tunnels; puste, aby użyć automatycznego DNS w panelu)',
    dockerNetwork: 'Gdzie będzie działać cloudflared lub reverse proxy?',
    host: 'Na hoście',
    sameDocker: 'W tej samej sieci Docker co JamRelay',
    hostOrigin: 'Adres źródłowy dla programu na hoście',
    dockerOrigin: 'Adres źródłowy dla kontenera w tej samej sieci',
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
    ready: 'Bezpieczny endpoint zweryfikowany',
    pending: 'Jeszcze niezweryfikowany. Możesz wznowić konfigurację później.',
    callbacks:
      'Adresy przekierowania dostawców dla tej domeny (zaktualizuj każdą aplikację przed autoryzacją):',
    spotify: 'Callback Spotify',
    soundcloud: 'Callback SoundCloud',
    youtube: 'Callback YouTube',
    apple: 'Apple Music używa tokenów MusicKit, a nie tego callbacku OAuth.',
    recovery:
      'Sprawdź wartości DNS, stan tunelu/proxy, przekierowanie portów i dzienniki certyfikatu. Popraw problem i ponownie uruchom jamrelay connectivity.',
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
  },
  de: {
    title: 'Wie verbindet sich dein KI-Assistent?',
    local: 'Nur lokales Netzwerk',
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
    direct: 'Öffentlicher VPS + Caddy oder Nginx',
    existing: 'Vorhandener Reverse Proxy und Domain',
    cloudflareIntro:
      'Füge die Domain als Website in deinem Cloudflare-Konto hinzu. Prüfe oder importiere erkannte DNS-Einträge vor einer Nameserver-Änderung. Ersetze beim Registrar die autoritativen Nameserver nur durch das genaue Paar aus der Cloudflare-Zonenübersicht. Bei Status Active ist keine Änderung nötig.',
    nameserverOne: 'Cloudflare-Nameserver 1 (genauer Wert aus Overview; leer lassen, wenn aktiv)',
    nameserverTwo: 'Cloudflare-Nameserver 2 (genauer Wert aus Overview; leer lassen, wenn aktiv)',
    cloudflareSteps:
      'Erstelle oder wähle unter Networking → Tunnels einen Tunnel, installiere cloudflared auf dem JamRelay-Host und warte auf die Verbindung. Füge eine Published-application-Route hinzu. Wähle den öffentlichen Hostnamen und das unten gezeigte JamRelay-Ziel. Das Dashboard kann den CNAME automatisch anlegen. Für manuelles DNS nutze die danach eingegebene Tunnel-UUID.',
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
  },
  fr: {
    title: 'Comment votre assistant IA se connectera-t-il ?',
    local: 'Réseau local uniquement',
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
    direct: 'VPS public + Caddy ou Nginx',
    existing: 'Proxy inverse et domaine existants',
    cloudflareIntro:
      'Ajoutez le domaine comme site dans votre compte Cloudflare. Vérifiez ou importez les enregistrements DNS détectés avant de changer les serveurs de noms. Chez le registrar, remplacez-les uniquement par la paire exacte affichée dans la zone Cloudflare. Ne les changez pas si la zone est déjà Active.',
    nameserverOne: 'Serveur de noms Cloudflare 1 (valeur exacte de Overview; vide si déjà actif)',
    nameserverTwo: 'Serveur de noms Cloudflare 2 (valeur exacte de Overview; vide si déjà actif)',
    cloudflareSteps:
      'Créez ou choisissez un tunnel dans Networking → Tunnels, installez cloudflared sur l’hôte JamRelay et attendez sa connexion. Ajoutez une route Published application. Choisissez le nom public et la destination JamRelay ci-dessous. Le tableau de bord peut créer automatiquement le CNAME. Pour le DNS manuel, utilisez l’UUID réel saisi ensuite.',
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
  },
  es: {
    title: '¿Cómo se conectará tu asistente de IA?',
    local: 'Solo red local',
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
    direct: 'VPS público + Caddy o Nginx',
    existing: 'Proxy inverso y dominio existentes',
    cloudflareIntro:
      'Añade el dominio como sitio en tu cuenta Cloudflare. Revisa o importa los registros detectados antes de cambiar nameservers. En el registrador, reemplaza los servidores autoritativos solo por el par exacto que muestra la zona Cloudflare. No los cambies si la zona ya está Active.',
    nameserverOne: 'Nameserver Cloudflare 1 (valor exacto de Overview; vacío si ya está activo)',
    nameserverTwo: 'Nameserver Cloudflare 2 (valor exacto de Overview; vacío si ya está activo)',
    cloudflareSteps:
      'Crea o elige un túnel en Networking → Tunnels, instala cloudflared en el host JamRelay y espera a que conecte. Añade una ruta Published application. Elige el hostname público y el origen JamRelay indicado abajo. El panel puede crear el CNAME automáticamente. Para DNS manual usa el UUID real que introducirás después.',
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
  },
};

const methodKeys: Record<Method, string> = {
  local: 'local',
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
    applyOrigin: 'Apply saved public origin (stop server first)',
    verifyOrigin: 'Verify saved endpoint now',
    stopFirst:
      'Stop the JamRelay server, run jamrelay connectivity and choose Apply saved public origin. Start JamRelay again, then run jamrelay connectivity and choose Verify saved endpoint.',
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
    applyOrigin: 'Zastosuj zapisany adres publiczny (najpierw zatrzymaj serwer)',
    verifyOrigin: 'Sprawdź zapisany endpoint',
    stopFirst:
      'Zatrzymaj serwer JamRelay, uruchom jamrelay connectivity i wybierz zastosowanie zapisanego adresu. Następnie uruchom JamRelay ponownie, wykonaj polecenie jeszcze raz i wybierz weryfikację endpointu.',
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
    applyOrigin: 'Gespeicherten öffentlichen Ursprung übernehmen (Server zuerst stoppen)',
    verifyOrigin: 'Gespeicherten Endpunkt jetzt prüfen',
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
    applyOrigin: 'Appliquer l’origine publique (arrêter le serveur d’abord)',
    verifyOrigin: 'Vérifier cet endpoint maintenant',
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
    applyOrigin: 'Aplicar el origen público (detén el servidor primero)',
    verifyOrigin: 'Verificar ahora el endpoint guardado',
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

export async function verifyEndpoint(origin: string, local = false): Promise<Checks> {
  const url = new URL(origin);
  let dns = local || isIP(url.hostname) !== 0;
  if (!dns) {
    try {
      await Promise.any([resolve4(url.hostname), resolve6(url.hostname)]);
      dns = true;
    } catch {
      dns = false;
    }
  }
  let health = false;
  let https = local ? url.protocol === 'http:' || url.protocol === 'https:' : false;
  try {
    const response = await fetch(new URL('/health', url), {
      signal: AbortSignal.timeout(8000),
      redirect: 'manual',
    });
    health = response.status === 200;
    if (url.protocol === 'https:') https = response.status > 0;
  } catch {
    /* DNS, TLS, firewall, proxy and tunnel errors are reported below. */
  }
  let mcpProtected = false;
  try {
    const response = await fetch(new URL('/mcp', url), {
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
  return { dns, https, health, mcpProtected };
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

async function saveOrigin(origin: string) {
  const paths = loadInstallation();
  if (process.env.PUBLIC_BASE_URL && process.env.PUBLIC_BASE_URL !== origin)
    throw new Error(
      'PUBLIC_BASE_URL is set in the environment. Update that environment value before using the saved origin.',
    );
  const release = await lockInstallation(paths.config);
  try {
    const settings = readSettings(paths.config);
    if (settings.PUBLIC_BASE_URL === origin) return;
    settings.PUBLIC_BASE_URL = origin;
    saveSettings(paths.config, settings);
  } finally {
    release();
  }
}

async function persist(
  method: Method,
  origin: string | null,
  status: 'local' | 'pending' | 'verified',
  domain: string | null,
  dnsProvider: string | null,
  registrar: string | null,
  checks: Checks = { dns: false, https: false, health: false, mcpProtected: false },
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

async function openUrl(url: string) {
  if (!stdin.isTTY || process.env.CI || process.env.JAMRELAY_HEADLESS === 'true') return false;
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

async function maybeOpen(url: string, language: Language) {
  showPanel(t('offerBrowser', language), `${t('offerBrowser', language)}\n${terminalLink(url)}`);
  const action = await choose(t('offerBrowser', language), [
    { value: 'open', label: t('open', language) },
    { value: 'show', label: t('show', language) },
  ]);
  if (action === 'open' && !(await openUrl(url))) showPanel(t('offerBrowser', language), url);
}

function printReadyChecks(checks: Checks, language: Language) {
  const rows = [
    [checks.dns, 'dnsOk', 'dnsBad'],
    [checks.https, 'httpsOk', 'httpsBad'],
    [checks.health, 'healthOk', 'healthBad'],
    [checks.mcpProtected, 'mcpOk', 'mcpBad'],
  ] as const;
  showPanel(
    t('checkTitle', language),
    rows
      .map(
        ([condition, okKey, badKey]) =>
          `${condition ? '✓' : '✗'} ${t(condition ? okKey : badKey, language)}`,
      )
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
) {
  const checks = await verifyEndpoint(origin, local);
  printReadyChecks(checks, language);
  const verified = checks.dns && checks.https && checks.health && checks.mcpProtected;
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
    showPanel(t('pending', language), `${t('recovery', language)}\n\n${t('errors', language)}`);
    return false;
  }
  try {
    await saveOrigin(origin);
  } catch (error) {
    if (!(error instanceof Error) || !error.message.includes('JamRelay is running')) throw error;
    await persist(method, origin, 'pending', domain, dnsProvider, registrar, checks, zone);
    showPanel(
      t('saved', language),
      `${t('saved', language)}\nStop the JamRelay server, apply the saved origin with jamrelay config, then start it and run jamrelay connectivity again to verify.`,
    );
    return false;
  }
  let result = `✓ ${t(local ? 'localReady' : 'ready', language)}\n${t('mcpEndpoint', language)}: ${origin}/mcp`;
  if (!local) {
    const cb = providerRedirectUris(origin);
    result += `\n\n${t('callbacks', language)}\nSpotify: ${cb.spotify}\nSoundCloud: ${cb.soundcloud}\nYouTube: ${cb.youtube}\n${t('apple', language)}`;
  }
  result += `\n\n${t('ownerCosts', language)}`;
  showPanel(t('ready', language), result);
  return true;
}

async function domainInfo(language: Language) {
  let domain = '';
  while (!domain) {
    domain = normalizeDomain(await ask(t('askDomain', language))) ?? '';
    if (!domain) showPanel(t('invalidDomain', language), t('invalidDomain', language));
  }
  let zone = '';
  while (!recordNameForHost(domain, zone)) {
    zone = normalizeDomain(await ask(zonePrompt[language])) ?? '';
    if (!recordNameForHost(domain, zone))
      showPanel(t('invalidDomain', language), t('invalidDomain', language));
  }
  showPanel(t('dnsExplain', language), t('dnsExplain', language));
  const dnsProvider = await ask(t('dnsProvider', language), '');
  const registrar = await ask(t('registrar', language), 'unknown');
  return { domain, zone, dnsProvider: dnsProvider || null, registrar: registrar || null };
}

async function printRecord(name: string, type: string, value: string, language: Language) {
  showPanel(
    t('proposed', language),
    `${t('type', language)}: ${type}\n${t('name', language)}: ${name}\n${t('value', language)}: ${value}`,
  );
}

async function configureCloudflareTunnel(
  domain: string,
  zone: string,
  dnsProvider: string | null,
  registrar: string | null,
  language: Language,
) {
  const host = domain;
  const subdomain = recordNameForHost(host, zone)!;
  showPanel(
    t('cloudflareIntro', language),
    `${subdomain === '@' ? `${t('cfDomain', language)}\n\n` : ''}${t('cloudflareIntro', language)}`,
  );
  const ns1 = await ask(t('nameserverOne', language));
  const ns2 = await ask(t('nameserverTwo', language));
  if (ns1 && ns2) {
    showPanel(
      t('cfNameServers', language),
      `${t('cfNameServers', language)}\nNS 1: ${ns1}\nNS 2: ${ns2}`,
    );
  } else {
    showPanel(
      t('cfDomain', language),
      `${t('cfDomain', language)}\nCloudflare: ${terminalLink(PORTAL.cloudflare)}`,
    );
  }
  const placement = await choose(t('dockerNetwork', language), [
    { value: 'host', label: t('host', language) },
    { value: 'docker', label: t('sameDocker', language) },
  ]);
  const origin = placement === 'docker' ? 'http://jamrelay:5267' : localBaseUrl();
  showPanel(
    t('cloudflareSteps', language),
    `${t('cloudflareSteps', language)}\n${t(placement === 'docker' ? 'dockerOrigin' : 'hostOrigin', language)}: ${origin}`,
  );
  const uuid = await ask(t('tunnelUuid', language));
  const target = uuid ? tunnelDnsTarget(uuid) : undefined;
  if (uuid && !target) showPanel(t('uuidError', language), t('uuidError', language));
  if (target) await printRecord(subdomain, 'CNAME', target, language);
  else showPanel(t('proposed', language), t('cloudflareDns', language));
  await maybeOpen(PORTAL.cloudflareTunnels, language);
  return {
    method: 'cloudflare-tunnel' as const,
    origin: `https://${host}`,
    domain: host,
    dnsProvider: 'Cloudflare',
    registrar,
  };
}

async function configureDirectProxy(
  domain: string,
  zone: string,
  dnsProvider: string | null,
  registrar: string | null,
  language: Language,
) {
  const ipv4 = await ask(t('publicIp', language));
  const ipv6 = await ask(t('publicIpv6', language));
  const valid4 = ipv4 && isIP(ipv4) === 4 ? ipv4 : '';
  const valid6 = ipv6 && isIP(ipv6) === 6 ? ipv6 : '';
  const label = recordNameForHost(domain, zone)!;
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
  ]);
  if (proxy === 'caddy') {
    showPanel(
      'Caddy',
      `${t('caddyConfig', language)}\n\n${domain} {\n    reverse_proxy ${upstream}\n}\n\n${t('caddyPorts', language)}`,
    );
    await maybeOpen(PORTAL.caddy, language);
  } else {
    showPanel(
      'Nginx',
      `${t('nginxConfig', language)}\n\nserver {\n    listen 443 ssl;\n    server_name ${domain};\n\n    location / {\n        proxy_pass http://${upstream};\n        proxy_http_version 1.1;\n        proxy_set_header Host $host;\n        proxy_set_header X-Forwarded-Host $host;\n        proxy_set_header X-Forwarded-Proto $scheme;\n        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;\n        proxy_buffering off;\n        proxy_read_timeout 3600s;\n    }\n}\n\n${t('nginxPorts', language)}`,
    );
    await maybeOpen(PORTAL.nginx, language);
  }
  return {
    method: 'direct-proxy' as const,
    origin: `https://${domain}`,
    domain,
    dnsProvider,
    registrar,
  };
}

async function configureExistingProxy(
  domain: string,
  zone: string,
  dnsProvider: string | null,
  registrar: string | null,
  language: Language,
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
    origin: `https://${domain}`,
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
  const ok = await verifyAndSave(
    method,
    origin,
    domain,
    dnsProvider,
    registrar,
    language,
    local,
    zone,
  );
  if (!ok && (await confirm(t('continueLater', language), language)))
    await persist(method, origin, 'pending', domain, dnsProvider, registrar, undefined, zone);
  return ok;
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
  setTuiContext({ step: 4, total: 6, language });
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
    return Object.values(checks).every(Boolean) ? 0 : 1;
  }
  return 1;
}

export function isConnectivityConfigured() {
  const state = readState().connectivity;
  return state.status === 'verified' || state.status === 'local';
}

export async function configureConnectivity() {
  if (!stdin.isTTY || !stdout.isTTY) throw new Error(t('noTty'));
  loadInstallation();
  const language = currentLanguage();
  clearScreen();
  const current = readState().connectivity;
  setTuiContext({ step: 4, total: 6, language });
  if (current.method)
    showPanel(
      t('status', language),
      `${t('status', language)}: ${currentMethodLabel(current.method, language)} — ${current.status}\n`,
    );
  if (current.status === 'pending' && current.origin) {
    const resume = await choose(t('resumeTitle', language), [
      { value: 'apply', label: t('applyOrigin', language) },
      { value: 'verify', label: t('verifyOrigin', language) },
      { value: 'new', label: t('back', language) },
    ]);
    if (resume === 'apply') {
      await saveOrigin(current.origin);
      showPanel(t('saved', language), `${t('saved', language)}\n${t('startVerify', language)}`);
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
  const selected = await choose(t('title', language), [
    { value: 'local', label: labels.local },
    { value: 'tailscale-funnel', label: labels.tailscale },
    { value: 'ngrok', label: labels.ngrok },
    { value: 'cloudflare-quick', label: labels.quick },
    { value: 'own-domain', label: labels.own },
    { value: 'hosting', label: labels.hosting },
    { value: 'later', label: labels.later },
  ]);
  if (!selected) return;
  const method = selected as Method | 'own-domain';
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
    const origin = localBaseUrl();
    showPanel(
      t('localHelp', language),
      `${t('localHelp', language)}\n${t('mcpEndpoint', language)}: ${origin}/mcp`,
    );
    await verifyAndSave('local', origin, null, null, null, language, true);
    return;
  }
  if (method === 'own-domain') {
    showPanel(t('domainHelp', language), t('domainHelp', language));
    const domain = await domainInfo(language);
    const domainMethod = (await choose(t('domainMethod', language), [
      { value: 'cloudflare-tunnel', label: t('cf', language) },
      { value: 'direct-proxy', label: t('direct', language) },
      { value: 'existing-proxy', label: t('existing', language) },
    ])) as DomainMethod | undefined;
    if (!domainMethod) return;
    const details =
      domainMethod === 'cloudflare-tunnel'
        ? await configureCloudflareTunnel(
            domain.domain,
            domain.zone,
            domain.dnsProvider,
            domain.registrar,
            language,
          )
        : domainMethod === 'direct-proxy'
          ? await configureDirectProxy(
              domain.domain,
              domain.zone,
              domain.dnsProvider,
              domain.registrar,
              language,
            )
          : await configureExistingProxy(
              domain.domain,
              domain.zone,
              domain.dnsProvider,
              domain.registrar,
              language,
            );
    const action = await choose(t('continue', language), [
      { value: 'verify', label: t('continue', language) },
      { value: 'later', label: t('continueLater', language) },
    ]);
    if (action !== 'verify') {
      await persist(
        details.method,
        details.origin,
        'pending',
        details.domain,
        details.dnsProvider,
        details.registrar,
        undefined,
        domain.zone,
      );
      showPanel(t('saved', language), t('saved', language));
      return;
    }
    await enterAndVerify(
      details.method,
      details.origin,
      details.domain,
      details.dnsProvider,
      details.registrar,
      language,
      false,
      domain.zone,
    );
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
  await enterAndVerify(method, '', null, null, null, language, false);
}

export const connectivityTranslations = copy;
