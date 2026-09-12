---
title: Kostenlose Hosting-Optionen
description: 'TuneLink ohne VPS betreiben: lokal, über Cloudflare Tunnel, auf einer kostenlosen VM oder einer kostenlosen PaaS-Plattform.'
---

# Kostenlose Hosting-Optionen

Für TuneLink brauchst du **keinen kostenpflichtigen VPS**.

Für die meisten Nutzer ist die einfachste kostenlose Variante:

```text
Dein PC / Homeserver
        ↓
   TuneLink
        ↓
 Cloudflare Tunnel
        ↓
https://mcp.example.com/mcp
```

Cloudflare Tunnel baut eine ausgehende Verbindung von deinem Gerät auf. Eine öffentliche IP-Adresse oder offene eingehende Ports sind daher nicht erforderlich.

> [!TIP]
> Wenn du bereits einen PC, Laptop, Mini-PC, Raspberry Pi oder ein NAS besitzt, das dauerhaft laufen kann, ist das normalerweise die beste kostenlose Lösung.

## Option 1 — Lokaler Computer + Cloudflare Tunnel

**Kosten:** kostenloses Hosting, abgesehen von Strom und gegebenenfalls einer Domain.

Das ist die kostenlose Variante, die einem VPS am nächsten kommt.

### Voraussetzungen

- Node.js 22+ oder Docker
- ein Gerät, das laufen kann, solange TuneLink erreichbar sein soll
- ein Cloudflare-Konto
- eine über Cloudflare verwaltete Domain für einen stabilen eigenen Hostnamen

TuneLink lokal starten:

```bash
npm ci
npm run build
npm start
```

oder mit Docker:

```bash
docker compose up -d
```

Anschließend einen Cloudflare-Tunnel-Hostnamen auf den lokalen Dienst richten:

```text
http://127.0.0.1:3010
```

Der öffentliche MCP-Endpunkt kann dann so aussehen:

```text
https://mcp.example.com/mcp
```

### Vorteile

- kein kostenpflichtiger Server
- persistenter lokaler Speicher
- keine Portweiterleitung
- funktioniert hinter CGNAT
- keine Änderungen an der TuneLink-Architektur nötig
- später leicht auf einen VPS migrierbar

### Einschränkungen

- das Gerät muss eingeschaltet bleiben
- ein Ausfall des Heim-Internets macht den Dienst unerreichbar
- Laptops können ohne angepasste Energieeinstellungen in den Ruhezustand wechseln

---

## Option 2 — Homeserver, NAS oder Raspberry Pi

Wenn bereits ein Homeserver oder NAS vorhanden ist, ist TuneLink nur eine sehr kleine zusätzliche Last.

Typischer Aufbau:

```text
Docker
├── TuneLink
└── cloudflared
```

Persistente Anwendungsdaten sollten auf einem Volume liegen, zum Beispiel:

```text
/data
```

Das eignet sich besonders für Nutzer, die bereits Home Assistant, Pi-hole, Medienserver oder andere Self-Hosting-Dienste betreiben.

> [!NOTE]
> Das Gerät muss Node.js oder Container ausführen können.

---

## Option 3 — Kostenlose Cloud-VM

Eine kostenlose virtuelle Maschine ist der direkteste Ersatz für einen kostenpflichtigen VPS.

Oracle Cloud bietet derzeit in geeigneten Regionen **Always Free**-Compute-Ressourcen an. Die tatsächliche Verfügbarkeit kann von Region und freier Kapazität abhängen.

Das Deployment entspricht fast vollständig einem normalen VPS:

```text
Kostenlose Cloud-VM
├── Docker
│   └── TuneLink
└── cloudflared
```

### Vorteile

- 24/7-Betrieb möglich
- persistenter Blockspeicher
- keine eigene Hardware erforderlich
- bestehendes Docker-Deployment meist direkt wiederverwendbar

### Einschränkungen

- kostenlose Kapazität ist nicht immer verfügbar
- Limits und Bedingungen können sich ändern
- eine Kontoverifizierung kann erforderlich sein
- die Free-Tier-Limits müssen eingehalten werden

