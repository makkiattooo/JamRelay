# JamRelay — favicon / brand asset pack

W paczce są gotowe warianty jasne i ciemne oraz kilka poziomów rozmiaru/wagi.

## Foldery

- `00-masters/` — oczyszczone pliki bazowe z przezroczystością.
- `01-favicon/` — favicony 16/32/48/64 PNG + wielorozmiarowe ICO.
- `02-web-pwa/` — web, Apple Touch Icon, Android/PWA, maskable, Windows tile.
- `03-services/` — praktyczne presety pod Discord, GitHub, X, Slack i profile.
- `04-logos/` — logo w kilku rozmiarach.
- `05-social/` — Open Graph 1200×630 oraz karta X 1200×628.
- `06-webp-compressed/` — lekkie WebP w jakości high / medium / small.

## Nazewnictwo wariantów

- `light` = czarny znak przeznaczony na jasne tło.
- `dark` = biały znak przeznaczony na ciemne tło.

## Przykład favicon zależnego od motywu

```html
<link rel="icon" type="image/png" sizes="32x32"
      href="/favicons/light/favicon-32x32.png"
      media="(prefers-color-scheme: light)">
<link rel="icon" type="image/png" sizes="32x32"
      href="/favicons/dark/favicon-32x32.png"
      media="(prefers-color-scheme: dark)">
```

## Najczęściej używane pliki

- Browser: `favicon-32x32.png` + `favicon-*.ico`
- iPhone/iPad: `apple-touch-icon-180x180.png`
- PWA: `android-chrome-192x192.png`, `android-chrome-512x512.png`
- PWA maskable: `maskable-icon-512x512.png`
- Discord: `discord-server-icon-512x512.png`
- GitHub organizacja: `github-org-avatar-500x500.png`
- X profil: `x-profile-400x400.png`
- Link preview: `open-graph-*-1200x630.png`

Rozmiary usług są praktycznymi presetami eksportowymi; platformy mogą później same przeskalować grafikę.
