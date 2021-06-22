# gwc-experiment

## Deploy App Engine web frontend

The web frontend is made only of static assets (HTML, JavaScript, and CSS).
To deploy it manually, go to the `www` directory, and type:

````
gcloud app deploy . --appyaml ../app.yaml -q
```