import axios from 'axios'
import { wadis } from '../data/wadis'
import { getForecastTimeline } from './apiService'
import { distanceKm, getNearbyReports } from './communityService'
import { buildDynamicExplanation, computeEnvironmentalRisk, getRiskLevel } from './riskEngine'
import { geocodeLocation } from './locationService'

// ===== ROUTE ANALYSIS =====
// Shared helpers for routing, route sampling, and route risk analysis.

const ROUTE_SAMPLE_COUNT = 5
const HIGH_RISK_THRESHOLD = 71
const MEDIUM_RISK_THRESHOLD = 31

// ---------------------------------------------
// FUNCTION: findNearbyWadis
// PURPOSE: Returns wadis close to a coordinate so
// route analysis can use nearby memory context
// ---------------------------------------------
export const findNearbyWadis = (lat, lng, maxDistanceKm = 12) =>
  wadis.filter((wadi) => distanceKm(lat, lng, wadi.lat, wadi.lng) <= maxDistanceKm)

// ---------------------------------------------
// FUNCTION: sampleRoutePoints
// PURPOSE: Reduces route coordinates into a small
// set of points for lightweight forecast checks
// ---------------------------------------------
export const sampleRoutePoints = (coordinates, sampleCount = ROUTE_SAMPLE_COUNT) => {
  if (!coordinates?.length) return []
  if (coordinates.length <= sampleCount) {
    return coordinates.map(([lng, lat]) => ({ lat, lng }))
  }

  const samples = []
  const step = (coordinates.length - 1) / Math.max(sampleCount - 1, 1)

  for (let index = 0; index < sampleCount; index += 1) {
    const routeIndex = Math.min(coordinates.length - 1, Math.round(index * step))
    const [lng, lat] = coordinates[routeIndex]
    samples.push({ lat, lng })
  }

  return samples
}

const normalizeRouteFeature = (feature = {}) => ({
  coordinates: feature?.geometry?.coordinates || [],
  distance: feature?.properties?.summary?.distance || 0,
  duration: feature?.properties?.summary?.duration || 0,
  usedFallback: false,
})

const buildFallbackRoute = (start, destination) => ({
  coordinates: [
    [start.lng, start.lat],
    [destination.lng, destination.lat],
  ],
  distance: distanceKm(start.lat, start.lng, destination.lat, destination.lng) * 1000,
  duration: 0,
  usedFallback: true,
})

const buildRouteSignature = (coordinates = []) =>
  coordinates
    .map(([lng, lat]) => `${lng.toFixed(3)},${lat.toFixed(3)}`)
    .join('|')

const getOverallRiskScore = (routeAnalysis) =>
  Math.max(routeAnalysis.currentRisk, routeAnalysis.riskAfter1Hour, routeAnalysis.riskAfter2Hours)

const compareRouteSafety = (left, right) => {
  const leftRisk = getOverallRiskScore(left)
  const rightRisk = getOverallRiskScore(right)

  if (leftRisk !== rightRisk) return leftRisk - rightRisk
  if (left.riskAfter2Hours !== right.riskAfter2Hours) return left.riskAfter2Hours - right.riskAfter2Hours
  if (left.totalCommunityReportsAlongRoute !== right.totalCommunityReportsAlongRoute) {
    return left.totalCommunityReportsAlongRoute - right.totalCommunityReportsAlongRoute
  }
  return (left.route.duration || left.route.distance || 0) - (right.route.duration || right.route.distance || 0)
}

const buildGoogleMapsUrl = ({ start, destination, route }) => {
  const params = new URLSearchParams({
    api: '1',
    origin: `${start.lat},${start.lng}`,
    destination: `${destination.lat},${destination.lng}`,
    travelmode: 'driving',
  })

  const waypointSamples = sampleRoutePoints(route.coordinates, 4)
    .slice(1, -1)
    .map((point) => `${point.lat},${point.lng}`)

  if (waypointSamples.length) {
    params.set('waypoints', waypointSamples.join('|'))
  }

  return `https://www.google.com/maps/dir/?${params.toString()}`
}

