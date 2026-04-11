import { useEffect, useMemo, useState } from 'react'
import L from 'leaflet'
import {
  CircleMarker,
  MapContainer,
  Popup,
  TileLayer,
  useMap,
  useMapEvents,
} from 'react-leaflet'
import 'leaflet/dist/leaflet.css'
import { wadis } from '../data/wadis'
import { getForecastTimeline, getWeatherData } from '../utils/apiService'
import { cacheMapData, getCachedMapData } from '../utils/cacheService'
import {
  countNearbyReports,
  distanceKm,
  filterSameDayReports,
  filterReportsWithinDays,
  getNearbyReports,
} from '../utils/communityService'
import {
  buildDynamicExplanation,
  computeEnvironmentalRisk,
  formatRiskWithLevelLocalized,
  getRainIntensityLabel,
  getRiskLevel,
  matchHistoricalPattern,
} from '../utils/riskEngine'
import {
  geocodeLocation,
  getCurrentLocation,
  getShortLocationName,
  reverseGeocode,
} from '../utils/locationService'
import { t } from '../utils/i18n'
import WadiDetailPanel from './WadiDetailPanel'

// ===== MAP ANALYSIS =====
// Main map view with region overlays, live click analysis, and community overlay.

// ---------------------------------------------
// FUNCTION: buildTimeline
// PURPOSE: Creates shared NOW / +1H / +2H items
// for the compact map analysis card
// ---------------------------------------------
const buildTimeline = (language, now, plus1, plus2) => [
  { label: t(language, 'now'), value: now },
  { label: t(language, 'plus1h'), value: plus1 },
  { label: t(language, 'plus2h'), value: plus2 },
]

// Shared Leaflet style for ADM1 / ADM2 region fills.
const REGION_BORDER_STYLE = {
  color: '#ffffff',
  weight: 1.5,
  opacity: 0.9,
  fillOpacity: 0.55,
}

const OMAN_MAX_BOUNDS = [
  [16.0, 52.0],
  [26.5, 60.5],
]

const REGION_NAME_ALIASES = {
  'al batinah': ['north al batinah', 'south al batinah', 'al batinah'],
  'ash sharqiyah': ['north ash sharqiyah', 'south ash sharqiyah', 'ash sharqiyah'],
  'az zahirah': ['ad dhahirah', 'az zahirah'],
}

// ---------------------------------------------
// FUNCTION: getRegionRainColor
// PURPOSE: Maps rainfall values to the shared
// region-fill rain palette
// ---------------------------------------------
const getRegionRainColor = (rainfall = 0) => {
  if (rainfall === 0) return '#22c55e'
  if (rainfall <= 2) return '#84cc16'
  if (rainfall <= 5) return '#facc15'
  if (rainfall <= 10) return '#fb923c'
  return '#ef4444'
}

// ---------------------------------------------
// FUNCTION: getRiskColor
// PURPOSE: Maps numeric risk into the region-fill
// color palette used on the analysis map
// ---------------------------------------------
const getRiskColor = (risk = 0) => {
  if (risk < 30) return '#22c55e'
  if (risk < 60) return '#facc15'
  return '#ef4444'
}

// ---------------------------------------------
// FUNCTION: readStoredToggle
// PURPOSE: Restores persisted map layer toggles
// from local storage without changing defaults
// ---------------------------------------------
const readStoredToggle = (key, fallback) => {
  if (typeof window === 'undefined') return fallback

  const value = window.localStorage.getItem(key)
  if (value === 'true') return true
  if (value === 'false') return false
  return fallback
}

// ---------------------------------------------
// FUNCTION: formatRegionClickLocationName
// PURPOSE: Builds a short card title for region
// selections in the risk or rain overlay
// ---------------------------------------------
const formatRegionClickLocationName = (regionName, overlayType, language) =>
  overlayType === 'rain'
    ? `${regionName} ${t(language, 'regionRain')}`
    : `${regionName} ${t(language, 'regionRisk')}`

// ---------------------------------------------
// COMPONENT: SearchIcon
// PURPOSE: Renders the floating search button icon
// ---------------------------------------------
function SearchIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="6.5" />
      <path d="M16 16l5 5" />
    </svg>
  )
}

// ---------------------------------------------
// COMPONENT: LayersIcon
// PURPOSE: Renders the floating layers button icon
// ---------------------------------------------
function LayersIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 4l8 4-8 4-8-4 8-4z" />
      <path d="M4 12l8 4 8-4" />
      <path d="M4 16l8 4 8-4" />
    </svg>
  )
}

