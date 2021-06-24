import { GistResponse } from './types'
import { Observable } from 'rxjs'
import { fromFetch } from 'rxjs/fetch'
import { concatMap, map } from 'rxjs/operators'

export function loadGist (gistId: string): Observable<string> {
  if (gistId.indexOf('/') >= 0) {
    gistId = gistId.split('/')[1]
  }

  const headers = new Headers()
  headers.append('Accept', 'application/vnd.github.v3+json')
  return fromFetch(`https://api.github.com/gists/${gistId}`, {
    headers
  }).pipe(
    concatMap(response => response.json()),
    map(json => {
      for (const [key, value] of Object.entries((json as GistResponse).files)) {
        console.log('Found file', key, value)
        if (value.truncated === false && value.language === 'Groovy') {
          return value.content
        }
      }
      throw new Error('Could not find a non-truncated groovy script')
    })
  )
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
