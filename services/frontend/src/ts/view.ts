import { ExecutionResult } from './types'
import { fromEvent } from 'rxjs'
import { concatMap, delay, map, tap, throttleTime } from 'rxjs/operators'
import { executeScript } from './groovy-console'
import { compressToBase64, decodeUrlSafe, decompressFromBase64 } from './compression'
import { loadGist, loadGithubFile } from './github'
import { createEditor, createOutput } from './codemirror'

const codeArea = document.getElementById('code') as HTMLTextAreaElement
const outputArea = document.getElementById('output') as HTMLTextAreaElement
const version = document.getElementById('version') as HTMLSelectElement
const executeButton = document.getElementById('execute')
const save = document.getElementById('save')
const shareLink = document.getElementById('shareLink') as HTMLInputElement
const shareLinkTooltip = document.getElementById('shareLinkTooltip')
const tabOutput = document.getElementById('tabOutput')
const tabResult = document.getElementById('tabResult')
const tabError = document.getElementById('tabError')
const tabs = [tabOutput, tabResult, tabError]
let activeTab: HTMLElement

let executionResult: ExecutionResult = { out: '', err: '', result: null }

const codeCM = createEditor(codeArea)
const outputCM = createOutput(outputArea)

function clearOutput () {
  executionResult.out = ''
  executionResult.err = ''
  executionResult.result = null
  outputCM.setValue('')
}

function updateOutput () {
  if (activeTab === tabOutput) {
    outputCM.setValue(executionResult.out || '')
  } else if (activeTab === tabResult) {
    if (executionResult.result !== null && executionResult.result !== undefined) {
      console.log('Type of result: ', typeof executionResult.result)
      if (typeof executionResult.result === 'string') {
        outputCM.setValue(executionResult.result)
      } else {
        outputCM.setValue(JSON.stringify(executionResult.result, null, 2))
      }
    } else {
      outputCM.setValue('null')
    }
  } else if (activeTab === tabError) {
    outputCM.setValue(executionResult.err || '')
  }
}

function handleExecutionResult (result: ExecutionResult) {
  if (result.err) {
    switchTab(tabError)
    // check if it's a syntax error
    const lineColInfo = result.err.match(/.*@ line (\d+), column (\d+).$/)
    if (lineColInfo && lineColInfo.length >= 3) {
      codeCM.setCursor({ line: parseInt(lineColInfo[1]) - 1, ch: parseInt(lineColInfo[2]) - 1 })
      codeCM.focus()
    } else { // check if it's an exception
      const exceptionLines = result.err.split('\n')
      const scriptLineFound = exceptionLines.find(line => line.match(/\tat Script1\.run\(Script1\.groovy:(\d+)\)$/))
      if (scriptLineFound) {
        const lineNumber = scriptLineFound.slice(scriptLineFound.indexOf(':') + 1, scriptLineFound.length - 1)
        codeCM.setCursor({ line: parseInt(lineNumber) - 1, ch: 0 })
        codeCM.focus()
      }
    }
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

export function initFromUrl () {
  const queryParams = new URLSearchParams(location.search)
  if (queryParams.has('code')) {
    codeCM.setValue(decodeUrlSafe(queryParams.get('code')))
  } else if (queryParams.has('codez')) {
    decompressFromBase64(queryParams.get('codez'))
      .then(code => codeCM.setValue(code))
  } else if (queryParams.has('gist')) {
    loadGist(queryParams.get('gist'))
      .subscribe(gistCode => codeCM.setValue(gistCode))
  } else if (queryParams.has('github')) {
    loadGithubFile(queryParams.get('github'))
      .subscribe(githubCode => codeCM.setValue(githubCode))
  }
}

export function initView () {
  fromEvent(executeButton, 'click')
    .pipe(
      throttleTime(500),
      tap(() => {
        executeButton.classList.add('is-loading')
        clearOutput()
      }),
      concatMap(() => executeScript(version.value, codeCM.getValue())),
      tap(result => handleExecutionResult(result))
    )
    .subscribe({
      next: result => {
        executionResult = result
        executeButton.classList.remove('is-loading')
        updateOutput()
      },
      error: err => {
        console.log('Response NOT OK', err)
        executeButton.classList.remove('is-loading')
        executionResult = {
          out: '',
          err: 'An error occured while sending the Groovy script for execution',
          result: null
        }
        updateOutput()
      }
    })

  fromEvent(save, 'click')
    .pipe(
      throttleTime(500),
      map(() => codeCM.getValue()),
      concatMap(editorContent => compressToBase64(editorContent))
    ).subscribe(codez => {
      shareLink.value = `${location.origin + location.pathname}?codez=${codez}`;
      (shareLink.parentNode.parentNode as HTMLElement).classList.remove('is-hidden')
    })

  fromEvent(shareLink, 'click')
    .pipe(
      throttleTime(500),
      tap(() => {
        shareLink.focus()
        shareLink.select()
        document.execCommand('copy')
      }),
      tap(() => shareLinkTooltip.classList.add('has-tooltip-active')),
      delay(500),
      tap(() => shareLinkTooltip.classList.remove('has-tooltip-active'))
    ).subscribe()

  tabs.forEach(tab => addTabBehavior(tab))
  switchTab(tabOutput)
}
