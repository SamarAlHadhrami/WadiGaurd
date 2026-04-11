import axios from 'axios'

// ===== LOCATION SERVICES =====
// Geolocation, geocoding, reverse geocoding, and short-name helpers.

const NOMINATIM_HEADERS = {
  Accept: 'application/json',
}

const OMAN_BOUNDS = '52.0,16.0,60.5,27.0'
const VAGUE_TERMS = ['shop', 'place', 'road', 'street', 'area', 'location']
const KNOWN_OMAN_LOCATIONS = {
  muscat: { lat: 23.588, lng: 58.3829, name: 'Muscat, Oman' },
  'مسقط': { lat: 23.588, lng: 58.3829, name: 'مسقط، عمان' },
  sur: { lat: 22.5667, lng: 59.5289, name: 'Sur, Oman' },
  'صور': { lat: 22.5667, lng: 59.5289, name: 'صور، عمان' },
  'wadi shab': { lat: 22.8486, lng: 59.2417, name: 'Wadi Shab, Oman' },
  'وادي شاب': { lat: 22.8486, lng: 59.2417, name: 'وادي شاب، عمان' },
}

// ---------------------------------------------
// FUNCTION: validateLocationQuery
// PURPOSE: Rejects vague or too-short search text
// before calling the geocoder
// ---------------------------------------------
export const validateLocationQuery = (query) => {
  const trimmed = query?.trim()
  if (!trimmed || trimmed.length < 3) return false
  if (trimmed.split(/\s+/).length === 1 && VAGUE_TERMS.includes(trimmed.toLowerCase())) {
    return false
  }
  return true
}

// ---------------------------------------------
// FUNCTION: withOmanSuffix
// PURPOSE: Improves searches by appending Oman
// when the query does not already include it
// ---------------------------------------------
export const withOmanSuffix = (query) =>
  /oman/i.test(query || '') ? query : `${query}, Oman`

const getKnownLocation = (query = '') => KNOWN_OMAN_LOCATIONS[query.trim().toLowerCase()] || null

const scoreGeocodeResult = (query, hit) => {
  const normalizedQuery = query.trim().toLowerCase()
  const displayName = `${hit.display_name || ''}`.toLowerCase()
  const address = hit.address || {}
  const cityParts = [address.city, address.town, address.village, address.county, address.state, address.state_district]
    .filter(Boolean)
    .map((value) => `${value}`.toLowerCase())

  let score = 0

  if (hit.address?.country_code === 'om') score += 100
  if (cityParts.some((value) => value === normalizedQuery)) score += 60
  if (displayName.startsWith(normalizedQuery)) score += 40
  if (displayName.includes(normalizedQuery)) score += 20
  if (/muscat|مسقط/.test(normalizedQuery) && /muscat|مسقط/.test(displayName)) score += 50
  if (/sur|صور/.test(normalizedQuery) && /sur|صور/.test(displayName)) score += 50

  return score
}

const pickBestOmanResult = (query, results = []) =>
  results
    .slice()
    .sort((left, right) => scoreGeocodeResult(query, right) - scoreGeocodeResult(query, left))[0] || null

// ---------------------------------------------
// FUNCTION: getCurrentLocation
// PURPOSE: Reads device GPS and falls back to
// Muscat if geolocation is unavailable
// ---------------------------------------------
export const getCurrentLocation = () =>
  new Promise((resolve) => {
    if (!navigator.geolocation) {
      resolve({ lat: 23.588, lng: 58.3829, name: 'Muscat, Oman' })
      return
    }

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const lat = position.coords.latitude
        const lng = position.coords.longitude
        const name = await reverseGeocode(lat, lng)
        resolve({ lat, lng, name })
      },
      () => resolve({ lat: 23.588, lng: 58.3829, name: 'Muscat, Oman' }),
      { enableHighAccuracy: true, timeout: 10000 }
    )
  })

// ---------------------------------------------
// FUNCTION: geocodeLocation
// PURPOSE: Converts a place name into coordinates
// using Nominatim search
// ---------------------------------------------
export const geocodeLocation = async (query) => {
  if (!validateLocationQuery(query)) return null
  const knownLocation = getKnownLocation(query)
  if (knownLocation) return knownLocation

  const fullQuery = withOmanSuffix(query.trim())

  try {
    const res = await axios.get('https://nominatim.openstreetmap.org/search', {
      params: {
        q: fullQuery,
        format: 'json',
        limit: 5,
        addressdetails: 1,
        countrycodes: 'om',
        viewbox: OMAN_BOUNDS,
        bounded: 1,
      },
      headers: NOMINATIM_HEADERS,
    })

    const hit = pickBestOmanResult(query, res.data || [])
    if (!hit) return null

    return {
      lat: Number(hit.lat),
      lng: Number(hit.lon),
      name: hit.display_name || fullQuery,
    }
  } catch (error) {
    console.error('Geocoding failed:', error)
    return null
  }
}

// ---------------------------------------------
// FUNCTION: reverseGeocode
// PURPOSE: Converts coordinates into a readable
// place name
// ---------------------------------------------
export const reverseGeocode = async (lat, lng) => {
  try {
    const res = await axios.get('https://nominatim.openstreetmap.org/reverse', {
      params: { lat, lon: lng, format: 'json' },
      headers: NOMINATIM_HEADERS,
    })
    return res.data?.display_name || 'Unknown area'
  } catch (error) {
    console.error('Reverse geocoding failed:', error)
    return 'Unknown area'
  }
}

// ---------------------------------------------
// FUNCTION: getShortLocationName
// PURPOSE: Turns full API addresses into short
// display-friendly location names
// ---------------------------------------------
export const getShortLocationName = (fullName = '') => {
  const parts = `${fullName}`
    .split(',')
    .map((part) =>
      part
        .replace(/\b(Governorate|Province|ولاية|محافظة)\b/gi, '')
        .trim()
    )
    .filter((part) => part && !/^(oman|عمان)$/i.test(part) && !/^\d+$/.test(part))

  if (parts.length === 0) return 'Unknown area'
  if (parts.length === 1) return parts[0]
  if (parts.length >= 3) {
    const candidate = parts[parts.length - 3]
    const city = parts[parts.length - 1]
    if (/(wadi|area|وادي|منطقة)/i.test(candidate)) {
      return `${candidate}, ${city}`
    }
  }

  return `${parts[parts.length - 2]}, ${parts[parts.length - 1]}`
}
