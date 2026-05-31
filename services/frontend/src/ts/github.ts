import {
  GistMetadata,
  GistResponse,
  ProxiedGistResponse,
  SaveGistRequest,
  SavedGistResponse,
  UpdateGistRequest
} from './types'
import { Observable, from } from 'rxjs'
import { fromFetch } from 'rxjs/fetch'
import { concatMap } from 'rxjs/operators'
import { currentUser$, loadedGist$ } from './auth'

interface AnonymousGistFile {
  filename: string
  truncated: boolean
  language: string
  content: string
}

interface AnonymousGistResponse extends GistResponse {
  id: string
  public: boolean
  owner?: { login: string }
}

export interface LoadedGist {
  code: string
  metadata: GistMetadata
}

const accessUrl = (path: string) => `${GITHUB_ACCESS_SERVICE_URL}${path}`

export function loadGist (gistId: string): Observable<LoadedGist> {
  if (gistId.indexOf('/') >= 0) {
    gistId = gistId.split('/')[1]
  }

  const headers = new Headers()
  headers.append('Accept', 'application/vnd.github.v3+json')
  return fromFetch(`https://api.github.com/gists/${gistId}`, {
    headers
  }).pipe(
    concatMap(response => {
      if (response.status === 404 || response.status === 403) {
        // Race-tolerant: we can't gate on currentUser$ being set because the
        // anonymous 404 may resolve before ?action=me has answered. Always try
        // the proxy; if the user is not logged in, the proxy responds 401 and
        // we fall through to the sign-in error message below.
        return loadGistAuthenticated(gistId).then(result => {
          if (!result) {
            throw new Error('Could not load gist (private gist or rate-limited; sign in to retry).')
          }
          return result
        })
      }
      return response.json().then(json => extractFromAnonymousResponse(json as AnonymousGistResponse))
    })
  )
}

function extractFromAnonymousResponse (json: AnonymousGistResponse): LoadedGist {
  for (const [, file] of Object.entries(json.files as unknown as Record<string, AnonymousGistFile>)) {
    if (file.truncated === false && file.language === 'Groovy') {
      return {
        code: file.content,
        metadata: {
          id: json.id,
          filename: file.filename,
          public: json.public === true,
          ownerLogin: json.owner?.login ?? null
        }
      }
    }
  }
  throw new Error('Could not find a non-truncated groovy script')
}

async function loadGistAuthenticated (gistId: string): Promise<LoadedGist | null> {
  const response = await fetch(accessUrl(`/?action=gist&id=${encodeURIComponent(gistId)}`), {
    credentials: 'include'
  })
  if (!response.ok) return null
  const data = await response.json() as ProxiedGistResponse
  return {
    code: data.code,
    metadata: {
      id: data.id,
      filename: data.filename,
      public: data.public,
      ownerLogin: data.ownerLogin
    }
  }
}

export function createGist (payload: SaveGistRequest): Observable<SavedGistResponse> {
  return from(
    fetch(accessUrl('/?action=gist'), {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    }).then(async response => {
      if (!response.ok) throw new Error(`Could not save gist (${response.status})`)
      const saved = await response.json() as SavedGistResponse
      loadedGist$.next({
        id: saved.id,
        // The server returns the canonical filename it computed from the name
        // (slugified server-side). Use that as the source of truth so a later
        // PATCH targets the exact file the server created.
        filename: saved.filename ?? `${slugify(payload.name)}.groovy`,
        public: saved.public,
        ownerLogin: currentUser$.value?.login ?? null
      })
      return saved
    })
  )
}

export function updateGist (gistId: string, payload: UpdateGistRequest): Observable<SavedGistResponse> {
  return from(
    fetch(accessUrl(`/?action=gist&id=${encodeURIComponent(gistId)}`), {
      method: 'PATCH',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    }).then(async response => {
      if (!response.ok) throw new Error(`Could not update gist (${response.status})`)
      return await response.json() as SavedGistResponse
    })
  )
}

function slugify (name: string): string {
  const ascii = name.toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64)
    .replace(/-+$/g, '')
  return ascii === '' ? 'script' : ascii
}

export function loadGithubFile (githubFile: string): Observable<string> {
  if (githubFile.indexOf('http') === 0) {
    throw new Error('No absolute URLs are allowed.')
  }
  const raw = githubFile.replace(/\/(blob|raw)\//, '/')

  if (!/\w+\/\w+\/[a-f0-9]{40}\/[\w/]+/.exec(raw)) {
    throw new Error("Only canonical links to resources are allowed, you can get them by pressing 'y' on github webpage.")
  }

  const headers = new Headers()
  headers.append('Accept', '*/*')
  return fromFetch(`https://rawcdn.githack.com/${raw}`, {
    headers
  }).pipe(
    concatMap(response => response.text())
  )
}
