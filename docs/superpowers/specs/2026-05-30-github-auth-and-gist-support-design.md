# GitHub auth & gist read/write — design

## Goal

Finish the long-stalled `functions/github-access` work so a signed-in user can:

1. Read public gists at higher rate limits, and read their own private gists.
2. Save the current script as a new gist (public or secret).
3. Update an existing gist they own with the current script (and optional output).

The Groovy Web Console stays stateless: no database, no user store. The only durable server-side secret is the AES key used to encrypt GitHub access tokens. All other state lives in the browser or in URLs.

## Non-goals

- Output as a gist by itself (output is only ever saved alongside its script).
- Multi-file editing in the console.
- Forking, starring, commenting, or any gist API beyond GET/POST/PATCH single-gist.
- OAuth scopes beyond `gist`.
- Account linking, profile management, or any persisted server state.

## Current state

`functions/github-access/src/main/java/gwc/github/GithubAccessExecutor.java` (commit `6a5cce7`, April 2022) implements only the OAuth handshake:

- `GET ?action=login` → 302 to `github.com/login/oauth/authorize` with `scope=gist`, sets a `state` cookie.
- OAuth callback (`GET ?code=&state=`) → validates the state cookie, exchanges the code for an access token at GitHub, requires the `gist` scope, then writes a JWE-encrypted (AES-128-GCM direct, server-side `SECRET_KEY`) token blob into the response body.
- `decryptToken()` is defined but never called from any endpoint.

Frontend `services/frontend/src/ts/github.ts:loadGist()` calls the GitHub API **anonymously** and extracts the first non-truncated Groovy file. No login UI, no token persistence, no Save button wired up (the `Save` button in `index.html` is `is-hidden`).

Pre-existing infrastructure bugs to fix as part of this work:

- `.github/workflows/build-github-access.yml` runs `pushd functions/groovy-executor` — wrong directory, builds the executor instead of github-access.
- `.github/workflows/deploy-github-access.yml` deploys with `--runtime java11` while the rest of the project moved to Java 21.

## Architecture

### Hosting and origins

- **Frontend:** App Engine, served at `https://groovyconsole.dev`.
- **Function:** Cloud Functions Gen 2 (Cloud Run-backed), mapped to `https://access.groovyconsole.dev` via `gcloud run domain-mappings`.

`access.groovyconsole.dev` and `groovyconsole.dev` are **different origins** for CORS (so CORS headers are still required) but the **same site** for cookies (so a cookie with `Domain=.groovyconsole.dev` is visible to both).

### Session model: JWE in HttpOnly cookie

Tokens never reach the browser in plaintext. The OAuth callback:

1. Exchanges the OAuth code for a GitHub access token.
2. Verifies the token's scope includes `gist`.
3. Encrypts the token as a JWE blob using the existing `SECRET_KEY` (AES-128-GCM direct encryption — already implemented).
4. Sets a cookie: `gwc_session=<jwe>; Domain=.groovyconsole.dev; HttpOnly; Secure; SameSite=Lax; Path=/`.

All authenticated calls send the cookie automatically via `fetch(..., { credentials: 'include' })`. The function decrypts on each call; if decryption fails or GitHub returns 401, the function returns 401.

