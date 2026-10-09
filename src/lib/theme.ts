// The light or dark look, chosen per device (D114). Until someone picks one,
// it follows the system's setting.

import { useSyncExternalStore } from 'react'

export type ThemeChoice = 'light' | 'dark' | 'system'

export const THEME_CHOICES: ThemeChoice[] = ['light', 'dark', 'system']

const KEY = 'onova.theme'
const EVENT = 'onova:theme'

function storage(): Storage | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage
  } catch {
    return null
  }
}

export function readTheme(): ThemeChoice {
  const value = storage()?.getItem(KEY)
  return value === 'light' || value === 'dark' ? value : 'system'
}

/** Saves the choice and repaints at once; the system choice is the default, so it's not stored. */
export function saveTheme(choice: ThemeChoice) {
  try {
    if (choice === 'system') storage()?.removeItem(KEY)
    else storage()?.setItem(KEY, choice)
  } catch {
    return
  }
  window.dispatchEvent(new Event(EVENT))
}

export function subscribeTheme(listener: () => void) {
  window.addEventListener(EVENT, listener)
  window.addEventListener('storage', listener)
  return () => {
    window.removeEventListener(EVENT, listener)
    window.removeEventListener('storage', listener)
  }
}

export function useTheme(): ThemeChoice {
  return useSyncExternalStore(subscribeTheme, readTheme, () => 'system')
}

// Runs in <head>, before the first paint, so a dark screen never flashes
// white. It applies the saved choice, or the system's setting, and follows a
// change of either while the app is open (another tab's choice too). The
// browser bar takes the brand blue in light and the page colour in dark.
export const THEME_SCRIPT = `(function(){var q=window.matchMedia('(prefers-color-scheme: dark)');function s(){try{return localStorage.getItem(${JSON.stringify(KEY)})}catch(x){return null}}function a(){var v=s(),d=v==='dark'||(v!=='light'&&q.matches),e=document.documentElement,t=document.querySelectorAll('meta[name="theme-color"]');e.classList.toggle('dark',d);e.style.colorScheme=d?'dark':'light';t.forEach(function(m){m.setAttribute('content',d?'#040405':'#2453a4')})}a();q.addEventListener('change',a);window.addEventListener(${JSON.stringify(EVENT)},a);window.addEventListener('storage',a)})()`
