import { ColorMode, ExecutionResult, ThemeColor } from './types'
import { combineLatest, fromEvent, Observable, of, startWith } from 'rxjs'
import { concatMap, delay, map, tap, throttleTime } from 'rxjs/operators'
import { GroovyConsole } from './groovy-console'
import { compressToBase64 } from './compression'
import { CodeEditor, OutputEditor } from './codemirror'
import { HistoryModal } from './history-modal'

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
  tabs.forEach(e => {
    e.classList.remove('text-primary', 'border-b-2', 'border-primary')
    e.classList.add('text-on-surface-variant', 'opacity-60')
  })
  active.classList.remove('text-on-surface-variant', 'opacity-60')
  active.classList.add('text-primary', 'border-b-2', 'border-primary')
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
        target.classList.add('opacity-50', 'pointer-events-none')
        clearOutput()
      }),
      concatMap(action),
      tap(result => handleExecutionResult(result))
    )
    .subscribe({
      next: result => {
        executionResult = result
        target.classList.remove('opacity-50', 'pointer-events-none')
        updateOutput()
      },
      error: err => {
        console.log('Response NOT OK', err)
        target.classList.remove('opacity-50', 'pointer-events-none')
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
      htmlRoot.classList.remove('dark')
      switchEditorTheme('light')
      break
    case 'dark':
      htmlRoot.classList.add('dark')
      switchEditorTheme('dark')
      break
    case 'system':
      if (getPreferredColorScheme() === 'dark') {
        htmlRoot.classList.add('dark')
      } else {
        htmlRoot.classList.remove('dark')
      }
      switchEditorTheme(getPreferredColorScheme())
      break
  }
  
  const icon = document.getElementById('currentThemeIcon');
  if (icon) {
    if (mode === 'light') icon.textContent = 'light_mode';
    else if (mode === 'dark') icon.textContent = 'dark_mode';
    else icon.textContent = 'desktop_windows';
  }
  
  const themeSelect = document.getElementById('themeSelect') as HTMLSelectElement;
  if (themeSelect && themeSelect.value !== mode) {
    themeSelect.value = mode;
  }
}

function switchEditorTheme (theme:ThemeColor) {
  codeCM.switchTheme(theme)
  outputCM.switchTheme(theme)
}

function setupModeSwitchersAndRestoreSavedColorMode () {
  const themeSelect = document.getElementById('themeSelect') as HTMLSelectElement;
  if (themeSelect) {
    fromEvent(themeSelect, 'change')
      .pipe(
        tap(e => {
          e.preventDefault()
          const mode = (e.target as HTMLSelectElement).value as ColorMode
          switchMode(mode)
          localStorage.setItem('colorMode', mode)
        })
      ).subscribe()
  }

  const icon = document.getElementById('currentThemeIcon');
  if (icon) {
    fromEvent(icon, 'click').subscribe(() => {
      const current = localStorage.getItem('colorMode') || 'system';
      const nextMode = current === 'system' ? 'light' : current === 'light' ? 'dark' : 'system';
      if (themeSelect) {
        themeSelect.value = nextMode;
        themeSelect.dispatchEvent(new Event('change'));
      } else {
        switchMode(nextMode as ColorMode);
        localStorage.setItem('colorMode', nextMode);
      }
    });
  }

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

export function initView () {
  scriptExecution(executeButton, () => groovyConsole.executeScript(version.value, codeCM.getCode()))
  scriptExecution(inspectAstButton, () => groovyConsole.inspectAst(version.value, codeCM.getCode(), astPhaseSelect.value))

  const shareHandler = () => {
    return of(null).pipe(
      throttleTime(500),
      map(() => codeCM.getCode()),
      concatMap(editorContent => compressToBase64(editorContent))
    );
  };

  fromEvent(share, 'click')
    .pipe(concatMap(() => shareHandler()))
    .subscribe(codez => {
      shareLink.value = `${location.origin + location.pathname}?g=${version.value}&codez=${codez}`;
      const shareModal = document.getElementById('shareModal') as HTMLDialogElement;
      if (shareModal) shareModal.showModal();
    })

  const shareMobileBtn = document.getElementById('shareMobileBtn');
  if (shareMobileBtn) {
    fromEvent(shareMobileBtn, 'click')
      .pipe(concatMap(() => shareHandler()))
      .subscribe(codez => {
        shareLink.value = `${location.origin + location.pathname}?g=${version.value}&codez=${codez}`;
        const shareModal = document.getElementById('shareModal') as HTMLDialogElement;
        if (shareModal) shareModal.showModal();
      })
  }

  const shareModal = document.getElementById('shareModal') as HTMLDialogElement;
  if (shareModal && !('closedBy' in HTMLDialogElement.prototype)) {
    fromEvent(shareModal, 'click').subscribe((event) => {
      if (event.target !== shareModal) return;
      const rect = shareModal.getBoundingClientRect();
      const isDialogContent = (
        rect.top <= (event as MouseEvent).clientY &&
        (event as MouseEvent).clientY <= rect.top + rect.height &&
        rect.left <= (event as MouseEvent).clientX &&
        (event as MouseEvent).clientX <= rect.left + rect.width
      );
      if (!isDialogContent) shareModal.close();
    });
  }

  const closeShareModalBtn = document.getElementById('closeShareModal');
  if (closeShareModalBtn && shareModal) {
    fromEvent(closeShareModalBtn, 'click').subscribe(() => shareModal.close());
  }

  const copyShareLinkBtn = document.getElementById('copyShareLinkBtn');
  if (copyShareLinkBtn) {
    fromEvent(copyShareLinkBtn, 'click')
      .pipe(
        throttleTime(500),
        concatMap(() => navigator.clipboard.writeText(shareLink.value)),
        tap(() => shareLinkTooltip.classList.remove('hidden')),
        delay(1500),
        tap(() => shareLinkTooltip.classList.add('hidden'))
      ).subscribe()
  }

  const fetchGroovyVersion = of(1)
    .pipe(
      tap(() => version.classList.add('opacity-50', 'pointer-events-none')),
      concatMap(() => groovyConsole.getAvailableGroovyVersions()),
      tap(() => version.classList.remove('opacity-50', 'pointer-events-none'))
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

  const historyModal = new HistoryModal(codeCM.getHistoryService(), codeCM)
  const historyHandler = (event: Event) => {
    event.preventDefault()
    // Collapse the dropdown explicitly — otherwise it stays open after the
    // menu item is clicked, and the next click on the History button
    // toggles it closed instead of reopening.
    document.querySelector('#dropdown-history')?.parentElement?.classList.remove('is-active')
    historyModal.open()
  };

  const openHistory = document.getElementById('openHistory');
  if (openHistory) fromEvent(openHistory, 'click').subscribe(historyHandler);

  const historyMobileBtn = document.getElementById('historyMobileBtn');
  if (historyMobileBtn) fromEvent(historyMobileBtn, 'click').subscribe(historyHandler);

  const toggleDocBtn = document.getElementById('toggleDocBtn')
  const docPanel = document.getElementById('docPanel')
  if (toggleDocBtn && docPanel) {
    fromEvent(toggleDocBtn, 'click').subscribe(() => {
      docPanel.classList.toggle('hidden')
    })
  }

  // --- Vertical Resizer Logic ---
  const resizer = document.getElementById('resizer');
  const resultsPane = document.getElementById('resultsPane');
  
  if (resizer && resultsPane) {
    // Restore saved height if it exists
    const savedHeight = localStorage.getItem('resultsPaneHeight');
    if (savedHeight) {
      resultsPane.style.height = savedHeight;
    }

    let isResizing = false;

    fromEvent<PointerEvent>(resizer, 'pointerdown').subscribe((e) => {
      isResizing = true;
      e.preventDefault(); // Prevent text selection
      document.body.style.cursor = 'row-resize';
      document.body.style.userSelect = 'none'; // Also prevent selection globally during drag
    });

    fromEvent<PointerEvent>(window, 'pointermove').subscribe((e) => {
      if (!isResizing) return;
      
      const container = resultsPane.parentElement;
      if (!container) return;

      const containerRect = container.getBoundingClientRect();
      
      // Calculate the new height from the bottom of the container
      // height = containerBottom - mouseY
      let newHeight = containerRect.bottom - e.clientY;
      
      // Enforce bounds (e.g., between 10% and 90% of container height)
      const minHeight = 100; // pixels
      const maxHeight = containerRect.height * 0.9;
      
      newHeight = Math.max(minHeight, Math.min(newHeight, maxHeight));
      
      // Convert back to percentage for fluid resizing when browser resizes
      const heightPercent = (newHeight / containerRect.height) * 100;
      resultsPane.style.height = `${heightPercent}%`;
    });

    fromEvent<PointerEvent>(window, 'pointerup').subscribe(() => {
      if (isResizing) {
        isResizing = false;
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
        localStorage.setItem('resultsPaneHeight', resultsPane.style.height);
      }
    });
  }
}
