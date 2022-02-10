import { ExecutionResult } from './types'
import { fromEvent, Observable, of } from 'rxjs'
import { concatMap, delay, map, tap, throttleTime } from 'rxjs/operators'
import { GroovyConsole } from './groovy-console'
import { compressToBase64 } from './compression'
import { CodeEditor, OutputEditor } from './codemirror'

const groovyConsole = new GroovyConsole()
const codeArea = document.getElementById('code') as HTMLTextAreaElement
const outputArea = document.getElementById('output') as HTMLTextAreaElement
const version = document.getElementById('version') as HTMLSelectElement
const astPhaseSelect = document.getElementById('astPhase') as HTMLSelectElement
const executeButton = document.getElementById('execute')
const inspectAstButton = document.getElementById('inspectAst')
const share = document.getElementById('shareAsCode')
const shareLink = document.getElementById('shareAsCodeLink') as HTMLInputElement
const shareLinkTooltip = document.getElementById('shareLinkTooltip')
const tabOutput = document.getElementById('tabOutput')
const tabResult = document.getElementById('tabResult')
const tabError = document.getElementById('tabError')
const tabs = [tabOutput, tabResult, tabError]
let activeTab: HTMLElement

let executionResult: ExecutionResult = {
  out: '',
  err: '',
  result: null
}

const codeCM = new CodeEditor(codeArea)
const outputCM = new OutputEditor(outputArea)

function clearOutput () {
  executionResult.out = ''
  executionResult.err = ''
  executionResult.result = null
  outputCM.setContent('')
}

function updateOutput () {
  if (activeTab === tabOutput) {
    outputCM.setContent(executionResult.out || '')
  } else if (activeTab === tabResult) {
    if (executionResult.result !== null && executionResult.result !== undefined) {
      console.log('Type of result: ', typeof executionResult.result)
      if (typeof executionResult.result === 'string') {
        outputCM.setContent(executionResult.result)
      } else {
        outputCM.setContent(JSON.stringify(executionResult.result, null, 2))
      }
    } else {
      outputCM.setContent('null')
    }
  } else if (activeTab === tabError) {
    outputCM.setContent(executionResult.err || '')
  }
}

function handleExecutionResult (result: ExecutionResult) {
  if (result.err) {
    switchTab(tabError)
    codeCM.handleErrorResult(result.err)
  } else if (result.out) {
    switchTab(tabOutput)
  } else if (result.result) {
    switchTab(tabResult)
  }
  console.log(result)
}

function switchTab (active: HTMLElement) {
  [tabOutput, tabResult, tabError].forEach(e =>
    (e.parentNode as HTMLElement).classList.remove('is-active'));
  (active.parentNode as HTMLElement).classList.add('is-active')
  activeTab = active
}

function addTabBehavior (tab: HTMLElement) {
  fromEvent(tab, 'click')
    .pipe(
      tap(e => switchTab(e.target as HTMLElement))
    ).subscribe(() => updateOutput())
}

function scriptExecution (target: HTMLElement, action: () => Observable<ExecutionResult>) {
  fromEvent(target, 'click')
    .pipe(
      throttleTime(500),
      tap(() => {
        target.classList.add('is-loading')
        clearOutput()
      }),
      concatMap(action),
      tap(result => handleExecutionResult(result))
    )
    .subscribe({
      next: result => {
        executionResult = result
        target.classList.remove('is-loading')
        updateOutput()
      },
      error: err => {
        console.log('Response NOT OK', err)
        target.classList.remove('is-loading')
        executionResult = {
          out: '',
          err: 'An error occurred while sending the Groovy script for execution',
          result: null
        }
        switchTab(tabError)
        updateOutput()
      }
    })
}

export function initView () {
  scriptExecution(executeButton, () => groovyConsole.executeScript(version.value, codeCM.getCode()))
  scriptExecution(inspectAstButton, () => groovyConsole.inspectAst(version.value, codeCM.getCode(), astPhaseSelect.value))

  fromEvent(share, 'click')
    .pipe(
      throttleTime(500),
      map(() => codeCM.getCode()),
      concatMap(editorContent => compressToBase64(editorContent))
    ).subscribe(codez => {
      shareLink.value = `${location.origin + location.pathname}?codez=${codez}`;
      (shareLink.parentNode.parentNode as HTMLElement).classList.remove('is-hidden')
    })

  fromEvent(shareLink, 'click')
    .pipe(
      throttleTime(500),
      concatMap(() => navigator.clipboard.writeText(shareLink.value)),
      tap(() => shareLinkTooltip.classList.add('has-tooltip-active')),
      delay(500),
      tap(() => shareLinkTooltip.classList.remove('has-tooltip-active'))
    ).subscribe()

  of(1)
    .pipe(
      tap(() => (version.parentNode as HTMLElement).classList.add('is-loading')),
      concatMap(() => groovyConsole.getAvailableGroovyVersions()),
      tap(() => (version.parentNode as HTMLElement).classList.remove('is-loading')),
      tap(versions => {
        version.innerHTML = '' // remove children
        versions.forEach(gv => {
          const optionElement = document.createElement('option')
          optionElement.value = gv.id
          optionElement.text = gv.name
          version.add(optionElement)
        })
      })
    ).subscribe(() => groovyConsole.pingFunction(version.value).subscribe())

  fromEvent(version, 'change')
    .pipe(
      throttleTime(500)
    ).subscribe(() => groovyConsole.pingFunction(version.value).subscribe())

  tabs.forEach(tab => addTabBehavior(tab))
  switchTab(tabOutput)

  of(location.search).pipe(
    // TODO figure out how to display a loading spinner on top of the editor
    concatMap(query => codeCM.loadFromUrl(query))
  ).subscribe({
    error: err => {
      console.log('Could not load script', err)
      executionResult = {
        out: '',
        err: 'An error occurred while loading the remote script.\nThis can be caused by the NoScript browser extension.',
        result: null
      }
      switchTab(tabError)
      updateOutput()
    }
  })
}
