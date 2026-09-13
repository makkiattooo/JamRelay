---
title: Options d’hébergement gratuites
description: 'Exécuter JamRelay sans VPS grâce à une machine locale, Cloudflare Tunnel, une VM gratuite ou un PaaS gratuit.'
---

# Options d’hébergement gratuites

Vous n’avez **pas besoin d’un VPS payant** pour exécuter JamRelay.

Pour la plupart des utilisateurs, la solution gratuite la plus simple est :

```text
Votre PC / serveur domestique
              ↓
         JamRelay
              ↓
       Cloudflare Tunnel
              ↓
https://mcp.example.com/mcp
```

Cloudflare Tunnel établit une connexion sortante depuis votre machine. Il n’est donc pas nécessaire d’avoir une adresse IP publique ni d’ouvrir des ports entrants sur le routeur.

> [!TIP]
> Si vous possédez déjà un PC, un ordinateur portable, un mini-PC, un Raspberry Pi ou un NAS pouvant rester allumé, c’est généralement la meilleure option gratuite.

## Option 1 — Ordinateur local + Cloudflare Tunnel

**Coût :** hébergement gratuit, hors électricité et éventuel coût d’un nom de domaine.

C’est l’alternative gratuite la plus proche d’un VPS.

### Prérequis

- Node.js 22+ ou Docker
- une machine pouvant rester active quand JamRelay doit être disponible
- un compte Cloudflare
- un domaine géré par Cloudflare si vous souhaitez un nom d’hôte stable

Démarrer JamRelay localement :

```bash
npm ci
npm run build
npm start
```

ou avec Docker :

```bash
docker compose up -d
```

Puis faire pointer un hostname Cloudflare Tunnel vers :

```text
http://127.0.0.1:5267
```

Votre endpoint MCP public peut alors ressembler à :

```text
https://mcp.example.com/mcp
```

### Avantages

- aucun serveur payant
- stockage local persistant
- aucune redirection de port
- fonctionne derrière un CGNAT
- aucune modification de l’architecture JamRelay
- migration facile vers un VPS plus tard

### Limites

- la machine doit rester allumée
- une panne de connexion domestique rend le service indisponible
- un ordinateur portable peut se mettre en veille sans configuration adaptée

---

## Option 2 — Serveur domestique, NAS ou Raspberry Pi

Si vous possédez déjà un serveur domestique ou un NAS, JamRelay représente une charge très légère.

Architecture typique :

```text
Docker
├── JamRelay
└── cloudflared
```

Conservez les données persistantes sur un volume, par exemple :

```text
/data
```

Cette option convient bien aux utilisateurs qui hébergent déjà Home Assistant, Pi-hole, un serveur multimédia ou d’autres services auto-hébergés.

> [!NOTE]
> Le NAS ou serveur doit pouvoir exécuter Node.js ou des conteneurs.

---

## Option 3 — VM cloud gratuite

Une VM gratuite est le remplacement le plus proche d’un VPS payant.

Oracle Cloud propose actuellement des ressources Compute **Always Free** dans les régions éligibles. Leur disponibilité réelle peut dépendre de la région et de la capacité disponible.

Le déploiement est presque identique à celui d’un VPS :

```text
VM cloud gratuite
├── Docker
│   └── JamRelay
└── cloudflared
```

### Avantages

- fonctionnement 24/7 possible
- stockage bloc persistant
- aucun matériel personnel requis
- le déploiement Docker existant est généralement réutilisable

### Limites

- la capacité gratuite n’est pas toujours disponible
- les limites et conditions du fournisseur peuvent évoluer
- une vérification de compte peut être requise
- il faut respecter les limites du free tier

> [!WARNING]
> Ne concevez pas JamRelay en supposant qu’une offre cloud gratuite restera inchangée pour toujours.

---

## Option 4 — PaaS gratuits

Des plateformes comme Render ou Koyeb peuvent exécuter gratuitement des services Node.js, mais elles ne sont **pas idéales pour JamRelay sans modifier le stockage persistant**.

JamRelay conserve des données OAuth sur disque, par exemple :

```text
/data/mcp-oauth.json
```

Les jetons Spotify doivent également rester persistants.

### Render Free

Les services web gratuits de Render :

- s’endorment après une période d’inactivité
- utilisent un système de fichiers local éphémère
- perdent les modifications locales après redémarrage, redéploiement ou mise en veille

Les données OAuth ou les jetons enregistrés localement peuvent donc disparaître.

### Koyeb Free

L’instance gratuite Koyeb :

- fournit un petit service web gratuit
- se met à l’échelle à zéro après une heure sans trafic
- ne permet pas de volume persistant sur l’instance gratuite

Le stockage local des jetons reste donc le principal problème.

### Quand un PaaS devient intéressant

Un PaaS gratuit devient beaucoup plus pratique si JamRelay prend en charge un stockage externe persistant, par exemple :

```text
PostgreSQL
KV compatible Redis
base de données managée
stockage key-value distant chiffré
```

D’ici là, utilisez surtout ces plateformes pour les tests.

---

## Comparaison

| Option                       |       Coût d’hébergement |            24/7 possible |  Stockage persistant | Modifications de JamRelay   |
| ---------------------------- | -----------------------: | -----------------------: | -------------------: | --------------------------- |
| PC local + Cloudflare Tunnel |                 Gratuit* | ✅ si le PC reste allumé |                   ✅ | Aucune                      |
| Serveur domestique / NAS     |                 Gratuit* |                       ✅ |                   ✅ | Aucune                      |
| VM cloud free tier           | Gratuit dans les limites |                       ✅ |                   ✅ | Aucune ou minime            |
| Render Free                  |                  Gratuit |                ⚠️ veille |     ❌ système local | Stockage externe recommandé |
| Koyeb Free                   |                  Gratuit |         ⚠️ scale-to-zero | ❌ volume persistant | Stockage externe recommandé |

\* Hors matériel, électricité et nom de domaine.

## Parcours recommandé

Pour un nouvel utilisateur :

```text
1. Exécuter JamRelay localement
2. Tester Spotify OAuth
3. Tester MCP localement
4. Ajouter Cloudflare Tunnel
5. Connecter le client IA
```

Passez ensuite à un VPS ou à une VM cloud uniquement si vous avez réellement besoin d’une disponibilité permanente 24/7.

## Sécurité

Un hébergement gratuit ne doit pas signifier moins de sécurité.

- ne jamais exposer `/mcp` sans authentification
- ne jamais committer `.env`
- utiliser des secrets OAuth et Bearer forts
- utiliser HTTPS
- conserver les jetons sur un stockage persistant
- ne pas exposer `/data`
- maintenir les dépendances et le système à jour

## Actualité des informations

Le marché de l’hébergement gratuit évolue fréquemment. Cette page a été vérifiée le **2026-09-12**.

Consultez toujours la documentation actuelle du fournisseur avant de dépendre d’un free tier.

### Références officielles

- Oracle Cloud Free Tier: https://docs.oracle.com/en-us/iaas/Content/FreeTier/freetier.htm
- Cloudflare Tunnel: https://developers.cloudflare.com/tunnel/
- Render Free: https://render.com/docs/free
- Koyeb Free instances: https://www.koyeb.com/docs/reference/instances