// ---------------------------------------------
// COMPONENT: LocateIcon
// PURPOSE: Renders the floating current-location
// button icon
// ---------------------------------------------
function LocateIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="6.5" />
      <circle cx="12" cy="12" r="1.8" fill="currentColor" stroke="none" />
      <path d="M12 2v3" />
      <path d="M12 19v3" />
      <path d="M2 12h3" />
      <path d="M19 12h3" />
    </svg>
  )
}

// ---------------------------------------------
// FUNCTION: normalizeRegionName
// PURPOSE: Normalizes region labels before alias
// matching against static wadi descriptions
// ---------------------------------------------
const normalizeRegionName = (name = '') => name.toLowerCase().trim()

// ---------------------------------------------
// FUNCTION: getFeatureRegionName
// PURPOSE: Reads the most likely region name field
// from mixed GeoJSON property formats
// ---------------------------------------------
const getFeatureRegionName = (feature) =>
  feature?.properties?.name ||
  feature?.properties?.NAME_1 ||
  feature?.properties?.shapeName ||
  feature?.properties?.shapeName_1 ||
  t('EN', 'unknownRegion')

// ---------------------------------------------
// FUNCTION: getFeatureCenter
// PURPOSE: Estimates a simple center point for a
// GeoJSON feature so region cards have coordinates
// ---------------------------------------------
const getFeatureCenter = (feature) => {
  const coordinates = feature?.geometry?.coordinates || []
  let minLat = Infinity
  let maxLat = -Infinity
  let minLng = Infinity
  let maxLng = -Infinity

  const visit = (value) => {
    if (!Array.isArray(value)) return
    if (typeof value[0] === 'number' && typeof value[1] === 'number') {
      const [lng, lat] = value
      minLat = Math.min(minLat, lat)
      maxLat = Math.max(maxLat, lat)
      minLng = Math.min(minLng, lng)
      maxLng = Math.max(maxLng, lng)
      return
    }
    value.forEach(visit)
  }

  visit(coordinates)

  return [
    Number.isFinite(minLat) ? (minLat + maxLat) / 2 : 22.9,
    Number.isFinite(minLng) ? (minLng + maxLng) / 2 : 57.5,
  ]
}

// ---------------------------------------------
// FUNCTION: isWadiInRegion
// PURPOSE: Matches a known wadi description to a
// region name or governorate alias
// ---------------------------------------------
const isWadiInRegion = (wadi, regionName) => {
  const normalizedRegionName = normalizeRegionName(regionName)
  const aliases = REGION_NAME_ALIASES[normalizedRegionName] || [normalizedRegionName]
  const wadiLocation = normalizeRegionName(`${wadi.name} ${wadi.description}`)

  return aliases.some((alias) => wadiLocation.includes(alias))
}

// ---------------------------------------------
// FUNCTION: getRegionRiskMetrics
// PURPOSE: Builds rainfall, risk, memory, and
// community summary data for one region feature
// ---------------------------------------------
const getRegionRiskMetrics = (feature, wadiRiskMap, reports) => {
  const regionName = getFeatureRegionName(feature)
  const [lat, lng] = getFeatureCenter(feature)

  const regionWadis = wadis.filter((wadi) => isWadiInRegion(wadi, regionName))
  const weatherSourceWadis = regionWadis.length ? regionWadis : wadis

  const weatherSamples = weatherSourceWadis
    .map((wadi) => ({
      rainfall: wadiRiskMap[wadi.id]?.weather?.rainfall ?? 0,
      distance: distanceKm(lat, lng, wadi.lat, wadi.lng),
    }))
    .sort((a, b) => a.distance - b.distance)
    .slice(0, 3)

  const weightedRainfall = weatherSamples.reduce(
    (accumulator, sample) => {
      const weight = 1 / Math.max(sample.distance, 1)
      return {
        rainfall: accumulator.rainfall + sample.rainfall * weight,
        weight: accumulator.weight + weight,
      }
    },
    { rainfall: 0, weight: 0 }
  )

  const averageRainfall = weightedRainfall.weight ? weightedRainfall.rainfall / weightedRainfall.weight : 0

  const communityInfluence = (reports || [])
    .filter((report) => typeof report.lat === 'number' && typeof report.lng === 'number')
    .reduce((total, report) => {
      const distance = distanceKm(lat, lng, report.lat, report.lng)
      if (distance > 65) return total
      return total + Math.max(0, 1 - distance / 65)
    }, 0)

  const nearestWadi = wadis
    .slice()
    .sort((a, b) => distanceKm(lat, lng, a.lat, a.lng) - distanceKm(lat, lng, b.lat, b.lng))[0]

  const nearestDistance = nearestWadi ? distanceKm(lat, lng, nearestWadi.lat, nearestWadi.lng) : Infinity
  const memoryMatch =
    nearestWadi && nearestDistance <= 60
      ? { name: nearestWadi.name }
      : null

  const analysis = computeEnvironmentalRisk({
    rainfall: averageRainfall,
    nearbyWadi: nearestDistance <= 45 ? nearestWadi : null,
    memoryMatch,
    communityCount: Math.round(communityInfluence),
  })

  return {
    regionName,
    lat,
    lng,
    averageRainfall,
    rainfall1h: averageRainfall,
    rainfall2h: averageRainfall,
    rainLabel: getRainIntensityLabel(averageRainfall, 'EN'),
    rainColor: getRegionRainColor(averageRainfall),
    communityCount: Math.round(communityInfluence),
    nearestWadiName: nearestWadi?.name || null,
    nearestWadiNameAr: nearestWadi?.nameAr || nearestWadi?.name || null,
    riskScore: analysis.finalScore,
    risk: analysis.risk,
    riskColor: getRiskColor(analysis.finalScore),
  }
}

