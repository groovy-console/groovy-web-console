# Groovy Web Console

## Backend

### Building the backend

Go to `functions/groovy-executor` and type `../../mvnw package`.
The output will be in `functions/groovy-executor/target/deployment`.

There are different profiles, one for each groovy version:

* `groovy_6_0_alpha` (no Spock — see below)
* `groovy_5_0`
* `groovy_4_0` (default)
* `groovy_3_0`

Use `../../mvnw package -P groovy_5_0`

> **Switching profiles locally requires `clean`.** Each profile compiles a
> different set of (test) sources, so run e.g. `../../mvnw clean package -P groovy_6_0_alpha`.
> Without `clean`, stale classes from a previous profile linger in `target/` and
> can cause a confusing `spock/lang/Specification` failure when building the
> Spock-free `groovy_6_0_alpha` variant. (CI is unaffected — it builds from a
> fresh checkout.)

#### Groovy 6 (pre-release, no Spock)

Spock has no release compatible with Groovy 6 yet, so the `groovy_6_0_alpha`
variant ships **without** Spock. Plain Groovy scripts run normally; submitting a
Spock specification (or using the AST view) returns a "not supported on this
Groovy version yet" message instead. The concrete alpha version is controlled by
the `groovy.6.version` property in `functions/pom.xml`, so bumping to a newer
alpha is a one-line change deployed to the same `groovy_6_0_alpha` function.
Because the runtime id contains `alpha`, the frontend never selects it as the
default version.

### Deploying the backend

Go to https://github.com/groovy-console/groovy-web-console/actions/workflows/deploy.yml and click on `Run Workflow`

## Frontend

### Building the frontend

You need to have Node 16 LTS installed.

1. Navigate to `services/frontend`
2. Install dependencies with `npm ci`
3. Build the frontend with `npm run build`

The output will be in `services/frontend/dist`.

### Running the frontend locally

Do the same steps as building the frontend but substitute the last command for:

 * `npm run serve-remote` to run the frontend with the remote backend
 * `npm run serve-local` to run the frontend with the local backend (start it with `../../mvnw function:run` from inside `functions/groovy-executor`)

### Checking code style

You can check the code style with `npm run lint` and automatically fix most issues with `npm run lint-fix`.

### Deploy App Engine web frontend

The web frontend consists only of static assets (HTML, JavaScript, and CSS).
Go to https://github.com/groovy-console/groovy-web-console/actions/workflows/deploy-frontend.yml and click on `Run Workflow`.

Alternatively, to deploy it manually after building it, go to the `services/frontend` directory, and type: `./deploy.sh`
