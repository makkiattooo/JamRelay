---
title: Déploiement gratuit ou économique
description: Exécuter TuneLink gratuitement ou avec un très petit budget mensuel.
---

# Déploiement gratuit ou économique

TuneLink consomme peu de ressources.

## Choisir selon le budget

| Budget              | Option recommandée                          | Usage                        |
| ------------------- | ------------------------------------------- | ---------------------------- |
| Gratuit             | PC / serveur domestique + Cloudflare Tunnel | Matériel déjà disponible     |
| Gratuit             | VM free tier avec stockage persistant       | Cloud sans facture mensuelle |
| Faible              | Petit VPS à CPU partagé                     | Hébergement 24/7 simple      |
| Gratuit pour tester | PaaS free tier                              | Démonstrations et essais     |

## Hébergement gratuit à domicile

```text
Client IA → HTTPS → Cloudflare Tunnel → TuneLink → Spotify
```

Cette approche fonctionne derrière un CGNAT et ne nécessite pas d’ouvrir de ports entrants.

## Petit VPS économique

Une instance privée se contente généralement d’un vCPU partagé, de 512 Mo à 1 Go de RAM et de quelques Go de stockage persistant. Un serveur plus puissant est rarement nécessaire pour TuneLink seul.

Hetzner, OVHcloud, DigitalOcean, Vultr et d’autres fournisseurs proposent de petites VM. Les tarifs changent souvent, donc cette documentation évite de figer un prix précis.

## Attention aux PaaS

Le stockage persistant est important pour les jetons Spotify chiffrés et les données OAuth MCP. Un système de fichiers éphémère convient surtout aux tests.

## Recommandation

Commencez gratuitement sur du matériel existant, puis passez à un petit VPS uniquement si vous avez besoin d’une disponibilité 24/7 indépendante de votre domicile.
