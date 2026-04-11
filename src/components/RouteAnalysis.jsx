import { useState } from 'react'
import { CircleMarker, MapContainer, Polyline, TileLayer } from 'react-leaflet'
import 'leaflet/dist/leaflet.css'
import { analyzeRoute } from '../utils/routeService'
import { getCurrentLocation, validateLocationQuery } from '../utils/locationService'
import { formatRiskWithLevelLocalized, getRiskLevel } from '../utils/riskEngine'
import { t } from '../utils/i18n'
import MapPickerModal from './MapPickerModal'

// ===== ROUTE ANALYSIS =====
// Route planning screen with live forecast and community-aware route scoring.

// ---------------------------------------------
// FUNCTION: buildTimelineItems
// PURPOSE: Creates shared route risk timeline
// tiles for the summary cards
// ---------------------------------------------
const buildTimelineItems = (language, routeAnalysis) => [
  { label: t(language, 'now'), value: routeAnalysis.currentRisk },
  { label: t(language, 'plus1h'), value: routeAnalysis.riskAfter1Hour },
  { label: t(language, 'plus2h'), value: routeAnalysis.riskAfter2Hours },
]

// ---------------------------------------------
// FUNCTION: getRouteStroke
// PURPOSE: Picks the polyline color for route
// map rendering and safer-route highlights
// ---------------------------------------------
const getRouteStroke = (routeAnalysis, fallback = '#00b4d8') => {
  if (!routeAnalysis) return fallback
  if (routeAnalysis.kind === 'safe') return '#06d6a0'
  if (routeAnalysis.overallRiskScore >= 71) return '#ef233c'
  if (routeAnalysis.overallRiskScore >= 31) return '#f77f00'
  return '#06d6a0'
}

// ---------------------------------------------
// COMPONENT: RouteSummaryCard
// PURPOSE: Renders the compact per-route summary
// with risk, rain, and explanation
// ---------------------------------------------
const RouteSummaryCard = ({ language, routeAnalysis, title }) => {
  const riskTimeline = buildTimelineItems(language, routeAnalysis)
  const rainTimeline = [
    { label: t(language, 'now'), value: routeAnalysis.rainfallTrend.now },
    { label: t(language, 'plus1h'), value: routeAnalysis.rainfallTrend.plus3h },
    { label: t(language, 'plus2h'), value: routeAnalysis.rainfallTrend.plus6h },
  ]
  const routeColor = getRouteStroke(routeAnalysis)

  return (
    <div className="bg-[#0d1f3c] rounded-2xl p-4 border border-[#1e3a5f] space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.24em]" style={{ color: routeColor }}>
            {title}
          </p>
          <p className="text-white mt-2">{routeAnalysis.start.name} → {routeAnalysis.destination.name}</p>
        </div>
        <div className="text-right">
          <p className="text-xs text-gray-400 uppercase tracking-wider">{t(language, 'finalRisk')}</p>
          <p className="font-bold" style={{ color: routeAnalysis.riskLevel.hex }}>
            {formatRiskWithLevelLocalized(routeAnalysis.overallRiskScore, language, t)}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2">
        {riskTimeline.map((item) => {
          const risk = getRiskLevel(item.value)
          return (
            <div key={`${title}-${item.label}`} className="rounded-xl border border-[#1e3a5f] p-3 text-center bg-[#0a1628]">
              <p className="text-xs text-gray-500 mb-2">{item.label}</p>
              <p className="text-sm font-semibold" style={{ color: risk.hex }}>
                {formatRiskWithLevelLocalized(item.value, language, t)}
              </p>
            </div>
          )
        })}
      </div>

      <div className="grid grid-cols-3 gap-2">
        {rainTimeline.map((item) => (
          <div key={`${title}-rain-${item.label}`} className="rounded-xl border border-[#1e3a5f] p-3 text-center bg-[#0a1628]">
            <p className="text-xs text-gray-500 mb-2">{item.label}</p>
            <p className="text-sm font-semibold text-[#8ecae6]">{item.value} mm</p>
          </div>
        ))}
      </div>

      <div className="flex items-center justify-between gap-3 text-sm">
        <p className="text-gray-300">
          {t(language, 'communityAlertsOnRoute')}: {routeAnalysis.totalCommunityReportsAlongRoute} {t(language, 'reportsDetected')}
        </p>
        <p className="text-gray-400">
          {t(language, 'maxRainfall')}: {routeAnalysis.maxRainfall} mm
        </p>
      </div>

      <div>
        <p className="text-[#00b4d8] text-xs font-bold uppercase tracking-wider mb-2">{t(language, 'explanation')}</p>
        <p className="text-sm text-gray-200 leading-relaxed">{routeAnalysis.explanation}</p>
      </div>
    </div>
  )
}