**Why HttpOnly cookie, not localStorage:** an XSS bug on the frontend cannot exfiltrate the cookie (it's HttpOnly). The attacker can still *use* the cookie via same-origin fetches in the victim's session, but cannot copy it elsewhere — significantly smaller blast radius for a public Groovy console.

### Popup-based OAuth flow

The sign-in click opens a popup; the main editor stays untouched.

1. **Main window**, on Sign-in click: `window.open('https://access.groovyconsole.dev/?action=login', 'gwc-login', 'width=600,height=700')`. Before opening, registers a `message` event listener.
2. **Popup**: function 302 to GitHub OAuth authorize URL. User authenticates and authorizes.
3. **GitHub** 302 to the function's callback URL with `?code=&state=`.
4. **Function callback handler:** validates state, exchanges code, encrypts token, sets the `gwc_session` cookie, and returns `200 OK` with this inline HTML body (no redirect):
   ```html
   <!doctype html><script>
     window.opener?.postMessage({type:'gwc:login-success'}, 'https://groovyconsole.dev');
     window.close();
   </script>
   ```
5. **Main window** message listener: rejects messages where `event.origin !== location.origin` or `event.source !== popup`; on a matching `gwc:login-success`, calls `?action=me`, populates `currentUser`, refreshes buttons, detaches the listener.
6. **Cancellation detection:** `setInterval` polls `popup.closed` every 500ms. If the popup closes without sending the success message → silent cleanup.
7. **Popup-blocker fallback:** if `window.open` returns `null`, fall back to a full-page redirect to `?action=login` (in which case the function would need a redirect mode — see "Fallback redirect mode" below).

The cookie is set on `.groovyconsole.dev`, so when the main window's next request to `access.groovyconsole.dev` fires, the browser sends it.

### Fallback redirect mode

If the popup is blocked, the function needs a non-popup mode for the callback that just redirects back to the frontend rather than emitting `postMessage` HTML.

- Sign-in URL becomes `?action=login&mode=redirect` for the fallback.
- Function records the mode in the OAuth `state` (e.g., `state=<uuid>:<mode>`) so the callback knows whether to return HTML or 302 to `https://groovyconsole.dev/`.

This is the only complication added by supporting the fallback. Skip it for the initial implementation if popup blocking turns out not to be an issue in practice.

### CSRF defense

- `gwc_session` is `SameSite=Lax`, which blocks cross-site form POSTs.
- The function additionally requires `Origin: https://groovyconsole.dev` on every state-changing request (`POST`, `PATCH`, `DELETE`) and rejects with 403 otherwise. Cheap defense-in-depth.

### Logging

The function must not log JWE blobs, decrypted tokens, or `Authorization`/`Cookie` headers. Add a comment near the encrypt/decrypt helpers as a guardrail for future contributors.

## Function endpoints

All under `https://access.groovyconsole.dev`. JWE comes from the `gwc_session` cookie. Errors: `401` when the cookie is missing/invalid or GitHub returns 401; `403` when CSRF origin check fails; `400` for invalid request bodies; `4xx` from GitHub are passed through with a short text body.

| Method | Query / path | Body | Returns | Description |
|---|---|---|---|---|
| `GET` | `?action=login` | – | 302 to GitHub authorize | Existing. Sets `state` cookie. |
| `GET` | callback (`?code=&state=`) | – | 200 with inline `postMessage` HTML, sets `gwc_session` cookie | Modified. (Or 302 to `/` in fallback redirect mode.) |
| `POST` | `?action=logout` | – | 204, clears `gwc_session` | New. Origin check required. |
| `GET` | `?action=me` | – | `{login, avatar_url}` | New. Proxies `GET /user`. 401 if not authed. |
| `GET` | `?action=gist&id=<id>` | – | `{code, ownerLogin, public}` | New. Proxies `GET /gists/{id}`, picks the first non-truncated Groovy file. |
| `POST` | `?action=gist` | `{name, public, code, output?}` | `{id, public}` | New. Creates a gist. Origin check required. |
| `PATCH` | `?action=gist&id=<id>` | `{code, output?}` | `{id}` | New. Updates the Groovy file (keeps its current filename); updates `output.txt` if `output` supplied. Origin check required. |
| `OPTIONS` | any | – | 204 with CORS headers | New. Preflight handler. |

### CORS headers

- `Access-Control-Allow-Origin: https://groovyconsole.dev` (echoed only when the request's `Origin` matches; never `*`).
- `Access-Control-Allow-Credentials: true`.
- `Access-Control-Allow-Methods: GET, POST, PATCH, OPTIONS`.
- `Access-Control-Allow-Headers: Content-Type`.
- `Vary: Origin`.

### Gist payload semantics

**Create (`POST`):**
- `name` (required, trimmed, non-empty): used as both the gist `description` and (slugified + `.groovy` suffix) as the filename.
- `public` (required boolean): public vs secret gist.
- `code` (required): Groovy source.
- `output` (optional string): if present, a second file `output.txt` is created with this content.

**Update (`PATCH`):**
- `code` (required): replaces the content of the existing Groovy file (the file keeps its current filename — slug is not recomputed).
- `output` (optional): if present, overwrites `output.txt` (or creates it if it didn't exist). If absent, `output.txt` is left untouched. There is **no path that deletes `output.txt`** — it accumulates intentionally.

**Read (`GET`):** returns the first non-truncated Groovy file's content, the gist owner's login, and the gist's public/secret flag.

### Slug rules

Lowercase, ASCII-only, non-alphanumerics replaced with `-`, runs of `-` collapsed, leading/trailing `-` stripped, max length 64. Empty result (e.g., user typed only emoji) falls back to `script`. Final filename = `<slug>.groovy`.

## Frontend changes

### Modules

- New `services/frontend/src/ts/auth.ts`: holds `currentUser: { login, avatar_url } | null` and `loadedGist: { id, public, ownerLogin } | null`. Exposes `signIn()`, `signOut()`, `refreshMe()`, `refreshButtons()`, plus subscriber hooks.
- `services/frontend/src/ts/github.ts`: keep the existing anonymous `loadGist`; add `loadGistAuth(id)`, `createGist(payload)`, `updateGist(id, payload)`, all using `fetch(..., { credentials: 'include' })`.
- `services/frontend/src/ts/view.ts`: wire the new buttons, modal, navbar dropdown, and message listener.
- `services/frontend/src/ts/types.ts`: add `User`, `GistMetadata`, and request/response types.

### Navbar (`services/frontend/src/templates/index.html`)

Replace the existing static "GitHub" navbar item (the one currently linking to the repo) with an account item that renders by state:

- **Logged out:** `<a class="navbar-item" data-action="sign-in">Sign in with GitHub</a>`.
- **Logged in:** a navbar dropdown showing `[avatar 24px] @login` and a `Sign out` item. Same dropdown pattern as the existing color-mode menu.

The repo link moves to its own separate navbar item to its right (still always visible).

### Action bar (next to Execute / Share as Link)

New buttons, all hidden when logged out:

| Loaded gist state | Buttons shown |
|---|---|
| No `?gist=` in URL | `Save as public gist`, `Save as secret gist` |
| `?gist=<id>` and user owns it | `Update gist`, `Save as new gist` (visibility inherits the loaded gist) |
| `?gist=<id>` and user does not own it | `Save as public gist`, `Save as secret gist` |

### Save modal (Bulma `modal`)

Opens on any of the "Save…" clicks (not on "Update gist", which is silent).

- One text input "Name" (required, trimmed; empty → inline "Name is required").
- One checkbox "Include output" — shown only if `executionResult.out || executionResult.err || executionResult.result` is non-empty. Unchecked by default.
- Save button kicks off `POST /?action=gist`. On success: store the returned id, set `?gist=<id>` in the URL with `history.replaceState`, update `loadedGist`, call `refreshButtons()`.
- Cancel closes the modal without firing a request.

### Update flow

Click "Update gist" → no modal → `PATCH /?action=gist&id=<loadedGist.id>` with the current code and (if any output exists) the current output. On success: brief inline confirmation, no URL change.

### Page load

1. Call `?action=me` with `credentials: 'include'`. 200 → set `currentUser`. 401 → leave `currentUser = null`. Network error → leave `currentUser = null` and `console.info` (expected for not-logged-in users; no warn).
2. If `?gist=<id>` is in the URL:
   1. Try the anonymous `loadGist` first (fast, no proxy hop).
   2. The anonymous response includes `owner.login` and the gist's `public` boolean — stash both in `loadedGist` (`{id, public, ownerLogin}`).
   3. On anonymous 404 or 403 **and** `currentUser` is set (or once `?action=me` resolves with a user) → retry via `?action=gist&id=<id>`; populate `loadedGist` from the proxied response.
3. `refreshButtons()`.

### Sign-in / Sign-out wiring

Sign-in click:
1. Attach `message` listener (filtering on origin and source).
2. `popup = window.open(...)`. If `popup` is `null`, fall back to full-page redirect.
3. Start `setInterval` polling `popup.closed` to detect cancellation.
4. On `gwc:login-success` message: call `refreshMe()` → `refreshButtons()`, detach listener, clear interval.

Sign-out click: `fetch('https://access.groovyconsole.dev/?action=logout', { method: 'POST', credentials: 'include' })`, then set `currentUser = null` and `refreshButtons()`.

### Error UX

- 401 from any authenticated call: clear `currentUser`, refresh buttons, show small inline notification *"Your GitHub session expired. Please sign in again."* (Bulma notification component). No automatic redirect.
- 5xx or network error from `?action=gist` create/update: notification *"Could not save gist."* Editor untouched. No retry loop.

## Tests

### Function (`functions/github-access`)

Spock + WireMock are already declared as test deps and currently unused. Add:

- OAuth callback: state cookie mismatch → 401; valid state + GitHub non-200 → 401; valid state + missing `gist` scope → 403 (existing behavior); valid + has `gist` scope → 200 with inline `postMessage` HTML body and a `Set-Cookie` for `gwc_session` carrying the right attributes (`Domain=.groovyconsole.dev`, `HttpOnly`, `Secure`, `SameSite=Lax`).
- `?action=me`: no cookie → 401; invalid JWE → 401; valid JWE + WireMock-stubbed `/user` → 200 with `{login, avatar_url}`.
- `?action=gist&id=…` GET: 200 path returns code/owner/public; GitHub 404 → 404; truncated Groovy file → 400 with a useful message.
- `?action=gist` POST: validates body (missing `name` / `public` / `code` → 400), slug correctness, calls GitHub via WireMock, returns new id.
- `?action=gist&id=…` PATCH: updates Groovy file content, keeps original filename, overwrites `output.txt` only when `output` is supplied.
- `?action=logout`: returns 204 + a `Set-Cookie` that clears `gwc_session`.
- CORS: OPTIONS → 204 with the right `Access-Control-Allow-*` headers; non-allowed `Origin` → no allow-origin header echoed.
- Origin check: `POST` / `PATCH` without a matching `Origin` header → 403.

### Frontend (Cypress)

Extend `services/frontend/cypress/e2e/console-init.spec.cy.ts` and/or add new specs:

- Stub `?action=me` 200 → assert avatar + username render, Save buttons appear.
- Stub `?action=me` 401 → assert Sign-in button stays, Save buttons hidden.
- Stub `POST /?action=gist` → click "Save as public", fill modal, assert request body matches expected, assert URL becomes `?gist=<returned-id>`, assert buttons flip to `Update gist` / `Save as new gist`.
- Stub `PATCH /?action=gist&id=…` → from an owned-gist state, click `Update gist`, assert request body, assert no modal opens.
- Sign-in click: verify `window.open` is called with the expected URL; simulate a `postMessage({type:'gwc:login-success'})` from the test and verify `?action=me` is called and the UI flips to logged-in.
- Anonymous gist fallback: pre-existing `cypress/fixtures/gist-58f61.json` continues to drive the anonymous load test; add a new test for the private-gist case (anonymous 404 → proxied retry succeeds).

## Infrastructure

### Workflow fixes

- `.github/workflows/build-github-access.yml`: change `pushd functions/groovy-executor` to `pushd functions/github-access`.
- `.github/workflows/deploy-github-access.yml`: change `--runtime java11` to `--runtime java21`.

### Deploy env vars

The deploy step needs to pass:
- `GITHUB_CLIENT_ID` (existing).
- `GITHUB_CLIENT_SECRET` (existing).
- `GITHUB_REDIRECT_URI=https://access.groovyconsole.dev/` (existing; new value).
- `SECRET_KEY` (existing).
- `FRONTEND_ORIGIN=https://groovyconsole.dev` (new; used for the `postMessage` target origin, CORS allow-origin, and origin check). Required — the function fails fast at startup if unset, same pattern as the existing `GITHUB_CLIENT_ID` etc.

### One-time GCP/DNS work (outside this branch)

1. Verify ownership of `groovyconsole.dev` in GCP Search Console.
2. `gcloud run domain-mappings create --service=github-access --domain=access.groovyconsole.dev --region=europe-west1 --platform=managed`.
3. Add the CNAME record at the DNS provider pointing `access.groovyconsole.dev` to the GCP-provided target.
4. Update the GitHub OAuth App's authorized callback URL to `https://access.groovyconsole.dev/`.

## Implementation order

Each step should be independently testable and ideally a separate commit.

1. **Function scaffolding.** CORS handler, OPTIONS preflight, origin check helper, `?action=logout`, tests. Fix the build/deploy workflow bugs in this commit.
2. **Function OAuth callback change.** Switch from JWE-in-body to `Set-Cookie` + inline `postMessage` HTML. Update existing callback tests.
3. **Function `?action=me`** with tests.
4. **Function gist endpoints (GET / POST / PATCH)** with tests.
5. **Frontend auth state + navbar UI.** Popup sign-in, `postMessage` listener, `?action=me` on load, avatar dropdown, logout.
6. **Frontend Save / Update buttons + modal**, URL update on save.
7. **Frontend gist load fallback** through the proxy for private/rate-limited cases.
8. **Cypress coverage** for the new flows.
9. **Ops (separate ticket — needs DNS/GCP access):** domain mapping, CNAME, OAuth App callback URL update.

## Open questions

- Should the deployed function move to a stricter region / autoscaling config now that it's user-facing? Out of scope for this design; keep the existing `--region=europe-west1 --memory=8192MB`.
- Do we want a "View on github.com" link to the saved gist as a follow-up — Save success could show `Saved → <link>` for a few seconds. Easy to add later; not in v1.
