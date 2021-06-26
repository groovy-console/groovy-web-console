const fetch = require('node-fetch')

exports.listRuntimes = async (req, res) => {
  res.set('Access-Control-Allow-Origin', '*')

  // based on https://cloud.google.com/functions/docs/samples/functions-http-cors?hl=de#functions_http_cors-nodejs
  if (req.method === 'OPTIONS') {
    // Send response to OPTIONS requests
    res.set('Access-Control-Allow-Methods', 'GET')
    res.set('Access-Control-Allow-Headers', 'Content-Type')
    res.set('Access-Control-Max-Age', '3600')
    res.status(204).send('')
  } else {
    const { GoogleAuth } = require('google-auth-library')
    const auth = new GoogleAuth()
    const token = await auth.getAccessToken()
    console.log('Token', token)

    const project = 'gwc-experiment'
    const location = 'europe-west1'
    const parent = `projects/${project}/locations/${location}`

    try {
      const resp = await fetch(`https://cloudfunctions.googleapis.com/v1/${parent}/functions`, {
        headers: {
          'accept': 'application/json',
          'content-type': 'application/json',
          'authorization': `Bearer ${token}`
        },
      })
      const json = await resp.json()
      const functions = json.functions
        .filter(fn => fn.name.indexOf('groovy') > -1)
        .map(fn => fn.name)
        .map(name => name.substring(name.indexOf('groovy_')))

      res.status(200).send(functions)
    } catch (e) {
      console.error(e)
      throw e
    }
  }
}