// ---------------------------------------------
// COMPONENT: RegionOverlay
// PURPOSE: Renders a clean region-based overlay
// using GeoJSON and per-region metrics
// ---------------------------------------------
function RegionOverlay({ overlayType, visible, regionGeoJson, regionMetrics, onRegionSelect, language }) {
  const map = useMap()

  useEffect(() => {
    if (!visible || !regionGeoJson) return undefined

    const layer = L.geoJSON(regionGeoJson, {
      style: (feature) => {
        const metrics = regionMetrics[getFeatureRegionName(feature)]
        const fillColor =
          overlayType === 'rain'
            ? metrics?.rainColor || '#22c55e'
            : metrics?.riskColor || '#22c55e'

        return {
          ...REGION_BORDER_STYLE,
          fillColor,
        }
      },
      onEachFeature: (feature, itemLayer) => {
        const regionName = getFeatureRegionName(feature)
        const metrics = regionMetrics[regionName]
        if (!metrics) return

        itemLayer.on('click', (event) => {
          if (event.originalEvent) {
            L.DomEvent.stopPropagation(event.originalEvent)
          }
          onRegionSelect({
            loading: false,
            lat: metrics.lat,
            lng: metrics.lng,
            locationName: formatRegionClickLocationName(regionName, overlayType, language),
            rainfall: metrics.averageRainfall,
            rainfall1h: metrics.rainfall1h ?? metrics.averageRainfall,
            rainfall2h: metrics.rainfall2h ?? metrics.averageRainfall,
            memoryMatch: metrics.nearestWadiName ? { name: metrics.nearestWadiName, nameAr: metrics.nearestWadiNameAr } : null,
            communityCount: metrics.communityCount,
            finalRisk: metrics.riskScore,
            risk1h: metrics.riskScore,
            risk2h: metrics.riskScore,
            source: 'region',
            sourceOverlay: overlayType,
          })
        })
      },
    }).addTo(map)

    return () => {
      map.removeLayer(layer)
    }
  }, [language, map, onRegionSelect, overlayType, regionGeoJson, regionMetrics, visible])

  return null
}

// ---------------------------------------------
// COMPONENT: OmanMapBounds
// PURPOSE: Keeps the map focused on Oman for a
// cleaner region-based map experience
// ---------------------------------------------
function OmanMapBounds() {
  const map = useMap()

  useEffect(() => {
    map.setMaxBounds(OMAN_MAX_BOUNDS)
  }, [map])

  return null
}

// ---------------------------------------------
// COMPONENT: MapZoomTracker
// PURPOSE: Tracks map zoom so the region overlay
// can switch to more detailed boundaries
// ---------------------------------------------
function MapZoomTracker({ onZoomChange }) {
  const map = useMapEvents({
    zoomend() {
      onZoomChange(map.getZoom())
    },
  })

  useEffect(() => {
    onZoomChange(map.getZoom())
  }, [map, onZoomChange])

  return null
}

// ---------------------------------------------
// COMPONENT: MapViewportControl
// PURPOSE: Moves the map smoothly when the user
// searches or uses the location shortcut
// ---------------------------------------------
function MapViewportControl({ target }) {
  const map = useMap()

  useEffect(() => {
    if (!target) return
    map.flyTo([target.lat, target.lng], target.zoom ?? 11, { duration: 1.2 })
  }, [map, target])

  return null
}

