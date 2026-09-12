---
title: Despliegue gratis o económico
description: Ejecuta TuneLink gratis o con un presupuesto mensual muy pequeño.
---

# Despliegue gratis o económico

TuneLink necesita pocos recursos.

## Elegir según presupuesto

| Presupuesto         | Opción recomendada                          | Uso                     |
| ------------------- | ------------------------------------------- | ----------------------- |
| Gratis              | PC / servidor doméstico + Cloudflare Tunnel | Hardware que ya tienes  |
| Gratis              | VM free tier con almacenamiento persistente | Cloud sin cuota mensual |
| Bajo                | VPS pequeño con CPU compartida              | Hosting 24/7 sencillo   |
| Gratis para pruebas | PaaS free tier                              | Demos y pruebas         |

## Hosting gratuito en casa

```text
Cliente IA → HTTPS → Cloudflare Tunnel → TuneLink → Spotify
```

Funciona detrás de CGNAT y no requiere abrir puertos de entrada.

## VPS económico

Una instancia privada suele necesitar solo 1 vCPU compartida, 512 MB–1 GB de RAM y unos pocos GB de almacenamiento persistente. Para TuneLink por sí solo normalmente no hace falta una máquina mayor.

Proveedores como Hetzner, OVHcloud, DigitalOcean, Vultr y otros ofrecen VM pequeñas. Los precios cambian con frecuencia, por lo que esta documentación evita fijar una cifra concreta.

## Aviso sobre PaaS

El almacenamiento persistente es importante para los tokens cifrados de Spotify y los datos OAuth de MCP. Un filesystem efímero es adecuado principalmente para pruebas.

## Recomendación

Empieza gratis con hardware existente y contrata un VPS pequeño solo cuando necesites disponibilidad 24/7 independiente de tu conexión doméstica.
