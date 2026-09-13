---
title: Darmowe i tanie wdrożenie
description: Jak uruchomić JamRelay za darmo albo za mały miesięczny koszt.
---

# Darmowe i tanie wdrożenie

JamRelay jest lekki. Nie potrzebujesz drogiego serwera.

## Wybór według budżetu

| Budżet         | Zalecany wariant                              | Dla kogo                                       |
| -------------- | --------------------------------------------- | ---------------------------------------------- |
| 0 zł           | Własny PC / serwer domowy + Cloudflare Tunnel | Najlepsze, jeśli masz sprzęt działający w domu |
| 0 zł           | Darmowa VM z trwałym dyskiem                  | Hosting w chmurze bez miesięcznej opłaty       |
| Mały koszt     | Mały VPS ze współdzielonym CPU                | Najprostsze 24/7                               |
| 0 zł do testów | Free tier PaaS                                | Demo i krótkie testy                           |

## Wariant za 0 zł

Uruchom JamRelay na własnym sprzęcie i wystaw tylko usługę MCP przez tunnel:

```text
Klient AI → HTTPS → Cloudflare Tunnel → JamRelay → Spotify
```

Działa za CGNAT-em i nie wymaga otwierania portów na routerze.

## Tani VPS

Do prywatnej instancji zwykle wystarczy:

```text
1 współdzielony vCPU
512 MB–1 GB RAM
5+ GB trwałego storage
Ubuntu/Debian
Docker
```

Nie ma sensu kupować większej maszyny tylko dla JamRelay.

Przykładowi dostawcy małych VPS-ów to Hetzner, OVHcloud, DigitalOcean, Vultr i lokalni dostawcy. Ceny często się zmieniają, dlatego dokumentacja celowo nie wpisuje jednej „aktualnej” kwoty.

## Checklista taniego wdrożenia

1. Wybierz małą VM z trwałym dyskiem.
2. Zainstaluj Docker.
3. Sklonuj repo.
4. Nie commituj `.env`.
5. Zapewnij trwałe `/data`.
6. Użyj Cloudflare Tunnel albo reverse proxy z HTTPS.
7. Ustaw publiczny callback Spotify.
8. Ustaw dokładny callback OAuth klienta AI.
9. Sprawdź, czy tokeny przeżywają restart.

## Uwaga na PaaS

Darmowy lub bardzo tani PaaS nadaje się na stałe tylko wtedy, gdy zapewnia trwały storage. Obecny JamRelay zapisuje zaszyfrowane tokeny i stan OAuth na dysku.

Przy ephemeral filesystem używaj platformy tylko testowo albo najpierw przenieś token store do zewnętrznego trwałego storage.

## Domena

Stała domena lub subdomena bardzo ułatwia OAuth. Jeśli już masz domenę, subdomena zwykle nie generuje dodatkowego kosztu.

## Czego nie kupować

Dla samego JamRelay zwykle nie potrzebujesz kilku rdzeni, wielu GB RAM, dużego SSD ani płatnego publicznego IPv4, jeśli korzystasz z Cloudflare Tunnel.
