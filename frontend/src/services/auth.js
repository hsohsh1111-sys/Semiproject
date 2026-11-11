export const AUTH_CHANGE_EVENT = 'onfit-auth-change'

export function getAccessToken() {
  return window.localStorage.getItem('onfit_access_token')
}

export function notifyAuthenticationChanged() {
  window.dispatchEvent(new Event(AUTH_CHANGE_EVENT))
}
