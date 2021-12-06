import { Observable, of } from 'rxjs'
import { ExecutionResult } from './types'
import { fromFetch } from 'rxjs/fetch'
import { concatMap, map } from 'rxjs/operators'

export class GroovyVersion {
  public name: string

  constructor (public id: string) {
    this.name = 'Groovy ' + id.substring('groovy_'.length).replace(/_/g, '.')
  }
}

const baseUrl = GROOVY_CONSOLE_SERVICE_URL

export class GroovyConsole {
  public getAvailableGroovyVersions (): Observable<GroovyVersion[]> {
    // eslint-disable-next-line no-undef
    if (LOCAL_DEVELOPMENT) {
      return of([new GroovyVersion('groovy_127.0.0.1')])
    }
    const headers = new Headers()
    headers.append('Content-Type', 'application/json')
    return fromFetch(`${baseUrl}list_runtimes`, {
      method: 'GET',
      headers: headers
    }).pipe(
      concatMap(response => response.json()),
      map(response => response.map((version: string) => new GroovyVersion(version)))
    )
  }

  public executeScript (groovyVersion: string, script: string): Observable<ExecutionResult> {
    const headers = new Headers()
    headers.append('Content-Type', 'application/json')
    const url = LOCAL_DEVELOPMENT ? baseUrl : `${baseUrl}${groovyVersion}`
    return fromFetch(url, {
      method: 'POST',
      headers: headers,
      body: JSON.stringify({
        code: script
      })
    }).pipe(
      concatMap(response => response.json()),
      map(response => response as ExecutionResult)
    )
  }

  public pingFunction (groovyVersion:string) {
    return fromFetch(`${baseUrl}${groovyVersion}`)
  }
}
