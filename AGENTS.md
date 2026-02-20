# Zack Game Agent Notes

## Local Server Reliability
- Do **not** rely on backgrounding `python3 -m http.server` in a one-off shell command for testing; in this environment that process may terminate when the command session exits.
- Run the dev server in a persistent session (`tty: true`) and keep that session alive while running browser tests.
- Validate server reachability before test runs:
  - `curl -I http://127.0.0.1:5173`
  - Expect `HTTP/1.0 200 OK` (or equivalent 2xx).
- Use `http://127.0.0.1:5173` for Playwright/web test URLs to avoid hostname edge cases.
- If tests return `ERR_CONNECTION_REFUSED`, re-check listener and restart server in a persistent session.
