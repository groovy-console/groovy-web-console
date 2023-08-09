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
      headers
    }).pipe(
      concatMap(response => response.json()),
      map(response => response.map((version: string) => new GroovyVersion(version)))
    )
  }

  public executeScript (groovyVersion: string, script: string): Observable<ExecutionResult> {
    const body = JSON.stringify({
      code: script,
      action: 'run'
    })
    return this.performRequest(groovyVersion, body)
  }

  public inspectAst (groovyVersion: string, script: string, astPhase: string): Observable<ExecutionResult> {
    const body = JSON.stringify({
      code: script,
      astPhase,
      action: 'ast'
    })
    return this.performRequest(groovyVersion, body)
  }

  private performRequest (groovyVersion: string, body: string) {
    const headers = new Headers()
    headers.append('Content-Type', 'application/json')
    const url = LOCAL_DEVELOPMENT ? baseUrl : `${baseUrl}${groovyVersion}`
    return fromFetch(url, {
      method: 'POST',
      headers,
      body
    }).pipe(
      concatMap(response => response.json()),
      map(response => response as ExecutionResult)
    )
  }

  public pingFunction (groovyVersion:string) {
    return fromFetch(`${baseUrl}${groovyVersion}`)
  }
}
