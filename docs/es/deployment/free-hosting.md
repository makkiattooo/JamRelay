---
title: Opciones de hosting gratuitas
description: 'Ejecuta JamRelay sin VPS usando un equipo local, Cloudflare Tunnel, una VM gratuita o una plataforma PaaS gratuita.'
---

# Opciones de hosting gratuitas

No necesitas **un VPS de pago** para ejecutar JamRelay.

Para la mayoría de usuarios, la opción gratuita más sencilla es:

```text
Tu PC / servidor doméstico
            ↓
       JamRelay
            ↓
     Cloudflare Tunnel
            ↓
https://mcp.example.com/mcp
```

Cloudflare Tunnel crea una conexión saliente desde tu equipo, por lo que no necesitas una IP pública ni abrir puertos de entrada en el router.

> [!TIP]
> Si ya tienes un PC, portátil, mini-PC, Raspberry Pi o NAS que pueda permanecer encendido, normalmente es la mejor opción gratuita.

## Opción 1 — Equipo local + Cloudflare Tunnel

**Coste:** hosting gratuito, sin contar electricidad ni el posible coste del dominio.

Es la alternativa gratuita más parecida a un VPS.

### Requisitos

- Node.js 22+ o Docker
- un equipo que pueda permanecer encendido mientras JamRelay deba estar disponible
- una cuenta de Cloudflare
- un dominio gestionado por Cloudflare si quieres un hostname estable

Ejecuta JamRelay localmente:

```bash
npm ci
npm run build
npm start
```

o con Docker:

```bash
docker compose up -d
```

Después apunta un hostname de Cloudflare Tunnel al servicio local:

```text
http://127.0.0.1:5267
```

Tu endpoint MCP público puede quedar así:

```text
https://mcp.example.com/mcp
```

### Ventajas

- sin servidor de pago
- almacenamiento local persistente
- sin redirección de puertos
- funciona detrás de CGNAT
- mantiene la arquitectura actual de JamRelay
- es fácil migrarlo a un VPS más adelante

### Limitaciones

- el equipo debe permanecer encendido
- una caída de la conexión doméstica deja el servicio fuera de línea
- un portátil puede suspenderse si no cambias la configuración de energía

---

## Opción 2 — Servidor doméstico, NAS o Raspberry Pi

Si ya tienes un servidor doméstico o NAS, JamRelay consume muy pocos recursos.

Una configuración típica:

```text
Docker
├── JamRelay
└── cloudflared
```

Mantén los datos persistentes en un volumen, por ejemplo:

```text
/data
```

Es una buena opción para usuarios que ya alojan Home Assistant, Pi-hole, servidores multimedia u otros servicios self-hosted.

> [!NOTE]
> El NAS o servidor debe poder ejecutar Node.js o contenedores.

---

## Opción 3 — VM gratuita en la nube

Una máquina virtual gratuita es el sustituto más cercano a un VPS de pago.

Oracle Cloud ofrece actualmente recursos Compute **Always Free** en regiones elegibles. La disponibilidad real puede depender de la región y de la capacidad libre.

El despliegue es prácticamente igual que en un VPS normal:

```text
VM gratuita
├── Docker
│   └── JamRelay
└── cloudflared
```

### Ventajas

- puede funcionar 24/7
- almacenamiento persistente
- no requiere hardware en casa
- normalmente puedes reutilizar el despliegue Docker existente

### Limitaciones

- la capacidad gratuita puede no estar disponible
- los límites y condiciones del proveedor pueden cambiar
- puede ser necesaria la verificación de la cuenta
- hay que mantenerse dentro de los límites del free tier

> [!WARNING]
> No diseñes JamRelay suponiendo que un plan gratuito de terceros existirá para siempre sin cambios.

---

## Opción 4 — PaaS gratuitos

Plataformas como Render o Koyeb pueden ejecutar servicios Node.js gratis, pero **no son ideales para JamRelay sin cambiar el almacenamiento persistente**.

JamRelay guarda datos OAuth en disco, por ejemplo:

```text
/data/mcp-oauth.json
```

y también necesita almacenar de forma persistente los tokens de Spotify.

### Render Free

Los servicios web gratuitos de Render:

- se suspenden tras un periodo de inactividad
- usan un sistema de archivos local efímero
- pierden los cambios locales tras reinicios, redeploys o suspensión

Por tanto, los datos OAuth o tokens guardados localmente pueden desaparecer.

### Koyeb Free

La instancia gratuita de Koyeb:

- ofrece un pequeño servicio web gratuito
- escala a cero después de una hora sin tráfico
- no admite Volumes persistentes en la instancia gratuita

De nuevo, el principal problema es el almacenamiento local de tokens.

### Cuándo tiene sentido un PaaS

Un PaaS gratuito será mucho más adecuado si JamRelay añade un almacén externo persistente, por ejemplo:

```text
PostgreSQL
KV compatible con Redis
base de datos gestionada
almacén key-value remoto cifrado
```

Hasta entonces, es mejor usar estas plataformas principalmente para pruebas.

---

## Comparación

| Opción                       |         Coste de hosting |              24/7 posible | Almacenamiento persistente | Cambios en JamRelay                |
| ---------------------------- | -----------------------: | ------------------------: | -------------------------: | ---------------------------------- |
| PC local + Cloudflare Tunnel |                  Gratis* | ✅ si permanece encendido |                         ✅ | Ninguno                            |
| Servidor doméstico / NAS     |                  Gratis* |                        ✅ |                         ✅ | Ninguno                            |
| VM cloud free tier           | Gratis dentro de límites |                        ✅ |                         ✅ | Ninguno o mínimos                  |
| Render Free                  |                   Gratis |             ⚠️ suspensión |        ❌ filesystem local | Almacenamiento externo recomendado |
| Koyeb Free                   |                   Gratis |          ⚠️ scale-to-zero |      ❌ volume persistente | Almacenamiento externo recomendado |

\* No incluye hardware, electricidad ni dominio.

## Ruta recomendada

Para un usuario nuevo:

```text
1. Ejecutar JamRelay localmente
2. Verificar Spotify OAuth
3. Verificar MCP localmente
4. Añadir Cloudflare Tunnel
5. Conectar el cliente de IA
```

Migra a un VPS o VM cloud solo cuando necesites disponibilidad real 24/7.

## Seguridad

Hosting gratuito no debe significar peor seguridad.

- no expongas `/mcp` sin autenticación
- nunca hagas commit de `.env`
- usa secretos OAuth y Bearer fuertes
- usa HTTPS
- mantén persistente el almacenamiento de tokens
- no expongas `/data`
- mantén actualizadas las dependencias y el sistema anfitrión

## Actualidad

El mercado de hosting gratuito cambia con frecuencia. Esta página fue revisada el **2026-09-12**.

Comprueba siempre la documentación actual del proveedor antes de depender de un free tier.

### Referencias oficiales

- Oracle Cloud Free Tier: https://docs.oracle.com/en-us/iaas/Content/FreeTier/freetier.htm
- Cloudflare Tunnel: https://developers.cloudflare.com/tunnel/
- Render Free: https://render.com/docs/free
- Koyeb Free instances: https://www.koyeb.com/docs/reference/instances