// ---------------------------------------------
// COMPONENT: MapClickAnalysis
// PURPOSE: Handles user taps on the analysis map
// and returns a compact live result card
// ---------------------------------------------
function MapClickAnalysis({ enabled, onPick, reports, language }) {
  useMapEvents({
    async click(event) {
      if (!enabled) return

      const lat = event.latlng.lat
      const lng = event.latlng.lng
      onPick({ loading: true, locationName: t(language, 'mapAnalysisLoading'), lat, lng })

      const [locationName, weather, forecast] = await Promise.all([
        reverseGeocode(lat, lng),
        getWeatherData(lat, lng),
        getForecastTimeline(lat, lng),
      ])

      const nearestWadi = wadis
        .slice()
        .sort(
          (a, b) =>
            Math.abs(a.lat - lat) +
            Math.abs(a.lng - lng) -
            (Math.abs(b.lat - lat) + Math.abs(b.lng - lng))
        )[0]
      const nearbyReports = getNearbyReports(reports, lat, lng, 10)
      const memoryMatch = matchHistoricalPattern(weather.rainfall, weather.rainfall * 10)
      const analysisNow = computeEnvironmentalRisk({
        rainfall: weather.rainfall,
        nearbyWadi: nearestWadi,
        memoryMatch,
        communityCount: nearbyReports.length,
      })
      const analysisPlus1 = computeEnvironmentalRisk({
        rainfall: forecast.plus3h,
        nearbyWadi: nearestWadi,
        memoryMatch,
        communityCount: nearbyReports.length,
      })
      const analysisPlus2 = computeEnvironmentalRisk({
        rainfall: forecast.plus6h,
        nearbyWadi: nearestWadi,
        memoryMatch,
        communityCount: nearbyReports.length,
      })

      onPick({
        loading: false,
        lat,
        lng,
        locationName: getShortLocationName(locationName),
        rainfall: weather.rainfall,
        rainfall1h: forecast.plus3h,
        rainfall2h: forecast.plus6h,
        memoryMatch,
        communityCount: nearbyReports.length,
        finalRisk: analysisNow.finalScore,
        risk1h: analysisPlus1.finalScore,
        risk2h: analysisPlus2.finalScore,
      })
    },
  })

  return null
}

