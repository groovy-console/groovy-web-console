import { ColorMode, ExecutionResult, GistMetadata, ThemeColor, User } from './types'
import { combineLatest, fromEvent, Observable, of, startWith } from 'rxjs'
import { concatMap, delay, map, tap, throttleTime } from 'rxjs/operators'
import { GroovyConsole } from './groovy-console'
import { compressToBase64 } from './compression'
import { CodeEditor, OutputEditor } from './codemirror'
import { currentUser$, loadedGist$, refreshMe, signIn, signOut } from './auth'
import { createGist, updateGist } from './github'

const groovyConsole = new GroovyConsole()
const htmlRoot = document.getElementsByTagName('html')[0]
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
const tabExecInfo = document.getElementById('tabExecInfo')
const tabs = [tabOutput, tabResult, tabError, tabExecInfo]
const modeSwitchers = Array.from(document.querySelectorAll('.mode-switcher a')) as HTMLLinkElement[]
const currentMode = document.getElementById('currentMode') as HTMLLinkElement
let activeTab: HTMLElement

let executionResult: ExecutionResult = {
  out: '',
  err: '',
  result: null,
  info: null
}

const codeCM = new CodeEditor(codeArea, getEffectiveColorMode())
const outputCM = new OutputEditor(outputArea, getEffectiveColorMode())

function clearOutput () {
  executionResult.out = ''
  executionResult.err = ''
  executionResult.result = null
  outputCM.setContent('')
}

function updateOutput () {
  if (activeTab === tabOutput) {
    outputCM.setContent(executionResult.out || '')
  } else if (activeTab === tabExecInfo) {
    if (executionResult.info === null) {
      outputCM.setContent('No execution info available')
    } else {
      outputCM.setContent(JSON.stringify(executionResult.info, null, 2))
    }
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
  tabs.forEach(e =>
    (e.parentNode as HTMLElement).classList.remove('is-active')
  );
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
          result: null,
          info: null
        }
        switchTab(tabError)
        updateOutput()
      }
    })
}

function switchMode (mode:ColorMode) {
  switch (mode) {
    case 'light':
      htmlRoot.classList.remove('theme-dark')
      htmlRoot.classList.add('theme-light')
      switchEditorTheme('light')
      break
    case 'dark':
      htmlRoot.classList.remove('theme-light')
      htmlRoot.classList.add('theme-dark')
      switchEditorTheme('dark')
      break
    case 'system':
      htmlRoot.classList.remove('theme-light')
      htmlRoot.classList.remove('theme-dark')
      switchEditorTheme(getPreferredColorScheme())
      break
  }
  currentMode.innerHTML = modeSwitchers.find(ms => ms.dataset.mode === mode).innerHTML
}

function switchEditorTheme (theme:ThemeColor) {
  codeCM.switchTheme(theme)
  outputCM.switchTheme(theme)
}

function setupModeSwitchersAndRestoreSavedColorMode () {
  modeSwitchers.forEach(modeSwitcher => {
    fromEvent(modeSwitcher, 'click')
      .pipe(
        tap(e => {
          e.preventDefault()
          const mode = modeSwitcher.dataset.mode as ColorMode
          switchMode(mode)
          localStorage.setItem('colorMode', mode)
        })
      ).subscribe()
  })

  const savedColorMode = localStorage.getItem('colorMode')
  if (savedColorMode !== null) {
    switchMode(savedColorMode as ColorMode)
  } else {
    switchMode('system')
  }
}

function getPreferredColorScheme (): ThemeColor {
  if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
    return 'dark'
  } else if (window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches) {
    return 'light'
  } else {
    return 'light'
  }
}

function getEffectiveColorMode (): ThemeColor {
  const savedColorMode = localStorage.getItem('colorMode')
  if (savedColorMode !== null) {
    const color = (savedColorMode as ColorMode)
    if (color === 'system') {
      return getPreferredColorScheme()
    }
    return color as ThemeColor
  } else {
    return getPreferredColorScheme()
  }
}

function setupNavbarBurgerClickHandlers () {
  // Get all "navbar-burger" elements
  const $navbarBurgers = Array.from(document.querySelectorAll('.navbar-burger')) as HTMLElement[]

  // Add a click event on each of them
  $navbarBurgers.forEach(el => {
    el.addEventListener('click', () => {
      // Get the target from the "data-target" attribute
      const target = el.dataset.target
      const $target = document.getElementById(target)

      // Toggle the "is-active" class on both the "navbar-burger" and the "navbar-menu"
      el.classList.toggle('is-active')
      $target.classList.toggle('is-active')
    })
  })
}

