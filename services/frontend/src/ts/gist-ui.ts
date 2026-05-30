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

  const show = (el: HTMLElement) => el.classList.remove('is-hidden')
  const hide = (el: HTMLElement) => el.classList.add('is-hidden')

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

  const throttledClick$ = (el: HTMLElement): Observable<Event> =>
    fromEvent(el, 'click').pipe(throttleTime(CLICK_THROTTLE_MS))

  throttledClick$(signInItem).subscribe(() => signIn(() => { refreshMe() }))
  throttledClick$(signOutItem).pipe(
    tap(e => e.preventDefault())
  ).subscribe(() => signOut())

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

  throttledClick$(saveAsPublicGistBtn).subscribe(() => openSaveModal('public'))
  throttledClick$(saveAsSecretGistBtn).subscribe(() => openSaveModal('secret'))
  throttledClick$(saveAsNewGistBtn).subscribe(() => openSaveModal('new'))
  saveGistModalClose.addEventListener('click', closeSaveModal)
  saveGistCancel.addEventListener('click', closeSaveModal)
  saveGistModal.querySelector('.modal-background').addEventListener('click', closeSaveModal)

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
      public: pendingVisibility ?? true,
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
    tap(() => updateGistBtn.classList.add('is-loading')),
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
