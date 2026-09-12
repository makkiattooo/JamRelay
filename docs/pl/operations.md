# Runbook operacyjny

```bash
docker compose up -d --build
docker compose ps
docker compose logs --tail=100 tunelink
```

Sprawdź `/health`, metadata OAuth, a potem z klienta `get_devices` lub `get_currently_playing`. `/data` zawiera zaszyfrowane tokeny Spotify i store MCP OAuth; backup musi być chroniony, a klucz szyfrowania przechowywany osobno.

Przy `reauthorization_required` ponownie autoryzuj Spotify. Przy podejrzeniu wycieku zatrzymaj usługę, unieważnij credential w źródle, usuń store OAuth lub token store zgodnie z zakresem incydentu, a następnie zweryfikuj odczyty przed zapisami. Nie zmieniaj `TOKEN_ENCRYPTION_KEY` bez planu migracji.
