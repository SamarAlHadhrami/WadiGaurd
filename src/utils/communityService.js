// ===== COMMUNITY HELPERS =====
// Shared distance, time, and filtering logic for community reports.

// ---------------------------------------------
// FUNCTION: toRadians
// PURPOSE: Converts degrees to radians for the
// distance calculation
// ---------------------------------------------
export const toRadians = (value) => (value * Math.PI) / 180

// ---------------------------------------------
// FUNCTION: distanceKm
// PURPOSE: Measures approximate distance between
// two coordinates in kilometers
// ---------------------------------------------
export const distanceKm = (aLat, aLng, bLat, bLng) => {
  const earthRadiusKm = 6371
  const dLat = toRadians(bLat - aLat)
  const dLng = toRadians(bLng - aLng)
  const lat1 = toRadians(aLat)
  const lat2 = toRadians(bLat)

  const haversine =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2

  return 2 * earthRadiusKm * Math.asin(Math.sqrt(haversine))
}

// ---------------------------------------------
// FUNCTION: getNearbyReports
// PURPOSE: Returns reports within a chosen radius
// around a coordinate
// ---------------------------------------------
export const getNearbyReports = (reports, lat, lng, radiusKm = 10) =>
  (reports || []).filter(
    (report) =>
      typeof report.lat === 'number' &&
      typeof report.lng === 'number' &&
      distanceKm(lat, lng, report.lat, report.lng) <= radiusKm
  )

// ---------------------------------------------
// FUNCTION: countNearbyReports
// PURPOSE: Counts the nearby reports found around
// a coordinate
// ---------------------------------------------
export const countNearbyReports = (reports, lat, lng, radiusKm = 10) =>
  getNearbyReports(reports, lat, lng, radiusKm).length

// ---------------------------------------------
// FUNCTION: filterReportsWithinHours
// PURPOSE: Keeps only reports created inside a
// rolling hour window such as the last 24 hours
// ---------------------------------------------
export const filterReportsWithinHours = (reports, hours = 24) => {
  const cutoff = Date.now() - hours * 60 * 60 * 1000
  return (reports || []).filter((report) => {
    const timestamp = toTimestamp(report.createdAt)
    return Boolean(timestamp) && timestamp >= cutoff
  })
}

// ---------------------------------------------
// FUNCTION: countNearbyReportsWithinHours
// PURPOSE: Counts nearby reports limited to a
// rolling time window such as the last 24 hours
// ---------------------------------------------
export const countNearbyReportsWithinHours = (reports, lat, lng, radiusKm = 10, hours = 24) =>
  countNearbyReports(filterReportsWithinHours(reports, hours), lat, lng, radiusKm)

// ---------------------------------------------
// FUNCTION: formatReportTime
// PURPOSE: Formats a Firestore or JS date value
// into a simple relative time string
// ---------------------------------------------
export const formatReportTime = (createdAt) => {
  if (!createdAt) return 'Just now'

  const timestamp =
    typeof createdAt === 'number'
      ? createdAt
      : typeof createdAt?.toMillis === 'function'
        ? createdAt.toMillis()
        : new Date(createdAt).getTime()

  if (!timestamp) return 'Just now'

  const diffMinutes = Math.max(1, Math.round((Date.now() - timestamp) / 60000))

  if (diffMinutes < 60) return `${diffMinutes} mins ago`
  const diffHours = Math.round(diffMinutes / 60)
  if (diffHours < 24) return `${diffHours} hours ago`
  const diffDays = Math.round(diffHours / 24)
  return `${diffDays} days ago`
}

// ---------------------------------------------
// FUNCTION: toTimestamp
// PURPOSE: Converts different date shapes into a
// numeric timestamp for filtering
// ---------------------------------------------
export const toTimestamp = (createdAt) => {
  if (!createdAt) return 0
  if (typeof createdAt === 'number') return createdAt
  if (typeof createdAt?.toMillis === 'function') return createdAt.toMillis()
  const parsed = new Date(createdAt).getTime()
  return Number.isFinite(parsed) ? parsed : 0
}

// ---------------------------------------------
// FUNCTION: filterReportsWithinDays
// PURPOSE: Keeps only recent reports inside the
// chosen retention window
// ---------------------------------------------
export const filterReportsWithinDays = (reports, days = 14) => {
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000
  return (reports || []).filter((report) => {
    const timestamp = toTimestamp(report.createdAt)
    return !timestamp || timestamp >= cutoff
  })
}

// ---------------------------------------------
// FUNCTION: filterSameDayReports
// PURPOSE: Keeps only reports created on the same
// calendar day as today
// ---------------------------------------------
export const filterSameDayReports = (reports) => {
  const now = new Date()
  return (reports || []).filter((report) => {
    const timestamp = toTimestamp(report.createdAt)
    if (!timestamp) return true
    const reportDate = new Date(timestamp)
    return (
      reportDate.getFullYear() === now.getFullYear() &&
      reportDate.getMonth() === now.getMonth() &&
      reportDate.getDate() === now.getDate()
    )
  })
}