const buildRouteMessage = ({ language, routeAnalysis, saferRoute }) => {
  const inArabic = language === 'AR'
  const overallRisk = getOverallRiskScore(routeAnalysis)

  if (overallRisk < HIGH_RISK_THRESHOLD) {
    return inArabic
      ? 'المسار آمن نسبيا. راقب الظروف.'
      : 'Route is relatively safe. Monitor conditions.'
  }

  if (saferRoute) {
    return inArabic
      ? 'تم اكتشاف خطر فيضان مرتفع على المسار الأساسي. يتوفر مسار أكثر أمانا حاليا.'
      : 'High flood risk detected on the primary route. A safer route is available.'
  }

  return inArabic
    ? 'تم اكتشاف خطر فيضان مرتفع. لا يوجد مسار أكثر أمانا حاليا. لا ينصح بالسفر في هذا الوقت.'
    : 'High flood risk detected. No safer route available at this time. Travel is not recommended.'
}

const fetchRouteVariants = async (start, destination, extraBody = {}) => {
  const key = import.meta.env.VITE_ORS_KEY

  if (!key) {
    return [buildFallbackRoute(start, destination)]
  }

  try {
    const res = await axios.post(
      'https://api.openrouteservice.org/v2/directions/driving-car/geojson',
      {
        coordinates: [
          [start.lng, start.lat],
          [destination.lng, destination.lat],
        ],
        ...extraBody,
      },
      {
        headers: {
          Authorization: key,
          'Content-Type': 'application/json',
        },
      }
    )

    const features = res.data?.features?.map(normalizeRouteFeature).filter((route) => route.coordinates.length > 1) || []
    return features.length ? features : [buildFallbackRoute(start, destination)]
  } catch (error) {
    console.error('Route fetch failed:', error)
    return [buildFallbackRoute(start, destination)]
  }
}

// ---------------------------------------------
// FUNCTION: fetchRoute
// PURPOSE: Gets the primary route geometry from
// ORS and falls back to a direct line if needed
// ---------------------------------------------
export const fetchRoute = async (start, destination) => {
  const [primaryRoute] = await fetchRouteVariants(start, destination)
  return primaryRoute
}

const fetchAlternativeRoutes = async (start, destination) => {
  const candidateGroups = await Promise.all([
    fetchRouteVariants(start, destination, {
      alternative_routes: {
        target_count: 2,
        weight_factor: 1.6,
        share_factor: 0.6,
      },
    }),
    fetchRouteVariants(start, destination, {
      preference: 'shortest',
    }),
  ])

  return candidateGroups.flat()
}

const analyzeRouteGeometry = async ({ start, destination, route, reports = [], language = 'EN' }) => {
  const samples = sampleRoutePoints(route.coordinates, ROUTE_SAMPLE_COUNT)

  const sampledPoints = await Promise.all(
    samples.map(async (point) => {
      const forecast = await getForecastTimeline(point.lat, point.lng)
      const nearbyWadis = findNearbyWadis(point.lat, point.lng)
      const nearbyReports = getNearbyReports(reports, point.lat, point.lng, 12)
      return { ...point, forecast, nearbyWadis, nearbyReports }
    })
  )

  const totalCommunityReportsAlongRoute = new Set(
    sampledPoints.flatMap((point) => point.nearbyReports.map((report) => report.id))
  ).size

  const maxNowRain = Math.max(...sampledPoints.map((point) => point.forecast.now), 0)
  const maxPlus3Rain = Math.max(...sampledPoints.map((point) => point.forecast.plus3h), 0)
  const maxPlus6Rain = Math.max(...sampledPoints.map((point) => point.forecast.plus6h), 0)
  const dominantMemory = sampledPoints
    .flatMap((point) => point.nearbyWadis)
    .sort((a, b) => (b.baseRisk || 0) - (a.baseRisk || 0))[0]

  const currentRisk = computeEnvironmentalRisk({
    rainfall: maxNowRain,
    nearbyWadi: dominantMemory,
    memoryMatch: dominantMemory ? { name: dominantMemory.name } : null,
    communityCount: totalCommunityReportsAlongRoute,
  }).finalScore
  const riskAfter1Hour = computeEnvironmentalRisk({
    rainfall: maxPlus3Rain,
    nearbyWadi: dominantMemory,
    memoryMatch: dominantMemory ? { name: dominantMemory.name } : null,
    communityCount: totalCommunityReportsAlongRoute,
  }).finalScore
  const riskAfter2Hours = computeEnvironmentalRisk({
    rainfall: maxPlus6Rain,
    nearbyWadi: dominantMemory,
    memoryMatch: dominantMemory ? { name: dominantMemory.name } : null,
    communityCount: totalCommunityReportsAlongRoute,
  }).finalScore

  const overallRiskScore = Math.max(currentRisk, riskAfter1Hour, riskAfter2Hours)
  const riskLevel = getRiskLevel(overallRiskScore)
  const explanation = buildDynamicExplanation({
    language,
    currentRainfall: maxNowRain,
    nextRainfall: maxPlus3Rain,
    laterRainfall: maxPlus6Rain,
    memoryMatch: dominantMemory ? { name: dominantMemory.name } : null,
    communityCount: totalCommunityReportsAlongRoute,
  })

  return {
    start,
    destination,
    route,
    sampledPoints,
    currentRisk,
    riskAfter1Hour,
    riskAfter2Hours,
    overallRiskScore,
    riskLevel,
    rainfallTrend: {
      now: Number(maxNowRain.toFixed(1)),
      plus3h: Number(maxPlus3Rain.toFixed(1)),
      plus6h: Number(maxPlus6Rain.toFixed(1)),
    },
    maxRainfall: Number(Math.max(maxNowRain, maxPlus3Rain, maxPlus6Rain).toFixed(1)),
    totalCommunityReportsAlongRoute,
    explanation,
  }
}

