import { ExecutionResult } from './types'
import { fromEvent } from 'rxjs'
import { concatMap, delay, map, tap, throttleTime } from 'rxjs/operators'
import { executeScript } from './groovy-console'
import { compressToBase64 } from './compression'
import { CodeEditor, OutputEditor } from './codemirror'

const codeArea = document.getElementById('code') as HTMLTextAreaElement
const outputArea = document.getElementById('output') as HTMLTextAreaElement
const version = document.getElementById('version') as HTMLSelectElement
const executeButton = document.getElementById('execute')
const share = document.getElementById('share')
const shareLink = document.getElementById('shareLink') as HTMLInputElement
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

export function initView () {
  fromEvent(executeButton, 'click')
    .pipe(
      throttleTime(500),
      tap(() => {
        executeButton.classList.add('is-loading')
        clearOutput()
      }),
      concatMap(() => executeScript(version.value, codeCM.getCode())),
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
          err: 'An error occurred while sending the Groovy script for execution',
          result: null
        }
        switchTab(tabError)
        updateOutput()
      }
    })

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
  codeCM.loadFromUrl()
}
