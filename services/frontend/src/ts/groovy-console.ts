import {Observable} from "rxjs";
import {ExecutionResult} from "./types";
import {fromFetch} from "rxjs/fetch";
import {concatMap, map} from "rxjs/operators";

export function executeScript(groovyVersion: string, script:string):Observable<ExecutionResult> {
    const headers = new Headers();
    headers.append("Content-Type", "application/json");
    return fromFetch(`https://europe-west1-gwc-experiment.cloudfunctions.net/${groovyVersion}`, {
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
