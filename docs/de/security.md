# Sicherheit

TuneLink ist self-hosted. Der Betreiber schützt Host, HTTPS, Proxy, Secrets, Backups, Logs und Updates. `/data`, `.env` und OAuth-Secrets dürfen niemals öffentlich werden.

Die Anwendung nutzt State-Prüfung, exact Redirect URI, S256 PKCE, sichere Secret-Vergleiche, gehashte MCP-Tokens, verschlüsselte Spotify-Tokens, atomare Writes, Timeouts und Log-Redaction. Es gibt keine Multi-Tenancy, keinen WAF und keinen vollständigen Mutations-Audit.
