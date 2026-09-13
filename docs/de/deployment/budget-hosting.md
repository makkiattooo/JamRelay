---
title: Kostenlos und günstig betreiben
description: JamRelay kostenlos oder mit sehr kleinem Monatsbudget betreiben.
---

# Kostenlos und günstig betreiben

JamRelay benötigt nur wenige Ressourcen.

## Nach Budget auswählen

| Budget               | Empfehlung                                  | Geeignet für                       |
| -------------------- | ------------------------------------------- | ---------------------------------- |
| Kostenlos            | Eigener PC / Homeserver + Cloudflare Tunnel | Nutzer mit vorhandener Hardware    |
| Kostenlos            | Free-Tier-VM mit persistentem Speicher      | Cloud ohne monatliche Serverkosten |
| Günstig              | Kleine Shared-vCPU-VM                       | Einfaches 24/7-Hosting             |
| Kostenlos zum Testen | PaaS Free Tier                              | Demos und Tests                    |

## Kostenlos zu Hause

```text
AI-Client → HTTPS → Cloudflare Tunnel → JamRelay → Spotify
```

Das funktioniert auch hinter CGNAT und ohne Portweiterleitung.

## Günstiger VPS

Für eine private Instanz reichen typischerweise 1 Shared vCPU, 512 MB–1 GB RAM und wenige GB persistenter Speicher. Größere Server sind für JamRelay allein normalerweise unnötig.

Anbieter wie Hetzner, OVHcloud, DigitalOcean, Vultr oder regionale Provider bieten kleine VMs an. Preise ändern sich häufig und werden deshalb hier nicht fest eingebaut.

## PaaS-Hinweis

Dauerhaftes Hosting benötigt persistenten Speicher für verschlüsselte Spotify-Tokens und MCP-OAuth-Daten. Ephemere Dateisysteme eignen sich primär für Tests.

## Empfehlung

Mit vorhandener Hardware kostenlos starten. Einen kleinen VPS erst dann buchen, wenn unabhängige 24/7-Verfügbarkeit wirklich benötigt wird.
