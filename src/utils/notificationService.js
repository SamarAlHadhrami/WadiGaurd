import { readCache, writeCache } from './cacheService'

// ===== NOTIFICATIONS =====
// Small browser-notification helpers used by the
// app shell without requiring a backend.

const NOTIFICATION_DEDUPE_KEY = 'notifications:last-shown'
const DEFAULT_COOLDOWN_MS = 10 * 60 * 1000

export const requestNotificationPermission = async () => {
  if (typeof window === 'undefined' || !('Notification' in window)) return 'unsupported'
  if (Notification.permission !== 'default') return Notification.permission

  try {
    return await Notification.requestPermission()
  } catch (error) {
    console.error('Notification permission request failed:', error)
    return 'denied'
  }
}

const shouldNotify = (tag, cooldownMs = DEFAULT_COOLDOWN_MS) => {
  const history = readCache(NOTIFICATION_DEDUPE_KEY, {})
  const lastShownAt = history?.[tag] || 0
  return Date.now() - lastShownAt > cooldownMs
}

const markNotified = (tag) => {
  const history = readCache(NOTIFICATION_DEDUPE_KEY, {})
  writeCache(NOTIFICATION_DEDUPE_KEY, {
    ...history,
    [tag]: Date.now(),
  })
}

export const showBrowserNotification = async ({
  title,
  body,
  tag,
  cooldownMs = DEFAULT_COOLDOWN_MS,
}) => {
  if (typeof window === 'undefined' || !('Notification' in window)) return false
  if (Notification.permission !== 'granted') return false
  if (tag && !shouldNotify(tag, cooldownMs)) return false

  try {
    const registration = await navigator.serviceWorker?.getRegistration?.()
    if (registration?.showNotification) {
      await registration.showNotification(title, {
        body,
        tag,
        icon: '/pwa-192.png',
        badge: '/pwa-192.png',
      })
    } else {
      const notification = new Notification(title, {
        body,
        tag,
        icon: '/pwa-192.png',
      })
      window.setTimeout(() => notification.close(), 8000)
    }

    if (tag) markNotified(tag)
    return true
  } catch (error) {
    console.error('Notification display failed:', error)
    return false
  }
}
