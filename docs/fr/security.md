# Sécurité

TuneLink est auto-hébergé. L’opérateur protège l’hôte, HTTPS, le proxy, les secrets, les sauvegardes, les logs et les mises à jour. `/data` et `.env` ne doivent jamais être publics.

L’implémentation utilise state, redirect URI exacte, S256 PKCE, comparaison sûre, tokens MCP hachés, tokens Spotify chiffrés, écritures atomiques, timeouts et filtrage des logs. Elle ne fournit ni multi-tenant, ni WAF, ni audit complet des mutations.