// ---------------------------------------------
// COMPONENT: MapScreen
// PURPOSE: Renders the main map, region overlays,
// markers, search, and detail panels
// ---------------------------------------------
export default function MapScreen({ selectedWadi, setSelectedWadi, reports, language }) {
  const [overlayMode, setOverlayMode] = useState('off')
  const [clickedLocation, setClickedLocation] = useState(() => getCachedMapData('last-clicked-location'))
  const [showWadiRiskMarkers, setShowWadiRiskMarkers] = useState(() => readStoredToggle('wadi-guard-show-wadi-risks', false))
  const [showCommunityReportDots, setShowCommunityReportDots] = useState(() => readStoredToggle('wadi-guard-show-community-dots', false))
  const [wadiRisks, setWadiRisks] = useState({})
  const [adm1GeoJson, setAdm1GeoJson] = useState(null)
  const [adm2GeoJson, setAdm2GeoJson] = useState(null)
  const [mapZoom, setMapZoom] = useState(7)
  const [selectedCommunityReport, setSelectedCommunityReport] = useState(null)
  const [searchText, setSearchText] = useState('')
  const [mapTarget, setMapTarget] = useState(null)
  const [searchOpen, setSearchOpen] = useState(false)
  const [layerMenuOpen, setLayerMenuOpen] = useState(false)
  const getMemoryName = (memoryMatch) => (
    language === 'AR' ? memoryMatch?.nameAr || memoryMatch?.name : memoryMatch?.name
  )
  const getReportText = (report, key) => (
    language === 'AR' ? report?.[`${key}Ar`] || report?.[key] : report?.[key]
  )

  const recentReports = useMemo(() => filterReportsWithinDays(reports, 14), [reports])
  const sameDayReports = useMemo(
    () => filterSameDayReports(recentReports),
    [recentReports]
  )

  useEffect(() => {
    let active = true

    Promise.all([
      fetch('/data/oman_regions.geojson').then((response) => response.json()),
      fetch('/data/oman_regions_adm2.geojson').then((response) => response.json()),
    ])
      .then(([adm1, adm2]) => {
        if (!active) return
        cacheMapData('oman-regions-adm1', adm1)
        cacheMapData('oman-regions-adm2', adm2)
        setAdm1GeoJson(adm1)
        setAdm2GeoJson(adm2)
      })
      .catch((error) => {
        console.error('Region GeoJSON load failed:', error)
        if (!active) return
        setAdm1GeoJson(getCachedMapData('oman-regions-adm1'))
        setAdm2GeoJson(getCachedMapData('oman-regions-adm2'))
      })

    return () => {
      active = false
    }
  }, [])

  // Switch to the deeper ADM2 file only when the
  // user zooms in enough for smaller regions.
  const activeRegionGeoJson = mapZoom >= 8.5 && adm2GeoJson?.features?.length
    ? adm2GeoJson
    : adm1GeoJson

  useEffect(() => {
    let active = true

    Promise.all(
      wadis.map(async (wadi) => {
        const weather = await getWeatherData(wadi.lat, wadi.lng)
        const communityCount = countNearbyReports(recentReports, wadi.lat, wadi.lng, 12)
        const memoryMatch = matchHistoricalPattern(weather.rainfall, weather.rainfall * 10)
        const analysis = computeEnvironmentalRisk({
          rainfall: weather.rainfall,
          nearbyWadi: wadi,
          memoryMatch,
          communityCount,
        })

        return [
          wadi.id,
          {
            weather,
            communityCount,
            memoryMatch,
            finalRisk: analysis.finalScore,
            risk: analysis.risk,
            explanation: buildDynamicExplanation({
              language,
              currentRainfall: weather.rainfall,
              laterRainfall: weather.rainfall,
              memoryMatch,
              communityCount,
            }),
          },
        ]
      })
    ).then((entries) => {
      if (active) {
        setWadiRisks(Object.fromEntries(entries))
      }
    })

    return () => {
      active = false
    }
  }, [language, recentReports])

  // Precompute region overlay values once so both
  // coloring and region-click cards read from the
  // same data source.
  const regionMetrics = useMemo(
    () => {
      if (!activeRegionGeoJson?.features?.length) return {}

      return Object.fromEntries(
        activeRegionGeoJson.features.map((feature) => [
          getFeatureRegionName(feature),
          getRegionRiskMetrics(feature, wadiRisks, sameDayReports),
        ])
      )
    },
    [activeRegionGeoJson, sameDayReports, wadiRisks]
  )

  // ---------------------------------------------
  // FUNCTION: runLocationSearch
  // PURPOSE: Resolves the typed location and moves
  // the map viewport to the result
  // ---------------------------------------------
  const runLocationSearch = async () => {
    const found = await geocodeLocation(searchText)
    if (!found) return
    setMapTarget({ ...found, zoom: 11 })
    setSearchOpen(false)
  }

  // ---------------------------------------------
  // FUNCTION: moveToCurrentLocation
  // PURPOSE: Centers the map on the device GPS
  // shortcut used by the floating locate button
  // ---------------------------------------------
  const moveToCurrentLocation = async () => {
    const current = await getCurrentLocation()
    setMapTarget({ ...current, zoom: 12 })
  }

  // Compact timeline rows used by the bottom map
  // card for direct clicks and region selections.
  const clickRiskTimeline = clickedLocation
    ? buildTimeline(language, clickedLocation.finalRisk, clickedLocation.risk1h, clickedLocation.risk2h)
    : []
  const clickRainTimeline = clickedLocation
    ? buildTimeline(language, clickedLocation.rainfall, clickedLocation.rainfall1h, clickedLocation.rainfall2h)
    : []

  useEffect(() => {
    if (typeof window === 'undefined') return
    window.localStorage.setItem('wadi-guard-show-wadi-risks', String(showWadiRiskMarkers))
  }, [showWadiRiskMarkers])

  useEffect(() => {
    if (typeof window === 'undefined') return
    window.localStorage.setItem('wadi-guard-show-community-dots', String(showCommunityReportDots))
  }, [showCommunityReportDots])

  useEffect(() => {
    if (!clickedLocation?.locationName) return
    cacheMapData('last-clicked-location', clickedLocation)
  }, [clickedLocation])

  return (
    <div className="relative h-full w-full">
      <MapContainer center={[22.9, 57.5]} zoom={7} style={{ height: '100%', width: '100%' }} zoomControl={false}>
        <TileLayer url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png" />
        <OmanMapBounds />
        <MapZoomTracker onZoomChange={setMapZoom} />
        <MapViewportControl target={mapTarget} />
        <MapClickAnalysis
          enabled={overlayMode === 'off'}
          onPick={setClickedLocation}
          reports={recentReports}
          language={language}
        />

        <RegionOverlay
          overlayType={overlayMode}
          visible={overlayMode !== 'off'}
          regionGeoJson={activeRegionGeoJson}
          regionMetrics={regionMetrics}
          onRegionSelect={setClickedLocation}
          language={language}
        />

        {showWadiRiskMarkers && wadis.map((wadi) => {
          const live = wadiRisks[wadi.id]
          const risk = live?.risk || getRiskLevel(8)

          return (
            <CircleMarker
              key={wadi.id}
              center={[wadi.lat, wadi.lng]}
              radius={risk.level === 'HIGH' ? 13 : 10}
              fillColor={risk.hex}
              color={risk.hex}
              fillOpacity={0.9}
              weight={2}
              eventHandlers={{ click: () => setSelectedWadi(wadi) }}
            >
              <Popup>
                <div style={{ background: '#0d1f3c', color: 'white', padding: 10, borderRadius: 10, minWidth: 170 }}>
                  <p style={{ fontWeight: 'bold', marginBottom: 6 }}>{wadi.name}</p>
                  <p style={{ fontSize: 12, color: risk.hex }}>
                    {formatRiskWithLevelLocalized(live?.finalRisk ?? 8, language, t)}
                  </p>
                </div>
              </Popup>
            </CircleMarker>
          )
        })}

        {showCommunityReportDots && sameDayReports
          .filter((report) => typeof report.lat === 'number' && typeof report.lng === 'number')
          .map((report) => {
            const risk = getRiskLevel(report.finalRisk || 0)
            return (
              <CircleMarker
                key={report.id}
                center={[report.lat, report.lng]}
                radius={10}
                fillColor={risk.hex}
                color={risk.hex}
                fillOpacity={0.92}
                weight={2}
              >
                <Popup>
                  <div style={{ background: '#0d1f3c', color: 'white', padding: 10, borderRadius: 10, minWidth: 210, border: 'none' }}>
                    <p style={{ fontWeight: 'bold', marginBottom: 6 }}>
                      {getReportText(report, 'shortName') || getShortLocationName(getReportText(report, 'locationName'))}
                    </p>
                    <p style={{ fontSize: 12, color: risk.hex, marginBottom: 6 }}>
                      {formatRiskWithLevelLocalized(report.finalRisk || 0, language, t)}
                    </p>
                    <p style={{ fontSize: 12, color: '#d1d5db', marginBottom: 10 }}>
                      {`${getReportText(report, 'note') || ''}`.slice(0, 70)}{getReportText(report, 'note')?.length > 70 ? '...' : ''}
                    </p>
                    <button
                      type="button"
                      onClick={() => setSelectedCommunityReport(report)}
                      style={{
                        width: '100%',
                        padding: '8px 10px',
                        borderRadius: 10,
                        background: '#00b4d8',
                        color: '#000',
                        fontWeight: 700,
                        border: 'none',
                      }}
                    >
                      {t(language, 'viewDetails')}
                    </button>
                  </div>
                </Popup>
              </CircleMarker>
            )
          })}
      </MapContainer>

      {overlayMode === 'risk' && (
        <div className="absolute top-3 right-3 z-[1000] rounded-[26px] border border-white/70 bg-black/78 px-5 py-3 shadow-[0_12px_28px_rgba(0,0,0,0.3)] backdrop-blur-md">
          <div className="flex items-center gap-6 text-[15px] font-semibold tracking-[0.01em]">
            <span style={{ color: '#ef4444' }}>{t(language, 'highRisk')}</span>
            <span style={{ color: '#f59e0b' }}>{t(language, 'mediumRisk')}</span>
            <span style={{ color: '#22c55e' }}>{t(language, 'lowRisk')}</span>
          </div>
        </div>
      )}

      {searchOpen && (
        <div
          className="absolute right-20 z-[1000] w-[min(280px,calc(100vw-96px))] bg-[#0d1f3c]/95 border border-[#1e3a5f] rounded-2xl p-3 backdrop-blur shadow-xl"
          style={{ bottom: 'calc(env(safe-area-inset-bottom, 0px) + 152px)' }}
        >
          <p className="text-xs text-gray-400 uppercase tracking-wider mb-2">{t(language, 'searchLocation')}</p>
          <input
            value={searchText}
            onChange={(event) => setSearchText(event.target.value)}
            placeholder={t(language, 'searchLocationShort')}
            className="w-full bg-[#081426] text-white rounded-xl px-3 py-3 border border-[#1e3a5f] outline-none placeholder-gray-500"
          />
          <div className="flex gap-2 mt-2">
            <button
              onClick={() => setSearchOpen(false)}
              className="flex-1 py-2.5 rounded-xl border border-[#1e3a5f] text-gray-300 text-sm"
            >
              {t(language, 'cancel')}
            </button>
            <button
              onClick={runLocationSearch}
              className="flex-1 py-2.5 rounded-xl bg-[#00b4d8] text-black font-semibold text-sm"
            >
              {t(language, 'searchLocation')}
            </button>
          </div>
        </div>
      )}

      {layerMenuOpen && (
        <div
          className="absolute right-20 z-[1000] w-52 rounded-2xl border border-[#1e3a5f] bg-[#0d1f3c]/90 p-1.5 backdrop-blur"
          style={{ bottom: 'calc(env(safe-area-inset-bottom, 0px) + 152px)' }}
        >
          <p className="px-3 pt-2 pb-1 text-[10px] uppercase tracking-[0.2em] text-gray-500">{t(language, 'regionOverlay')}</p>
          {[
            { id: 'off', label: t(language, 'off') },
            { id: 'risk', label: t(language, 'riskLayer') },
            { id: 'rain', label: t(language, 'rainLayer') },
          ].map((item) => (
            <button
              key={item.id}
              onClick={() => {
                setOverlayMode(item.id)
                setLayerMenuOpen(false)
              }}
              className="w-full rounded-xl px-3 py-2 text-left text-sm transition-all"
              style={{
                background: overlayMode === item.id ? '#00b4d8' : 'transparent',
                color: overlayMode === item.id ? '#000' : '#d1d5db',
              }}
            >
              {item.label}
            </button>
          ))}
          <div className="mx-2 my-1 h-px bg-[#1e3a5f]" />
          <button
            onClick={() => setShowWadiRiskMarkers((value) => !value)}
            className="flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-sm text-[#d1d5db] transition-all hover:bg-white/5"
          >
            <span>{t(language, 'wadiRisks')}</span>
            <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${showWadiRiskMarkers ? 'bg-[#00b4d8] text-black' : 'bg-[#1e3a5f] text-gray-300'}`}>
              {showWadiRiskMarkers ? t(language, 'on') : t(language, 'off')}
            </span>
          </button>
          <button
            onClick={() => setShowCommunityReportDots((value) => !value)}
            className="flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-sm text-[#d1d5db] transition-all hover:bg-white/5"
          >
            <span>{t(language, 'communityReports')}</span>
            <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${showCommunityReportDots ? 'bg-[#00b4d8] text-black' : 'bg-[#1e3a5f] text-gray-300'}`}>
              {showCommunityReportDots ? t(language, 'on') : t(language, 'off')}
            </span>
          </button>
        </div>
      )}

      <div
        className="absolute right-4 z-[1000] flex flex-col gap-3"
        style={{ bottom: 'calc(env(safe-area-inset-bottom, 0px) + 88px)' }}
      >
        <button
          onClick={() => setSearchOpen((value) => !value)}
          className="relative flex h-12 w-12 items-center justify-center rounded-full bg-[#0d1f3c] border border-[#1e3a5f] text-[0px] text-white backdrop-blur shadow-xl"
          aria-label={t(language, 'searchLocation')}
        >
          <SearchIcon />

        </button>

        <button
          onClick={() => setLayerMenuOpen((value) => !value)}
          className="relative flex h-12 w-12 items-center justify-center rounded-full bg-[#0d1f3c] border border-[#1e3a5f] text-[0px] text-white backdrop-blur shadow-xl"
          aria-label={t(language, 'layers')}
        >
          <LayersIcon />

        </button>

        <button
          onClick={moveToCurrentLocation}
          className="relative flex h-12 w-12 items-center justify-center rounded-full border border-[#d6d6d6] bg-white text-[0px] text-[#1c1c1c] shadow-[0_10px_22px_rgba(0,0,0,0.24)]"
          aria-label={t(language, 'myLocationShort')}
        >
          <LocateIcon />

        </button>
      </div>

      {clickedLocation && (
        <div
          className="absolute left-4 right-4 z-[1000] bg-[#0d1f3c] border border-[#1e3a5f] rounded-2xl p-4 space-y-3"
          style={{ bottom: 'calc(env(safe-area-inset-bottom, 0px) + 88px)' }}
        >
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs text-gray-500 uppercase tracking-wider">{t(language, 'mapClick')}</p>
              <p className="text-sm text-white mt-1">{clickedLocation.locationName}</p>
            </div>
            <button
              onClick={() => setClickedLocation(null)}
              className="w-7 h-7 rounded-full text-gray-300 border border-[#1e3a5f] flex items-center justify-center"
            >
              X
            </button>
          </div>

          {!clickedLocation.loading && (
            <>
              <div className="space-y-1 text-xs text-gray-300">
                <p>{t(language, 'memory')}: {getMemoryName(clickedLocation.memoryMatch) || t(language, 'noMemoryMatch')}</p>
                <p>{t(language, 'community')}: {clickedLocation.communityCount}</p>
                <p style={{ color: getRiskLevel(clickedLocation.finalRisk).hex }}>
                  {t(language, 'risk')}: {formatRiskWithLevelLocalized(clickedLocation.finalRisk, language, t)}
                </p>
              </div>

              <div className="grid grid-cols-3 gap-2">
                <div className="col-span-3">
                  <p className="text-gray-400 text-xs uppercase tracking-wider">{t(language, 'rainfallTimeline')}</p>
                </div>
                {clickRainTimeline.map((item) => (
                  <div key={item.label} className="rounded-xl border border-[#1e3a5f] p-3 text-center bg-[#0a1628]">
                    <p className="text-xs text-gray-500 mb-2">{item.label}</p>
                    <p className="text-sm font-semibold text-[#8ecae6]">{item.value} mm</p>
                  </div>
                ))}
              </div>

              <div className="grid grid-cols-3 gap-2">
                <div className="col-span-3">
                  <p className="text-gray-400 text-xs uppercase tracking-wider">{t(language, 'timeline')}</p>
                </div>
                {clickRiskTimeline.map((item) => {
                  const risk = getRiskLevel(item.value)
                  return (
                    <div key={item.label} className="rounded-xl border border-[#1e3a5f] p-3 text-center bg-[#0a1628]">
                      <p className="text-xs text-gray-500 mb-2">{item.label}</p>
                      <p className="text-sm font-semibold" style={{ color: risk.hex }}>
                        {formatRiskWithLevelLocalized(item.value, language, t)}
                      </p>
                    </div>
                  )
                })}
              </div>
            </>
          )}
        </div>
      )}

      {selectedCommunityReport && (
        <div className="fixed inset-0 z-[1200] bg-black/60 p-4 flex items-center justify-center">
          <div className="w-full max-w-md max-h-[90vh] overflow-y-auto bg-[#0d1f3c] rounded-2xl border border-[#1e3a5f] p-4">
            <div className="flex items-start justify-between mb-3">
              <div>
                <p className="font-bold text-white">
                  {getReportText(selectedCommunityReport, 'shortName') || getShortLocationName(getReportText(selectedCommunityReport, 'locationName'))}
                </p>
                <p className="text-xs text-gray-400 mt-1">
                  {selectedCommunityReport.lat?.toFixed?.(4)}, {selectedCommunityReport.lng?.toFixed?.(4)}
                </p>
              </div>
              <button onClick={() => setSelectedCommunityReport(null)} className="w-8 h-8 rounded-full border border-[#1e3a5f] text-gray-300">
                X
              </button>
            </div>

            {selectedCommunityReport.image && (
              <img src={selectedCommunityReport.image} alt={t(language, 'reportImageAlt')} className="w-full rounded-xl max-h-64 object-cover mb-3" />
            )}

            <div className="h-40 rounded-xl overflow-hidden border border-[#1e3a5f] mb-3">
              <MapContainer center={[selectedCommunityReport.lat, selectedCommunityReport.lng]} zoom={12} style={{ height: '100%', width: '100%' }} zoomControl={false}>
                <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
                <CircleMarker center={[selectedCommunityReport.lat, selectedCommunityReport.lng]} radius={10} pathOptions={{ color: '#00b4d8', fillColor: '#00b4d8', fillOpacity: 0.9 }} />
              </MapContainer>
            </div>

            <p className="text-sm text-gray-300 mb-2">{getReportText(selectedCommunityReport, 'note')}</p>
            <p className="text-sm text-gray-400 mb-2">{getReportText(selectedCommunityReport, 'fullAddress') || getReportText(selectedCommunityReport, 'locationName')}</p>
            <p className="text-sm mb-2" style={{ color: getRiskLevel(selectedCommunityReport.finalRisk || 0).hex }}>
              {t(language, 'aiRisk')}: {formatRiskWithLevelLocalized(selectedCommunityReport.finalRisk || 0, language, t)}
            </p>
            <p className="text-sm text-[#8ecae6]">
              {selectedCommunityReport[`explanation${language === 'AR' ? 'Ar' : 'En'}`] || selectedCommunityReport.explanation}
            </p>
          </div>
        </div>
      )}

      {selectedWadi && (
        <WadiDetailPanel
          wadi={selectedWadi}
          onClose={() => setSelectedWadi(null)}
          reports={recentReports}
          language={language}
        />
      )}
    </div>
  )
}

