# Runbook operativo

```bash
docker compose up -d --build
docker compose ps
docker compose logs --tail=100 jamrelay
```

Comprueba `/health`, los metadatos OAuth y luego `get_devices` o `get_currently_playing`. Haz copias protegidas de `/data` junto con su clave de cifrado, pero almacena la clave por separado. Ante un incidente, detén el servicio, revoca secretos, elimina los stores afectados y prueba primero las lecturas.
