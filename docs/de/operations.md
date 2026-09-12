# Betriebsleitfaden

```bash
docker compose up -d --build
docker compose ps
docker compose logs --tail=100 tunelink
```

Prüfe `/health`, OAuth-Metadaten und danach `get_devices` oder `get_currently_playing`. Sichere `/data`-Backups mit dem passenden Verschlüsselungsschlüssel, aber verwahre diesen separat. Bei einem Vorfall Dienst stoppen, Secrets am Ursprung widerrufen, betroffene Stores löschen und zuerst Read-Tools testen.