> [!WARNING]
> Verlasse dich nicht darauf, dass ein kostenloser Cloud-Tarif für immer unverändert bleibt.

---

## Option 4 — Kostenlose PaaS-Plattformen

Plattformen wie Render oder Koyeb können Node.js-Dienste kostenlos ausführen, sind für TuneLink jedoch **ohne Änderungen am persistenten Speicher nicht ideal**.

TuneLink speichert OAuth-Daten auf dem Dateisystem, zum Beispiel:

```text
/data/mcp-oauth.json
```

Auch Spotify-Tokens müssen persistent gespeichert werden.

### Render Free

Kostenlose Render-Webdienste:

- werden nach längerer Inaktivität heruntergefahren
- verwenden ein ephemeres lokales Dateisystem
- verlieren lokale Änderungen bei Neustart, Redeploy oder Spin-down

Dadurch können lokal gespeicherte OAuth- oder Token-Daten verloren gehen.

### Koyeb Free

Die kostenlose Koyeb-Instanz:

- bietet einen kleinen kostenlosen Webdienst
- skaliert nach einer Stunde ohne Traffic auf null
- unterstützt keine persistenten Volumes auf der kostenlosen Instanz

Auch hier ist der lokale Token-Speicher das Hauptproblem.

### Wann PaaS sinnvoll wird

PaaS wird deutlich geeigneter, wenn TuneLink einen externen persistenten Token-Speicher unterstützt, zum Beispiel:

```text
PostgreSQL
Redis-kompatibler KV-Speicher
verwaltete Datenbank
verschlüsselter Remote-Key-Value-Store
```

Bis dahin eignet sich kostenloses PaaS eher für Tests.

---

## Vergleich

| Option                         |                 Hosting-Kosten |     24/7 möglich |  Persistenter Speicher | Änderungen an TuneLink    |
| ------------------------------ | -----------------------------: | ---------------: | ---------------------: | --------------------------- |
| Lokaler PC + Cloudflare Tunnel |                     Kostenlos* | ✅ wenn PC läuft |                     ✅ | Keine                       |
| Homeserver / NAS               |                     Kostenlos* |               ✅ |                     ✅ | Keine                       |
| Free-Tier-Cloud-VM             | Innerhalb der Limits kostenlos |               ✅ |                     ✅ | Keine oder minimal          |
| Render Free                    |                      Kostenlos |         ⚠️ Sleep | ❌ lokales Dateisystem | Externer Speicher empfohlen |
| Koyeb Free                     |                      Kostenlos | ⚠️ Scale-to-zero | ❌ persistentes Volume | Externer Speicher empfohlen |

\* Hardware-, Strom- und Domainkosten sind nicht enthalten.

## Empfohlener Weg

Für neue Nutzer:

```text
1. TuneLink lokal starten
2. Spotify OAuth testen
3. MCP lokal testen
4. Cloudflare Tunnel hinzufügen
5. AI-Client verbinden
```

Erst auf einen VPS oder eine Cloud-VM wechseln, wenn echte 24/7-Verfügbarkeit benötigt wird.

## Sicherheit

Kostenloses Hosting sollte nicht weniger sicher sein.

- `/mcp` niemals ohne Authentifizierung veröffentlichen
- `.env` niemals committen
- starke OAuth- und Bearer-Secrets verwenden
- HTTPS verwenden
- Token-Speicher persistent halten
- `/data` nicht öffentlich bereitstellen
- Abhängigkeiten und Host-System aktuell halten

## Aktualität

Der Markt für kostenlose Hosting-Angebote ändert sich häufig. Diese Seite wurde am **2026-09-12** geprüft.

Vor der Nutzung eines Free Tiers immer die aktuelle Dokumentation des Anbieters prüfen.

### Offizielle Quellen

- Oracle Cloud Free Tier: https://docs.oracle.com/en-us/iaas/Content/FreeTier/freetier.htm
- Cloudflare Tunnel: https://developers.cloudflare.com/tunnel/
- Render Free: https://render.com/docs/free
- Koyeb Free instances: https://www.koyeb.com/docs/reference/instances
