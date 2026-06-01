import { CodeEditor } from './codemirror'
import { currentUser$, loadedGist$, refreshMe, signIn, signOut } from './auth'
import { createGist, updateGist } from './github'
import { GistMetadata, User } from './types'
import { EMPTY, fromEvent, Observable } from 'rxjs'
import { catchError, exhaustMap, filter, finalize, map, tap, throttleTime } from 'rxjs/operators'

const CLICK_THROTTLE_MS = 500

export function setupGistUi (codeCM: CodeEditor) {
  const signInItem = document.getElementById('signInItem')
  const accountItem = document.getElementById('accountItem')
  const accountAvatar = document.getElementById('accountAvatar') as HTMLImageElement
  const accountLogin = document.getElementById('accountLogin')
  const signOutItem = document.getElementById('signOutItem')
  const saveAsGistControl = document.getElementById('saveAsGistControl')
  const updateGistControl = document.getElementById('updateGistControl')
  const saveAsNewGistControl = document.getElementById('saveAsNewGistControl')
  const saveAsGistBtn = document.getElementById('saveAsGist')
  const updateGistBtn = document.getElementById('updateGist')
  const saveAsNewGistBtn = document.getElementById('saveAsNewGist')

  const saveGistModal = document.getElementById('saveGistModal')
  const saveGistModalTitle = document.getElementById('saveGistModalTitle')
  const saveGistModalClose = document.getElementById('saveGistModalClose')
  const saveGistName = document.getElementById('saveGistName') as HTMLInputElement
  const saveGistNameError = document.getElementById('saveGistNameError')
  const saveGistIncludeOutputField = document.getElementById('saveGistIncludeOutputField')
  const saveGistIncludeOutput = document.getElementById('saveGistIncludeOutput') as HTMLInputElement
  const saveGistPrivate = document.getElementById('saveGistPrivate') as HTMLInputElement
  const saveGistError = document.getElementById('saveGistError')
  const saveGistConfirm = document.getElementById('saveGistConfirm')
  const saveGistCancel = document.getElementById('saveGistCancel')

  const sessionNotification = document.getElementById('sessionNotification')
  const sessionNotificationText = document.getElementById('sessionNotificationText')
  const sessionNotificationClose = document.getElementById('sessionNotificationClose')

  const show = (el: HTMLElement) => el.classList.remove('hidden')
  const hide = (el: HTMLElement) => el.classList.add('hidden')

  const toggleDropdown = (target: HTMLElement, other: HTMLElement | null) => {
    if (target.classList.contains('hidden')) {
      show(target)
      if (other && !other.classList.contains('hidden')) hide(other)
    } else {
      hide(target)
    }
  }

  const shareDropdown = document.getElementById('shareDropdown')
  const accountDropdown = document.getElementById('accountDropdown')

  const shareAsCode = document.getElementById('shareAsCode')
  if (shareAsCode && shareDropdown) {
    shareAsCode.addEventListener('click', (e) => {
      e.stopPropagation()
      toggleDropdown(shareDropdown, accountDropdown)
    })
    shareDropdown.addEventListener('click', (e) => e.stopPropagation())
  }

  if (accountItem && accountDropdown) {
    accountItem.addEventListener('click', (e) => {
      e.stopPropagation()
      toggleDropdown(accountDropdown, shareDropdown)
    })
    accountDropdown.addEventListener('click', (e) => e.stopPropagation())
  }

  document.addEventListener('click', () => {
    if (shareDropdown && !shareDropdown.classList.contains('hidden')) {
      hide(shareDropdown)
    }
    if (accountDropdown && !accountDropdown.classList.contains('hidden')) {
      hide(accountDropdown)
    }
  })

  const outputText = () => (document.getElementById('output') as HTMLElement).textContent ?? ''
  const hasOutput = () => outputText().trim().length > 0

  function notify (text: string) {
    sessionNotificationText.textContent = text
    show(sessionNotification)
  }
  const notifySessionExpired = () => notify('Your GitHub session expired. Please sign in again.')
  sessionNotificationClose.addEventListener('click', () => hide(sessionNotification))

  function refreshButtons (user: User | null, gist: GistMetadata | null) {
    if (user === null) {
      show(signInItem); hide(accountItem)
      if (saveAsGistControl) hide(saveAsGistControl)
      if (updateGistControl) hide(updateGistControl)
      if (saveAsNewGistControl) hide(saveAsNewGistControl)
      return
    }
    hide(signInItem); show(accountItem)
    accountAvatar.src = user.avatar_url
    accountLogin.textContent = '@' + user.login

    const ownsLoadedGist = gist !== null && gist.ownerLogin === user.login
    if (ownsLoadedGist) {
      if (saveAsGistControl) hide(saveAsGistControl)
      if (updateGistControl) show(updateGistControl)
      if (saveAsNewGistControl) show(saveAsNewGistControl)
    } else {
      if (saveAsGistControl) show(saveAsGistControl)
      if (updateGistControl) hide(updateGistControl)
      if (saveAsNewGistControl) hide(saveAsNewGistControl)
    }
  }

  currentUser$.subscribe(user => refreshButtons(user, loadedGist$.value))
  loadedGist$.subscribe(gist => refreshButtons(currentUser$.value, gist))

  const throttledClick$ = (el: HTMLElement): Observable<Event> =>
    fromEvent(el, 'click').pipe(throttleTime(CLICK_THROTTLE_MS))

  throttledClick$(signInItem).subscribe(() => signIn(() => { refreshMe() }))
  throttledClick$(signOutItem).pipe(
    tap(e => e.preventDefault())
  ).subscribe(() => {
    if (accountDropdown) hide(accountDropdown)
    signOut()
  })

  function openSaveModal (mode: 'save' | 'new') {
    if (shareDropdown) hide(shareDropdown)
    saveGistModalTitle.textContent = mode === 'save' ? 'Save as gist' : 'Save as new gist'
    saveGistName.value = ''
    saveGistIncludeOutput.checked = false
    saveGistPrivate.checked = false
    hide(saveGistNameError); hide(saveGistError); saveGistError.textContent = ''
    if (hasOutput()) show(saveGistIncludeOutputField); else hide(saveGistIncludeOutputField)
    ;(saveGistModal as HTMLDialogElement).showModal()
    saveGistName.focus()
  }
  function closeSaveModal () {
    ;(saveGistModal as HTMLDialogElement).close()
  }

  if (saveAsGistBtn) throttledClick$(saveAsGistBtn).subscribe(() => openSaveModal('save'))
  if (saveAsNewGistBtn) throttledClick$(saveAsNewGistBtn).subscribe(() => openSaveModal('new'))
  saveGistModalClose.addEventListener('click', closeSaveModal)
  saveGistCancel.addEventListener('click', closeSaveModal)
  saveGistModal.addEventListener('click', (e) => {
    if (e.target === saveGistModal) closeSaveModal()
  })

  function isAuthError (err: unknown): boolean {
    return typeof (err as Error)?.message === 'string' && (err as Error).message.includes('401')
  }

  // exhaustMap: ignore clicks while an in-flight save is running so the modal
  // can't issue a second POST before the first resolves. throttleTime alone
  // can't do that — its window is fixed and unrelated to request duration.
  throttledClick$(saveGistConfirm).pipe(
    map(() => saveGistName.value.trim()),
    tap(name => {
      if (name === '') show(saveGistNameError)
    }),
    filter(name => name !== ''),
    tap(() => {
      hide(saveGistNameError); hide(saveGistError)
      saveGistConfirm.classList.add('is-loading')
    }),
    exhaustMap(name => createGist({
      name,
      public: !saveGistPrivate.checked,
      code: codeCM.getCode(),
      output: saveGistIncludeOutput.checked ? outputText() : undefined
    }).pipe(
      tap(saved => {
        const params = new URLSearchParams(location.search)
        params.set('gist', saved.id)
        history.replaceState(null, '', `${location.pathname}?${params.toString()}${location.hash}`)
        closeSaveModal()
      }),
      catchError(err => {
        saveGistError.textContent = (err as Error)?.message ?? 'Could not save gist.'
        show(saveGistError)
        if (isAuthError(err)) notifySessionExpired()
        return EMPTY
      }),
      finalize(() => saveGistConfirm.classList.remove('is-loading'))
    ))
  ).subscribe()

  throttledClick$(updateGistBtn).pipe(
    map(() => loadedGist$.value),
    filter((gist): gist is GistMetadata => gist !== null),
    tap(() => {
      if (shareDropdown) hide(shareDropdown)
      updateGistBtn.classList.add('is-loading')
    }),
    exhaustMap(gist => updateGist(gist.id, {
      filename: gist.filename,
      code: codeCM.getCode(),
      output: hasOutput() ? outputText() : undefined
    }).pipe(
      catchError(err => {
        if (isAuthError(err)) {
          notifySessionExpired()
        } else {
          notify((err as Error)?.message ?? 'Could not update gist.')
        }
        return EMPTY
      }),
      finalize(() => updateGistBtn.classList.remove('is-loading'))
    ))
  ).subscribe()

  refreshMe()
}