// ---------------------------------------------
// FUNCTION: analyzeRoute
// PURPOSE: Combines primary routing, segment
// analysis, and safer-route detection
// ---------------------------------------------
export const analyzeRoute = async ({
  startText,
  destinationText,
  startLocation,
  destinationLocation,
  reports = [],
  language = 'EN',
}) => {
  const start = startLocation || (await geocodeLocation(startText))
  const destination = destinationLocation || (await geocodeLocation(destinationText))

  if (!start || !destination) {
    throw new Error('Unable to locate the selected route points.')
  }

  const primaryRouteGeometry = await fetchRoute(start, destination)
  const primaryRoute = await analyzeRouteGeometry({
    start,
    destination,
    route: primaryRouteGeometry,
    reports,
    language,
  })

  let saferRoute = null

  if (primaryRoute.overallRiskScore >= HIGH_RISK_THRESHOLD) {
    const candidates = await fetchAlternativeRoutes(start, destination)
    const primarySignature = buildRouteSignature(primaryRouteGeometry.coordinates)

    const analyzedCandidates = await Promise.all(
      candidates
        .filter((route) => route.coordinates.length > 1)
        .filter((route) => buildRouteSignature(route.coordinates) !== primarySignature)
        .map((route) =>
          analyzeRouteGeometry({
            start,
            destination,
            route,
            reports,
            language,
          })
        )
    )

    const saferCandidates = analyzedCandidates
      .filter((candidate) => compareRouteSafety(candidate, primaryRoute) < 0)
      .sort(compareRouteSafety)

    saferRoute = saferCandidates[0] || null
  }

  const message = buildRouteMessage({ language, routeAnalysis: primaryRoute, saferRoute })

  return {
    start,
    destination,
    route: primaryRoute.route,
    sampledPoints: primaryRoute.sampledPoints,
    currentRisk: primaryRoute.currentRisk,
    riskAfter1Hour: primaryRoute.riskAfter1Hour,
    riskAfter2Hours: primaryRoute.riskAfter2Hours,
    riskLevel: primaryRoute.riskLevel,
    rainfallTrend: primaryRoute.rainfallTrend,
    maxRainfall: primaryRoute.maxRainfall,
    totalCommunityReportsAlongRoute: primaryRoute.totalCommunityReportsAlongRoute,
    explanation: primaryRoute.explanation,
    primaryRoute: {
      ...primaryRoute,
      label: primaryRoute.overallRiskScore >= HIGH_RISK_THRESHOLD ? 'Risky Route' : 'Primary Route',
      kind: primaryRoute.overallRiskScore >= HIGH_RISK_THRESHOLD ? 'risky' : 'primary',
      mapsUrl: buildGoogleMapsUrl(primaryRoute),
    },
    saferRoute: saferRoute
      ? {
          ...saferRoute,
          label: 'Safer Route',
          kind: 'safe',
          mapsUrl: buildGoogleMapsUrl(saferRoute),
        }
      : null,
    overallRiskScore: primaryRoute.overallRiskScore,
    message,
    decision:
      primaryRoute.overallRiskScore < MEDIUM_RISK_THRESHOLD
        ? 'low'
        : primaryRoute.overallRiskScore < HIGH_RISK_THRESHOLD
          ? 'medium'
          : saferRoute
            ? 'high_with_alternative'
            : 'high_no_alternative',
  }
}
