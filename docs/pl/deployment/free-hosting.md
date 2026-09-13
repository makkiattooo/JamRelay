---
title: Darmowe opcje hostingu
description: 'Uruchom JamRelay bez VPS-a: lokalnie, przez Cloudflare Tunnel, na darmowej maszynie wirtualnej lub darmowym PaaS.'
---

# Darmowe opcje hostingu

Do uruchomienia JamRelay **nie potrzebujesz płatnego VPS-a**.

Dla większości osób najprostszy wariant za 0 zł wygląda tak:

```text
Twój komputer / serwer domowy
             ↓
        JamRelay
             ↓
      Cloudflare Tunnel
             ↓
https://mcp.example.com/mcp
```

Cloudflare Tunnel zestawia połączenie wychodzące z Twojego urządzenia, więc nie potrzebujesz publicznego adresu IP ani otwierania portów na routerze.

> [!TIP]
> Jeśli masz komputer, laptop, mini-PC, Raspberry Pi albo NAS, który może działać cały czas, to zwykle najlepsza darmowa opcja.

## Opcja 1 — Lokalny komputer + Cloudflare Tunnel

**Koszt:** 0 zł za hosting, pomijając prąd i ewentualny koszt domeny.

To najbliższy darmowy odpowiednik VPS-a.

### Czego potrzebujesz

- Node.js 22+ albo Docker
- komputer działający wtedy, kiedy JamRelay ma być dostępny
- konto Cloudflare
- domena obsługiwana przez Cloudflare, jeśli chcesz stały własny hostname

Uruchom JamRelay lokalnie:

```bash
npm ci
npm run build
npm start
```

albo przez Docker:

```bash
docker compose up -d
```

Następnie skieruj hostname Cloudflare Tunnel na lokalną usługę:

```text
http://127.0.0.1:5267
```

Publiczny endpoint MCP może wtedy wyglądać tak:

```text
https://mcp.example.com/mcp
```

### Zalety

- brak płatnego serwera
- trwały lokalny storage
- brak przekierowania portów
- działa za CGNAT-em
- nie wymaga zmian w architekturze JamRelay
- później łatwo przenieść całość na VPS

### Ograniczenia

- komputer musi być włączony
- awaria domowego internetu wyłącza usługę
- laptop może przechodzić w uśpienie, jeśli nie zmienisz ustawień zasilania

---

## Opcja 2 — Serwer domowy, NAS albo Raspberry Pi

Jeśli już masz domowy serwer lub NAS, JamRelay jest bardzo lekkim obciążeniem.

Typowy układ:

```text
Docker
├── JamRelay
└── cloudflared
```

Trwałe dane aplikacji trzymaj na volume, np.:

```text
/data
```

To dobry wariant dla osób, które już hostują Home Assistant, Pi-hole, serwer multimediów albo inne usługi self-hosted.

> [!NOTE]
> NAS lub serwer musi umożliwiać uruchomienie Node.js albo kontenerów.

---

## Opcja 3 — Darmowa maszyna wirtualna w chmurze

Darmowa VM jest najbliższym zamiennikiem płatnego VPS-a.

Oracle Cloud nadal oferuje zasoby **Always Free** w kwalifikujących się regionach. Dostępność konkretnej instancji może zależeć od regionu i wolnej pojemności.

Model wdrożenia praktycznie nie różni się od zwykłego VPS-a:

```text
Darmowa VM
├── Docker
│   └── JamRelay
└── cloudflared
```

### Zalety

- może działać 24/7
- trwały block storage
- nie potrzebujesz własnego sprzętu w domu
- możesz użyć praktycznie tego samego deploymentu Docker

### Ograniczenia

- darmowe zasoby nie zawsze są dostępne
- limity i warunki dostawcy mogą się zmieniać
- może być wymagane zweryfikowanie konta
- trzeba pilnować limitów darmowego planu

