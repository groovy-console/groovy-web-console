import { BehaviorSubject } from 'rxjs'
import { GistMetadata, User } from './types'

const accessUrl = (path: string) => `${GITHUB_ACCESS_SERVICE_URL}${path}`
// The popup loads from the github-access function origin, so postMessage will
// carry event.origin = <access origin>, not location.origin (the main app).
const accessOrigin = new URL(GITHUB_ACCESS_SERVICE_URL).origin

export const currentUser$ = new BehaviorSubject<User | null>(null)
export const loadedGist$ = new BehaviorSubject<GistMetadata | null>(null)

export async function refreshMe (): Promise<User | null> {
  try {
    const response = await fetch(accessUrl('/?action=me'), { credentials: 'include' })
    if (!response.ok) {
      currentUser$.next(null)
      return null
    }
    const user = await response.json() as User
    currentUser$.next(user)
    return user
  } catch (e) {
    console.info('Auth check failed', e)
    currentUser$.next(null)
    return null
  }
}

export function signIn (onComplete: () => void): void {
  let popup: Window | null = null

  const messageListener = (event: MessageEvent) => {
    // event.source pins the message to our specific popup; event.origin pins it
    // to the access function's origin (where the inline postMessage script ran).
    if (event.source !== popup) return
    if (event.origin !== accessOrigin) return
    if (!event.data || event.data.type !== 'gwc:login-success') return
    window.removeEventListener('message', messageListener)
    onComplete()
  }
  window.addEventListener('message', messageListener)

  popup = window.open(accessUrl('/?action=login'), 'gwc-login', 'width=600,height=700')
  if (popup === null) {
    window.removeEventListener('message', messageListener)
    window.location.assign(accessUrl('/?action=login'))
    return
  }

  const interval = window.setInterval(() => {
    if (popup.closed) {
      window.clearInterval(interval)
      window.removeEventListener('message', messageListener)
    }
  }, 500)
}

export async function signOut (): Promise<void> {
  // Optimistic: clear local user state even if the server call failed. A failed
  // logout means the cookie is still alive server-side, but the next page load
  // calls ?action=me and will re-hydrate currentUser$ if the session is still
  // valid. Prioritises responsive UI over strict server-side cleanup.
  try {
    await fetch(accessUrl('/?action=logout'), { method: 'POST', credentials: 'include' })
  } catch (e) {
    console.info('Logout request failed', e)
  }
  currentUser$.next(null)
}
