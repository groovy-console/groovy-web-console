import {http} from '@google-cloud/functions-framework';
import {GoogleAuth} from 'google-auth-library';
import fetch from 'node-fetch';

http('listRuntimes', async (req, res) => {
  // --- CORS Configuration ---
  res.set('Access-Control-Allow-Origin', '*');

  if (req.method === 'OPTIONS') {
    res.set('Access-Control-Allow-Methods', 'GET');
    res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.set('Access-Control-Max-Age', '3600');
    return res.status(204).send('');
  }

  try {
    // --- Authentication ---
    // Use the Cloud Functions API scope explicitly
    const auth = new GoogleAuth({
      scopes: 'https://www.googleapis.com/auth/cloud-platform'
    });
    const client = await auth.getClient();
    const tokenResponse = await client.getAccessToken();
    const token = tokenResponse.token;

    // --- Configuration ---
    const project = 'gwc-experiment';
    const location = 'europe-west1';

    /**
     * Note: Cloud Functions Gen 2 uses the v2 endpoint.
     * Path structure: projects/{project}/locations/{location}/functions
     */
    const url = `https://cloudfunctions.googleapis.com/v2/projects/${project}/locations/${location}/functions`;

    const resp = await fetch(url, {
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
    });

    if (!resp.ok) {
      const errorText = await resp.text();
      console.error('API Error Response:', errorText);
      return res.status(resp.status).send({ error: 'Failed to fetch functions from Google API' });
    }

    const json = await resp.json();

    // Gen 2 API returns an object with a "functions" array
    // We check if functions exist before processing
    if (!json.functions) {
      return res.status(200).send([]);
    }

    const functions = json.functions
      .map(fn => fn.name) // name is in format projects/.../locations/.../functions/...
      .filter(name => name.includes('groovy'))
      .map(name => {
        const parts = name.split('/');
        const simpleName = parts[parts.length - 1];
        return simpleName.includes('groovy_')
          ? simpleName.substring(simpleName.indexOf('groovy_'))
          : simpleName;
      });

    res.status(200).send(functions);
  } catch (e) {
    console.error('Function Execution Error:', e);
    res.status(500).send({ error: 'Internal Server Error', message: e.message });
  }
});
