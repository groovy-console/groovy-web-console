# Groovy Web Console

## Backend

### Building the backend

Go to `functions/function-executor` and type `mvn package`.
The output will be in `functions/function-executor/target/deployment`.

There are different profiles, one for each groovy version:

* `groovy_3_0` (default)
* `groovy_2_5`

Use `mvn package -P groovy_2_5`

### Deploying the backend

Go to https://github.com/glaforge/gwc-experiment/actions/workflows/deploy.yml and click on `Run Workflow`

## Frontend

### Building the frontend

You need to have Node 14 LTS installed.

1. Navigate to `services/frontend`
2. Install dependencies with `npm ci`
3. Build the frontend with `npm run build`

The output will be in `services/frontend/dist`.

### Running the frontend locally

Do the same steps as building the frontend but substitute the last command for: `npm run serve`

### Checking code style

You can check the code style with `npm run lint` and automatically fix most issues with `npm run lint-fix`.

### Deploy App Engine web frontend

The web frontend consists only of static assets (HTML, JavaScript, and CSS).
Go to https://github.com/glaforge/gwc-experiment/actions/workflows/deploy-frontend.yml and click on `Run Workflow`.

Alternatively, to deploy it manually after building it, go to the `services/frontend` directory, and type: `./deploy.sh`