function setupAuthAndGistUi () {
  const signInItem = document.getElementById('signInItem')
  const accountItem = document.getElementById('accountItem')
  const accountAvatar = document.getElementById('accountAvatar') as HTMLImageElement
  const accountLogin = document.getElementById('accountLogin')
  const signOutItem = document.getElementById('signOutItem')
  const saveAsPublicGistControl = document.getElementById('saveAsPublicGistControl')
  const saveAsSecretGistControl = document.getElementById('saveAsSecretGistControl')
  const updateGistControl = document.getElementById('updateGistControl')
  const saveAsNewGistControl = document.getElementById('saveAsNewGistControl')
  const saveAsPublicGistBtn = document.getElementById('saveAsPublicGist')
  const saveAsSecretGistBtn = document.getElementById('saveAsSecretGist')
  const updateGistBtn = document.getElementById('updateGist')
  const saveAsNewGistBtn = document.getElementById('saveAsNewGist')

  const saveGistModal = document.getElementById('saveGistModal')
  const saveGistModalTitle = document.getElementById('saveGistModalTitle')
  const saveGistModalClose = document.getElementById('saveGistModalClose')
  const saveGistName = document.getElementById('saveGistName') as HTMLInputElement
  const saveGistNameError = document.getElementById('saveGistNameError')
  const saveGistIncludeOutputField = document.getElementById('saveGistIncludeOutputField')
  const saveGistIncludeOutput = document.getElementById('saveGistIncludeOutput') as HTMLInputElement
  const saveGistError = document.getElementById('saveGistError')
  const saveGistConfirm = document.getElementById('saveGistConfirm')
  const saveGistCancel = document.getElementById('saveGistCancel')

  const sessionNotification = document.getElementById('sessionNotification')
  const sessionNotificationText = document.getElementById('sessionNotificationText')
  const sessionNotificationClose = document.getElementById('sessionNotificationClose')

  let pendingVisibility: boolean | null = null

  function notifySessionExpired () {
    sessionNotificationText.textContent = 'Your GitHub session expired. Please sign in again.'
    sessionNotification.classList.remove('is-hidden')
  }

  sessionNotificationClose.addEventListener('click', () => {
    sessionNotification.classList.add('is-hidden')
  })

  function show (el: HTMLElement) { el.classList.remove('is-hidden') }
  function hide (el: HTMLElement) { el.classList.add('is-hidden') }

  function refreshButtons (user: User | null, gist: GistMetadata | null) {
    if (user === null) {
      show(signInItem); hide(accountItem)
      hide(saveAsPublicGistControl); hide(saveAsSecretGistControl)
      hide(updateGistControl); hide(saveAsNewGistControl)
      return
    }
    hide(signInItem); show(accountItem)
    accountAvatar.src = user.avatar_url
    accountLogin.textContent = '@' + user.login

    const ownsLoadedGist = gist !== null && gist.ownerLogin === user.login
    if (ownsLoadedGist) {
      hide(saveAsPublicGistControl); hide(saveAsSecretGistControl)
      show(updateGistControl); show(saveAsNewGistControl)
    } else {
      show(saveAsPublicGistControl); show(saveAsSecretGistControl)
      hide(updateGistControl); hide(saveAsNewGistControl)
    }
  }

  currentUser$.subscribe(user => refreshButtons(user, loadedGist$.value))
  loadedGist$.subscribe(gist => refreshButtons(currentUser$.value, gist))

  signInItem.addEventListener('click', () => {
    signIn(() => { refreshMe() })
  })
  signOutItem.addEventListener('click', e => {
    e.preventDefault()
    signOut()
  })

  function hasOutput (): boolean {
    const out = (document.getElementById('output') as HTMLElement).textContent
    return out !== null && out.trim().length > 0
  }

  function openSaveModal (mode: 'public' | 'secret' | 'new') {
    pendingVisibility = mode === 'public' ? true : mode === 'secret' ? false : loadedGist$.value?.public ?? true
    saveGistModalTitle.textContent = mode === 'public'
      ? 'Save as public gist'
      : mode === 'secret' ? 'Save as secret gist' : 'Save as new gist'
    saveGistName.value = ''
    saveGistIncludeOutput.checked = false
    hide(saveGistNameError); hide(saveGistError); saveGistError.textContent = ''
    if (hasOutput()) show(saveGistIncludeOutputField); else hide(saveGistIncludeOutputField)
    saveGistModal.classList.add('is-active')
    saveGistName.focus()
  }
  function closeSaveModal () {
    saveGistModal.classList.remove('is-active')
    pendingVisibility = null
  }

  saveAsPublicGistBtn.addEventListener('click', () => openSaveModal('public'))
  saveAsSecretGistBtn.addEventListener('click', () => openSaveModal('secret'))
  saveAsNewGistBtn.addEventListener('click', () => openSaveModal('new'))
  saveGistModalClose.addEventListener('click', closeSaveModal)
  saveGistCancel.addEventListener('click', closeSaveModal)
  saveGistModal.querySelector('.modal-background').addEventListener('click', closeSaveModal)

  function readOutputForSave (): string | undefined {
    if (!saveGistIncludeOutput.checked) return undefined
    return (document.getElementById('output') as HTMLElement).textContent ?? ''
  }

  function getEditorCode (): string {
    return (document.querySelector('#code .cm-content') as any).cmView.view.state.doc.toString()
  }

  saveGistConfirm.addEventListener('click', () => {
    const name = saveGistName.value.trim()
    if (name === '') { show(saveGistNameError); return }
    hide(saveGistNameError); hide(saveGistError)
    const payload = {
      name,
      public: pendingVisibility ?? true,
      code: getEditorCode(),
      output: readOutputForSave()
    }
    createGist(payload).subscribe({
      next: saved => {
        const params = new URLSearchParams(location.search)
        params.set('gist', saved.id)
        const newUrl = `${location.pathname}?${params.toString()}${location.hash}`
        history.replaceState(null, '', newUrl)
        closeSaveModal()
      },
      error: err => {
        saveGistError.textContent = err?.message ?? 'Could not save gist.'
        show(saveGistError)
        if (typeof err?.message === 'string' && err.message.includes('401')) {
          notifySessionExpired()
        }
      }
    })
  })

  updateGistBtn.addEventListener('click', () => {
    const gist = loadedGist$.value
    if (gist === null) return
    const payload = {
      filename: gist.filename,
      code: getEditorCode(),
      output: hasOutput() ? ((document.getElementById('output') as HTMLElement).textContent ?? '') : undefined
    }
    updateGist(gist.id, payload).subscribe({
      next: () => { /* no-op success */ },
      error: err => {
        if (typeof err?.message === 'string' && err.message.includes('401')) {
          notifySessionExpired()
        }
      }
    })
  })

  // Initial check
  refreshMe()
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
      shareLink.value = `${location.origin + location.pathname}?g=${version.value}&codez=${codez}`;
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

  const fetchGroovyVersion = of(1)
    .pipe(
      tap(() => (version.parentNode as HTMLElement).classList.add('is-loading')),
      concatMap(() => groovyConsole.getAvailableGroovyVersions()),
      tap(() => (version.parentNode as HTMLElement).classList.remove('is-loading'))
    )

  const groovyParam = of(location.search)
    .pipe(
      map(query => new URLSearchParams(query)),
      map(queryParams => queryParams.has('g') ? queryParams.get('g') : ''),
      startWith('')
    )

  combineLatest([fetchGroovyVersion, groovyParam])
    .pipe(
      tap(([versions, paramVersion]) => {
        version.innerHTML = '' // remove children
        let selected = false
        versions.forEach(gv => {
          const optionElement = document.createElement('option')
          optionElement.value = gv.id
          optionElement.text = gv.name
          if (paramVersion !== '' && gv.id.startsWith(paramVersion)) {
            optionElement.selected = true
            selected = true
          }
          version.add(optionElement)
        })
        if (!selected) {
          // select the first version that that is not a milestone/alpha/rc release
          version.selectedIndex = versions.findIndex(v => !v.id.match(/alpha|beta|rc/i))
        }
      })
    )
    .subscribe(() => groovyConsole.pingFunction(version.value).subscribe())

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
        err: 'An error occurred while loading the remote script.\nThis can be caused by the NoScript browser extension.\n\n' + err,
        result: null,
        info: null
      }
      switchTab(tabError)
      updateOutput()
    }
  })

  setupNavbarBurgerClickHandlers()
  setupModeSwitchersAndRestoreSavedColorMode()
  setupAuthAndGistUi()
}