// ---------------------------------------------
// COMPONENT: RouteAnalysis
// PURPOSE: Handles the route form, route analysis,
// and route result display
// ---------------------------------------------
export default function RouteAnalysis({ language, reports }) {
  const [startText, setStartText] = useState('')
  const [destinationText, setDestinationText] = useState('')
  const [startLocation, setStartLocation] = useState(null)
  const [destinationLocation, setDestinationLocation] = useState(null)
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState(null)
  const [error, setError] = useState('')
  const [pickerTarget, setPickerTarget] = useState(null)

  const analyzeSelectedRoute = async () => {
    setError('')

    if (!startLocation && !validateLocationQuery(startText)) {
      setError(t(language, 'specificLocationError'))
      return
    }

    if (!destinationLocation && !validateLocationQuery(destinationText)) {
      setError(t(language, 'specificLocationError'))
      return
    }

    setLoading(true)
    try {
      const analysis = await analyzeRoute({
        startText,
        destinationText,
        startLocation,
        destinationLocation,
        reports,
        language,
        t,
      })
      setResult(analysis)
      setStartText(analysis.start.name)
      setDestinationText(analysis.destination.name)
    } catch (analysisError) {
      console.error(analysisError)
      setError(t(language, 'routeAnalysisFailed'))
    } finally {
      setLoading(false)
    }
  }

  const useGpsForStart = async () => {
    const current = await getCurrentLocation()
    setStartLocation(current)
    setStartText(current.name)
    setError('')
  }

  const useGpsForDestination = async () => {
    const current = await getCurrentLocation()
    setDestinationLocation(current)
    setDestinationText(current.name)
    setError('')
  }

  const primaryRouteLine = result?.primaryRoute?.route?.coordinates?.map(([lng, lat]) => [lat, lng]) || []
  const saferRouteLine = result?.saferRoute?.route?.coordinates?.map(([lng, lat]) => [lat, lng]) || []
  const mapCenter = saferRouteLine[0] || primaryRouteLine[0] || [23.588, 58.3829]
  const startPoint = primaryRouteLine[0] || saferRouteLine[0]
  const endPoint = primaryRouteLine[primaryRouteLine.length - 1] || saferRouteLine[saferRouteLine.length - 1]

  return (
    <div className="h-full overflow-y-auto">
      <div className="p-4 space-y-4">
        <div className="bg-[#0d1f3c] rounded-2xl p-4 border border-[#1e3a5f]">
          <h2 className="text-xl font-bold text-[#00b4d8] mb-4">{t(language, 'routeAnalysis')}</h2>

          <div className="space-y-3">
            <div className="space-y-2">
              <input
                value={startText}
                onChange={(event) => {
                  setStartText(event.target.value)
                  setStartLocation(null)
                }}
                placeholder={t(language, 'from')}
                className="w-full bg-[#1e3a5f] text-white rounded-xl p-3 border border-[#2a4a7f] outline-none placeholder-gray-500"
              />
              <div className="grid grid-cols-2 gap-2">
                <button onClick={useGpsForStart} className="w-full px-3 py-3 rounded-xl border border-[#1e3a5f] text-white text-sm whitespace-nowrap">
                  {t(language, 'useMyLocation')}
                </button>
                <button onClick={() => setPickerTarget('start')} className="w-full px-3 py-3 rounded-xl border border-[#1e3a5f] text-white text-sm whitespace-nowrap">
                  {t(language, 'selectOnMap')}
                </button>
              </div>
            </div>

            <div className="space-y-2">
              <input
                value={destinationText}
                onChange={(event) => {
                  setDestinationText(event.target.value)
                  setDestinationLocation(null)
                }}
                placeholder={t(language, 'to')}
                className="w-full bg-[#1e3a5f] text-white rounded-xl p-3 border border-[#2a4a7f] outline-none placeholder-gray-500"
              />
              <div className="grid grid-cols-2 gap-2">
                <button onClick={useGpsForDestination} className="w-full px-3 py-3 rounded-xl border border-[#1e3a5f] text-white text-sm whitespace-nowrap">
                  {t(language, 'useMyLocation')}
                </button>
                <button onClick={() => setPickerTarget('destination')} className="w-full px-3 py-3 rounded-xl border border-[#1e3a5f] text-white text-sm whitespace-nowrap">
                  {t(language, 'selectOnMap')}
                </button>
              </div>
            </div>

            <button
              onClick={analyzeSelectedRoute}
              disabled={loading}
              className="w-full py-4 rounded-2xl font-bold text-lg"
              style={{
                background: loading ? '#1e3a5f' : '#00b4d8',
                color: loading ? '#4a6a8a' : '#000',
              }}
            >
              {loading ? t(language, 'analyzing') : t(language, 'analyzeRoute')}
            </button>
          </div>

          <p className="text-xs text-gray-400 mt-3">{t(language, 'startGeocodedHint')}</p>
          {error && <p className="text-xs text-[#ef233c] mt-3">{error}</p>}
        </div>

        {(primaryRouteLine.length > 1 || saferRouteLine.length > 1) && (
          <div className="h-[280px] rounded-2xl overflow-hidden border border-[#1e3a5f]">
            <MapContainer center={mapCenter} zoom={8} style={{ height: '100%', width: '100%' }}>
              <TileLayer url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png" />
              {primaryRouteLine.length > 1 && (
                <Polyline positions={primaryRouteLine} pathOptions={{ color: getRouteStroke(result?.primaryRoute), weight: 6 }} />
              )}
              {saferRouteLine.length > 1 && (
                <Polyline positions={saferRouteLine} pathOptions={{ color: getRouteStroke(result?.saferRoute), weight: 5, dashArray: '10 8' }} />
              )}
              {startPoint && (
                <CircleMarker
                  center={startPoint}
                  radius={9}
                  pathOptions={{ color: '#ffffff', fillColor: '#ef233c', fillOpacity: 0.95 }}
                />
              )}
              {endPoint && (
                <CircleMarker
                  center={endPoint}
                  radius={9}
                  pathOptions={{ color: '#ffffff', fillColor: '#06d6a0', fillOpacity: 0.95 }}
                />
              )}
            </MapContainer>
          </div>
        )}

        {result ? (
          <>
            <div className="bg-[#0d1f3c] rounded-2xl p-4 border border-[#1e3a5f] space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-white">{t(language, 'routeFromTo')}: {result.start.name} → {result.destination.name}</p>
                  <p className="text-gray-300 mt-1">
                    {t(language, 'overallRisk')}: <span style={{ color: result.riskLevel.hex }}>{formatRiskWithLevelLocalized(result.overallRiskScore, language, t)}</span>
                  </p>
                </div>
                <span
                  className="text-xs font-bold px-3 py-2 rounded-full border"
                  style={{ color: result.riskLevel.hex, borderColor: result.riskLevel.hex }}
                >
                  {t(language, 'routeStatus')}
                </span>
              </div>
              <p className="text-sm leading-relaxed text-[#f8f9fa]">{result.message}</p>
              {result.saferRoute?.mapsUrl && (
                <button
                  onClick={() => window.open(result.saferRoute.mapsUrl, '_blank', 'noopener,noreferrer')}
                  className="w-full py-3 rounded-2xl font-semibold text-black bg-[#06d6a0]"
                >
                  {t(language, 'viewSaferRoute')}
                </button>
              )}
            </div>

            <RouteSummaryCard
              language={language}
              routeAnalysis={result.primaryRoute}
              title={result.primaryRoute.label === 'Risky Route' ? t(language, 'riskyRoute') : t(language, 'primaryRoute')}
            />

            {result.saferRoute && (
              <RouteSummaryCard
                language={language}
                routeAnalysis={result.saferRoute}
                title={t(language, 'saferRoute')}
              />
            )}
          </>
        ) : (
          <div className="bg-[#0d1f3c] rounded-2xl p-4 border border-[#1e3a5f] text-sm text-gray-400">
            {t(language, 'noRouteData')}
          </div>
        )}
      </div>

      <MapPickerModal
        open={Boolean(pickerTarget)}
        title={pickerTarget === 'destination' ? t(language, 'to') : t(language, 'from')}
        onClose={() => setPickerTarget(null)}
        language={language}
        onConfirm={(location) => {
          if (pickerTarget === 'destination') {
            setDestinationLocation(location)
            setDestinationText(location.name)
          } else {
            setStartLocation(location)
            setStartText(location.name)
          }
          setPickerTarget(null)
          setError('')
        }}
      />
    </div>
  )
}
