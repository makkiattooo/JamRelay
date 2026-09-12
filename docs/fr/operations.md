# Runbook d’exploitation

```bash
docker compose up -d --build
docker compose ps
docker compose logs --tail=100 tunelink
```

Vérifiez `/health`, les métadonnées OAuth, puis `get_devices` ou `get_currently_playing`. Sauvegardez `/data` avec sa clé de chiffrement associée, mais stockez la clé séparément. En cas d’incident, arrêtez le service, révoquez les secrets concernés, supprimez les stores touchés et testez d’abord les lectures.
