# github-access

GCP Cloud Function that brokers GitHub OAuth + Gist API calls for the Groovy Web Console.

The console is otherwise stateless — the only durable server-side state lives here, and it's
limited to a single AES key used to encrypt the user's GitHub access token.

## What this function does

| Method | Path                              | Purpose                                                                  |
|--------|-----------------------------------|--------------------------------------------------------------------------|
| GET    | `/?action=login`                  | Start OAuth. 302 to `github.com/login/oauth/authorize`. Sets `state` cookie. |
| GET    | `/?code=…&state=…`                | OAuth callback. Sets `gwc_session` cookie. Returns inline HTML that `postMessage`s the opener and closes the popup. |
| GET    | `/?action=me`                     | Authenticated. Returns `{login, avatar_url}` (`/user` on github.com).    |
| GET    | `/?action=gist&id=<id>`           | Authenticated. Returns `{id, filename, code, ownerLogin, public}` for the first non-truncated Groovy file. |
| POST   | `/?action=gist`                   | Authenticated. Body `{name, public, code, output?}` — creates a gist, returns `{id, filename, public}`. |
| PATCH  | `/?action=gist&id=<id>`           | Authenticated. Body `{filename, code, output?}` — updates the existing Groovy file (keeps its filename). |
| POST   | `/?action=logout`                 | Clears `gwc_session`.                                                    |
| OPTIONS| any                               | CORS preflight.                                                          |
| GET    | anything else                     | 302 to `$FRONTEND_ORIGIN/` — humans browsing the function origin go home. |

## Session model

The user's GitHub access token never reaches the browser in plaintext.

1. After a successful OAuth exchange the function encrypts the `TokenResponse` JSON with
   AES-128-GCM (JWE direct encryption, see `SessionTokenCodec`) using `SECRET_KEY`.
2. The resulting JWE blob is set as a cookie:
   ```
   gwc_session=<jwe>; Domain=.<frontend-host>; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=2592000
   ```
3. Subsequent authenticated requests carry the cookie via `credentials: 'include'` from the
   frontend. The function decrypts on each call.
4. `Domain=.<frontend-host>` lets the cookie work on both the frontend apex
   (`groovyconsole.dev`) and the access subdomain (`access.groovyconsole.dev`).

`HttpOnly` means a JS XSS bug on the frontend can't exfiltrate the cookie. An attacker would
still be able to *use* it via same-origin fetches in the victim's session, but can't copy it
elsewhere.

### CSRF

`SameSite=Lax` blocks cross-site form POSTs. The function also requires the `Origin` header
on every state-changing request (`POST` / `PATCH` / `DELETE`) to match `FRONTEND_ORIGIN`,
returning 403 otherwise.

### OAuth `state`

`?action=login` mints a random UUID, sets it as a separate `state` cookie (same security
attributes as the session cookie, 10-minute lifetime), and embeds the same value as the
`state` query parameter. The callback rejects mismatches with 401.

## Required environment variables

| Var                    | Notes |
|------------------------|-------|
| `GITHUB_CLIENT_ID`     | From the GitHub OAuth App. |
| `GITHUB_CLIENT_SECRET` | From the GitHub OAuth App. |
| `GITHUB_REDIRECT_URI`  | Must match the OAuth App's authorized callback URL exactly. In production: `https://access.groovyconsole.dev/`. |
| `SECRET_KEY`           | Base64url-encoded 16-byte AES key. Generate via `KeyGen.groovy` (see below). |
| `FRONTEND_ORIGIN`      | The console's origin (scheme + host, no trailing slash). Used for CORS allow-origin, CSRF Origin check, `postMessage` target origin, and as the basis for the cookie's `Domain` attribute (the function strips the scheme and prepends a leading dot — e.g. `https://groovyconsole.dev` → `Domain=.groovyconsole.dev` — so the cookie is valid on both the apex and any subdomain). In production: `https://groovyconsole.dev`. |

All five are validated at function startup; missing or bad values fail loudly via
`Config.fromEnv()` before any request is served.

### Generating `SECRET_KEY`

```sh
cd functions/github-access
../../mvnw -q test-compile exec:java \
  -Dexec.mainClass=KeyGen \
  -Dexec.classpathScope=test \
  -P groovy_4_0
```

Or open `src/test/groovy/KeyGen.groovy` in an IDE and run `main` directly.

Output is a 22-char URL-safe base64 string. Store it as the `GH_ACCESS_SECRET_KEY` GitHub
Actions secret on the `github-access-deploy` environment. Rotating the key invalidates every
live session — users will be silently signed out on their next `?action=me`.

## Build & deploy

### Build

```sh
cd functions/github-access
../../mvnw -B package
```

Produces `target/deployment/` with the thin JAR + libs layout that Cloud Functions Gen 2
expects.

### Deploy

Triggered manually via the `Deploy GitHub Access` workflow
(`.github/workflows/deploy-github-access.yml`). Secrets live in the `github-access-deploy`
environment.

The workflow pre-validates `SECRET_KEY` (base64url-decodes it and checks it's 16 bytes)
before calling `gcloud`, so a misconfigured key fails the GHA step rather than crashing the
function at startup.

### Custom domain

The function is served at `https://access.groovyconsole.dev` via a Cloud Run domain
mapping. The same-site cookie design depends on this being a subdomain of
`groovyconsole.dev`. Setup is one-time:

1. Verify domain ownership in GCP.
2. `gcloud run domain-mappings create --service=github-access --domain=access.groovyconsole.dev --region=europe-west1 --platform=managed`
3. Add the CNAME record at the DNS provider pointing `access.groovyconsole.dev` to GCP's target.
4. Update the GitHub OAuth App's authorized callback URL to `https://access.groovyconsole.dev/`.

## Tests

```sh
cd functions/github-access
../../mvnw -B test
```

`GithubAccessExecutorTest` uses WireMock to stand in for `github.com` and `api.github.com`
via `Config`'s `tokenExchangeUrl` and `githubApiBaseUrl` knobs. `ConfigTest` covers the
SECRET_KEY length guard.

## Operational notes

- **Logging:** the function must never log JWE blobs, raw access tokens, or `Cookie` /
  `Authorization` header values. The codec is the only place those values exist in plaintext
  on the server.
- **Stateless:** there is no DB, no Redis, no session store. The cookie *is* the session;
  rotating `SECRET_KEY` invalidates all sessions atomically.
- **Token lifetime:** GitHub-issued OAuth App tokens don't expire by default. The cookie
  itself has `Max-Age=2592000` (30 days) and the frontend re-checks via `?action=me` on
  every page load.