> [!WARNING]
> Nie projektuj JamRelay w założeniu, że dowolny darmowy plan chmurowy będzie istniał wiecznie. Traktuj go jako wygodną opcję, a nie gwarancję.

---

## Opcja 4 — Darmowy PaaS

Platformy takie jak Render czy Koyeb mogą uruchamiać aplikacje Node.js za darmo, ale **w obecnej wersji JamRelay nie są idealnym środowiskiem bez zmian w storage**.

JamRelay zapisuje trwałe dane OAuth na dysku, np.:

```text
/data/mcp-oauth.json
```

i potrzebuje też trwałego miejsca na tokeny Spotify.

### Render Free

Darmowe web services Render obecnie:

- usypiają się po okresie braku ruchu
- mają ephemeral filesystem
- tracą zmiany w lokalnym filesystemie po restarcie, redeployu lub uśpieniu

W efekcie lokalnie zapisane dane OAuth albo tokeny mogą zniknąć.

### Koyeb Free

Darmowa instancja Koyeb obecnie:

- zapewnia małą darmową usługę webową
- skaluje się do zera po godzinie bez ruchu
- nie obsługuje trwałych Volumes na darmowej instancji

Ponownie największym problemem jest lokalny token store.

### Kiedy PaaS ma sens

PaaS stanie się znacznie lepszą opcją, jeśli JamRelay dostanie zewnętrzny trwały token store, np.:

```text
PostgreSQL
Redis-compatible KV
zarządzana baza danych
szyfrowany zdalny key-value store
```

Do tego czasu darmowy PaaS lepiej traktować jako środowisko testowe.

---

## Porównanie

| Opcja                          |  Koszt hostingu |       Możliwe 24/7 |        Trwały storage | Zmiany w JamRelay           |
| ------------------------------ | --------------: | -----------------: | --------------------: | --------------------------- |
| Lokalny PC + Cloudflare Tunnel |           0 zł* | ✅ jeśli PC działa |                    ✅ | Brak                        |
| Serwer domowy / NAS            |           0 zł* |                 ✅ |                    ✅ | Brak                        |
| Darmowa VM w chmurze           | 0 zł w limitach |                 ✅ |                    ✅ | Brak lub minimalne          |
| Render Free                    |            0 zł |       ⚠️ usypianie | ❌ lokalny filesystem | Zalecany zewnętrzny storage |
| Koyeb Free                     |            0 zł |   ⚠️ scale-to-zero |  ❌ persistent volume | Zalecany zewnętrzny storage |

\* Nie uwzględnia kosztu sprzętu, energii ani domeny.

## Zalecana ścieżka

Dla nowego użytkownika:

```text
1. Uruchom JamRelay lokalnie
2. Sprawdź Spotify OAuth
3. Sprawdź MCP lokalnie
4. Dodaj Cloudflare Tunnel
5. Połącz klienta AI
```

Na VPS lub VM przenoś się dopiero wtedy, gdy naprawdę potrzebujesz stałej dostępności 24/7.

## Bezpieczeństwo

Darmowy hosting nie powinien oznaczać gorszego bezpieczeństwa.

Zachowaj te same zasady:

- nie wystawiaj `/mcp` bez uwierzytelnienia
- nigdy nie commituj `.env`
- używaj mocnych sekretów OAuth i Bearer
- używaj HTTPS
- zapewnij trwały token storage
- nie wystawiaj `/data`
- aktualizuj zależności i system hosta

## Aktualność informacji

Rynek darmowego hostingu często się zmienia. Informacje na tej stronie sprawdzono **2026-09-12**.

Przed wyborem platformy sprawdź aktualną dokumentację dostawcy.

### Oficjalne źródła

- Oracle Cloud Free Tier: https://docs.oracle.com/en-us/iaas/Content/FreeTier/freetier.htm
- Cloudflare Tunnel: https://developers.cloudflare.com/tunnel/
- Render Free: https://render.com/docs/free
- Koyeb Free instances: https://www.koyeb.com/docs/reference/instances
