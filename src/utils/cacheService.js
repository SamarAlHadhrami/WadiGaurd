// ===== LOCAL CACHE =====
// Lightweight localStorage helpers for offline
// fallback across weather, map, risk, and app UI.

const CACHE_PREFIX = 'wadi-guard-cache'

const isStorageAvailable = () => typeof window !== 'undefined' && Boolean(window.localStorage)

const buildKey = (key) => `${CACHE_PREFIX}:${key}`

export const readCache = (key, fallback = null) => {
  if (!isStorageAvailable()) return fallback

  try {
    const raw = window.localStorage.getItem(buildKey(key))
    if (!raw) return fallback
    const parsed = JSON.parse(raw)
    return parsed?.data ?? fallback
  } catch (error) {
    console.error('Cache read failed:', error)
    return fallback
  }
}

export const writeCache = (key, data) => {
  if (!isStorageAvailable()) return

  try {
    window.localStorage.setItem(
      buildKey(key),
      JSON.stringify({
        savedAt: Date.now(),
        data,
      })
    )
  } catch (error) {
    console.error('Cache write failed:', error)
  }
}

const roundCoord = (value) => Number(value || 0).toFixed(2)
const buildCoordKey = (lat, lng) => `${roundCoord(lat)}:${roundCoord(lng)}`

export const getWeatherCacheKey = (lat, lng) => `weather:${buildCoordKey(lat, lng)}`
export const getForecastCacheKey = (lat, lng) => `forecast:${buildCoordKey(lat, lng)}`
export const getRiskCacheKey = (name) => `risk:${name}`

export const cacheWeatherData = (lat, lng, data) => writeCache(getWeatherCacheKey(lat, lng), data)
export const getCachedWeatherData = (lat, lng) => readCache(getWeatherCacheKey(lat, lng))

export const cacheForecastData = (lat, lng, data) => writeCache(getForecastCacheKey(lat, lng), data)
export const getCachedForecastData = (lat, lng) => readCache(getForecastCacheKey(lat, lng))

export const cacheRiskResult = (name, data) => writeCache(getRiskCacheKey(name), data)
export const getCachedRiskResult = (name) => readCache(getRiskCacheKey(name))

export const cacheMapData = (name, data) => writeCache(`map:${name}`, data)
export const getCachedMapData = (name) => readCache(`map:${name}`)
