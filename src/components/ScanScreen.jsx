import { useRef, useState } from 'react'
import { analyzeImageSignals, generateRiskExplanation, getForecastTimeline, getWeatherData } from '../utils/apiService'
import { countNearbyReportsWithinHours } from '../utils/communityService'
import {
  computeIntelligentRisk,
  formatRiskWithLevelLocalized,
  getRiskLevel,
  matchHistoricalPattern,
} from '../utils/riskEngine'
import { wadis } from '../data/wadis'
import MapPickerModal from './MapPickerModal'
import {
  geocodeLocation,
  getCurrentLocation,
  reverseGeocode,
  validateLocationQuery,
  getShortLocationName,
} from '../utils/locationService'
import { t } from '../utils/i18n'

// ===== SCAN FEATURE =====
// Image-based flood analysis with location, weather, memory, and community context.

const buildTimelineItems = (language, now, plus1, plus2) => [
  { label: t(language, 'now'), value: now },
  { label: t(language, 'plus1h'), value: plus1 },
  { label: t(language, 'plus2h'), value: plus2 },
]

const buildPast24HoursReportLine = (language, communityCount) => {
  if (language === 'AR') {
    if (communityCount <= 0) return 'لا توجد تقارير قريبة خلال آخر 24 ساعة.'
    if (communityCount === 1) return 'يوجد تقرير قريب واحد خلال آخر 24 ساعة.'
    if (communityCount === 2) return 'يوجد تقريران قريبان خلال آخر 24 ساعة.'
    return `يوجد ${communityCount} تقارير قريبة خلال آخر 24 ساعة.`
  }

  if (communityCount <= 0) return 'No nearby reports in the past 24 hours.'
  if (communityCount === 1) return 'There is 1 nearby report in the past 24 hours.'
  return `There are ${communityCount} nearby reports in the past 24 hours.`
}

// ---------------------------------------------
// COMPONENT: ScanScreen
// PURPOSE: Handles image upload, location input,
// voice-triggered analysis, and scan result UI
// ---------------------------------------------
export default function ScanScreen({ language, reports }) {
  const [image, setImage] = useState(null)
  const [base64, setBase64] = useState(null)
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState(null)
  const [listening, setListening] = useState(false)
  const [locationName, setLocationName] = useState('')
  const [selectedLocation, setSelectedLocation] = useState(null)
  const [mapPickerOpen, setMapPickerOpen] = useState(false)
  const [locationError, setLocationError] = useState('')
  const [imageError, setImageError] = useState('')
  const fileRef = useRef(null)
  const recognitionRef = useRef(null)

  // ---------------------------------------------
  // FUNCTION: handleImage
  // PURPOSE: Reads the uploaded image as a preview
  // and base64 payload for analysis APIs
  // ---------------------------------------------
  const handleImage = (event) => {
    const file = event.target.files?.[0]
    if (!file) return

    const reader = new FileReader()
    reader.onload = (loadEvent) => {
      const fullImage = loadEvent.target?.result
      setImage(fullImage)
      setBase64(fullImage?.split(',')[1] || null)
      setImageError('')
    }
    reader.readAsDataURL(file)
  }

  // ---------------------------------------------
  // FUNCTION: analyze
  // PURPOSE: Runs the full scan pipeline using
  // image, weather, forecast, memory, and reports
  // ---------------------------------------------
  const analyze = async () => {
    if (!base64) {
      setImageError(t(language, 'uploadPhotoRequired'))
      return
    }

    setLoading(true)
    setResult(null)
    setImageError('')

    try {
      const coords = selectedLocation || (await getCurrentLocation())
      const fullLocationName = coords.name || (await reverseGeocode(coords.lat, coords.lng))
      const readableName = getShortLocationName(fullLocationName)

      const nearestWadi = wadis.reduce((prev, curr) => {
        const prevDistance = Math.abs(prev.lat - coords.lat) + Math.abs(prev.lng - coords.lng)
        const currentDistance = Math.abs(curr.lat - coords.lat) + Math.abs(curr.lng - coords.lng)
        return currentDistance < prevDistance ? curr : prev
      })

      const [imageSignals, weatherData, forecast] = await Promise.all([
        analyzeImageSignals(base64),
        getWeatherData(coords.lat, coords.lng),
        getForecastTimeline(coords.lat, coords.lng),
      ])

      // Nearby reports add real local context to the scan result.
      const communityCount = countNearbyReportsWithinHours(reports, coords.lat, coords.lng, 10, 24)
      const memoryMatch = matchHistoricalPattern(weatherData.rainfall, imageSignals.score)

      const nowAnalysis = computeIntelligentRisk({
        visionLabels: imageSignals.labels,
        rainfall: weatherData.rainfall,
        nearbyWadi: nearestWadi,
        memoryMatch,
        imagePresent: true,
        communityCount,
        requireWeatherOrMemoryForMedium: true,
      })
      const plus1Analysis = computeIntelligentRisk({
        visionLabels: imageSignals.labels,
        rainfall: forecast.plus3h,
        nearbyWadi: nearestWadi,
        memoryMatch,
        imagePresent: true,
        communityCount,
        requireWeatherOrMemoryForMedium: true,
      })
      const plus2Analysis = computeIntelligentRisk({
        visionLabels: imageSignals.labels,
        rainfall: forecast.plus6h,
        nearbyWadi: nearestWadi,
        memoryMatch,
        imagePresent: true,
        communityCount,
        requireWeatherOrMemoryForMedium: true,
      })

      const nowRisk = nowAnalysis.finalScore
      const riskAfter1Hour = plus1Analysis.finalScore
      const riskAfter2Hours = plus2Analysis.finalScore
      const finalScore = Math.max(nowRisk, riskAfter1Hour, riskAfter2Hours)

      const explanationBase = await generateRiskExplanation({
        language,
        shortLocationName: readableName,
        visionLabels: imageSignals.labels,
        rainfall: weatherData.rainfall,
        rainfall1h: forecast.plus3h,
        rainfall2h: forecast.plus6h,
        memoryName: memoryMatch?.name || '',
        communityCount,
        riskScore: finalScore,
      })
      const explanation = `${explanationBase} ${buildPast24HoursReportLine(language, communityCount)}`.trim()

      setResult({
        readableName,
        fullLocationName,
        nearestWadi,
        weatherData,
        forecast,
        imageScore: imageSignals.score,
        visionLabels: imageSignals.labels,
        memoryMatch,
        communityCount,
        nowRisk,
        riskAfter1Hour,
        riskAfter2Hours,
        finalScore,
        finalRisk: getRiskLevel(finalScore),
        explanation,
      })
    } finally {
      setLoading(false)
    }
  }

  // ---------------------------------------------
  // FUNCTION: toggleVoice
  // PURPOSE: Starts or stops speech recognition
  // for quick scan triggering
  // ---------------------------------------------
  const toggleVoice = () => {
    if (recognitionRef.current && listening) {
      recognitionRef.current.stop()
      return
    }

    const SR = window.SpeechRecognition || window.webkitSpeechRecognition
    if (!SR) return

    const recognition = new SR()
    recognitionRef.current = recognition
    recognition.lang = language === 'AR' ? 'ar-SA' : 'en-US'
    recognition.onstart = () => setListening(true)
    recognition.onend = () => {
      setListening(false)
      recognitionRef.current = null
    }
    recognition.onresult = () => analyze()
    recognition.start()
  }

  // ---------------------------------------------
  // FUNCTION: useGpsLocation
  // PURPOSE: Uses the device location for scan
  // analysis
  // ---------------------------------------------
  const useGpsLocation = async () => {
    const current = await getCurrentLocation()
    setSelectedLocation(current)
    setLocationName(current.name)
    setLocationError('')
  }

  // ---------------------------------------------
  // FUNCTION: searchSelectedLocation
  // PURPOSE: Resolves the typed Oman location into
  // exact coordinates for scan analysis
  // ---------------------------------------------
  const searchSelectedLocation = async () => {
    if (!validateLocationQuery(locationName)) {
      setLocationError(t(language, 'specificLocationError'))
      return
    }

    const location = await geocodeLocation(locationName)
    if (!location) {
      setLocationError(t(language, 'locationNotFound'))
      return
    }

    setSelectedLocation(location)
    setLocationName(location.name)
    setLocationError('')
  }

  // ---------------------------------------------
  // BLOCK: Timeline rows
  // PURPOSE: Standardizes the shared NOW / +1H /
  // +2H visual layout used in the scan result
  // ---------------------------------------------
  const riskRows = result
    ? buildTimelineItems(language, result.nowRisk, result.riskAfter1Hour, result.riskAfter2Hours)
    : []
  const rainRows = result
    ? buildTimelineItems(language, result.weatherData.rainfall, result.forecast.plus3h, result.forecast.plus6h)
    : []

  return (
    <div className="h-full overflow-y-auto">
      <div className="p-4 space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:justify-between sm:items-center">
          <h2 className="text-xl font-bold text-[#00b4d8]">{t(language, 'scanWadi')}</h2>
          <button
            onClick={toggleVoice}
            className={`w-full sm:w-auto px-4 py-2 rounded-xl text-sm font-bold border transition-all ${
              listening
                ? 'border-[#00b4d8] text-[#00b4d8] bg-[#00b4d8] bg-opacity-10 animate-pulse'
                : 'border-[#1e3a5f] text-gray-400 hover:border-[#00b4d8] hover:text-[#00b4d8]'
            }`}
          >
            {listening
              ? `${t(language, 'listening')} • ${t(language, 'pressToStop')}`
              : `${t(language, 'voiceInput')} ${t(language, 'voiceReady')}`}
          </button>
        </div>

        <div className="bg-[#0d1f3c] rounded-2xl p-4 border border-[#1e3a5f]">
          <p className="text-sm font-bold text-white mb-3">{t(language, 'locationForScan')}</p>
          <div className="grid grid-cols-1 gap-2 mb-3 sm:grid-cols-[minmax(0,1fr)_auto]">
            <input
              value={locationName}
              onChange={(event) => setLocationName(event.target.value)}
              placeholder={t(language, 'searchLocationInOman')}
              className="min-w-0 bg-[#1e3a5f] text-white rounded-xl p-3 border border-[#2a4a7f] outline-none placeholder-gray-500"
            />
            <button
              onClick={searchSelectedLocation}
              className="w-full sm:w-auto px-4 py-3 rounded-xl bg-[#1e3a5f] text-[#00b4d8] font-semibold border border-[#2a4a7f]"
            >
              {t(language, 'searchLocation')}
            </button>
          </div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <button onClick={useGpsLocation} className="flex-1 py-3 rounded-xl border border-[#1e3a5f] text-white">
              {t(language, 'useMyLocation')}
            </button>
            <button onClick={() => setMapPickerOpen(true)} className="flex-1 py-3 rounded-xl border border-[#1e3a5f] text-white">
              {t(language, 'selectOnMap')}
            </button>
          </div>
          {locationError && <p className="text-xs text-[#ef233c] mt-3">{locationError}</p>}
          <p className="text-xs text-gray-400 mt-3">
            {selectedLocation
              ? `${selectedLocation.name} (${selectedLocation.lat.toFixed(4)}, ${selectedLocation.lng.toFixed(4)})`
              : t(language, 'noExactCoordinates')}
          </p>
        </div>

        <div
          onClick={() => fileRef.current?.click()}
          className="border-2 border-dashed border-[#1e3a5f] rounded-2xl p-6 text-center cursor-pointer hover:border-[#00b4d8] transition-all active:scale-98"
        >
          {image ? (
            <img src={image} alt="wadi" className="max-h-52 mx-auto rounded-xl object-cover w-full" />
          ) : (
            <div className="py-4">
              <div className="text-5xl mb-3">📷</div>
              <p className="text-gray-300 font-medium">{t(language, 'uploadPhotoRequired')}</p>
            </div>
          )}
        </div>

        <input ref={fileRef} type="file" accept="image/*" onChange={handleImage} className="hidden" />
        {imageError && <p className="text-xs text-[#ef233c] -mt-2">{imageError}</p>}

        <button
          onClick={analyze}
          disabled={!base64 || loading}
          className="w-full py-4 rounded-2xl font-bold text-lg transition-all active:scale-95"
          style={{
            background: base64 && !loading ? '#00b4d8' : '#1e3a5f',
            color: base64 && !loading ? '#000' : '#4a6a8a',
          }}
        >
          {loading ? t(language, 'analyzing') : t(language, 'analyzeNow')}
        </button>

        {loading && (
          <div className="text-center py-6 bg-[#0d1f3c] rounded-2xl border border-[#1e3a5f]">
            <div className="text-2xl mb-3">{t(language, 'working')}</div>
          </div>
        )}

        {result && (
          <div className="space-y-3">
            <div className="bg-[#0d1f3c] rounded-2xl p-4 border border-[#1e3a5f]">
              <div className="flex justify-between items-center mb-3">
                <div>
                  <p className="text-gray-400 text-xs uppercase tracking-wider">{t(language, 'risk')}</p>
                  <p className="text-2xl font-bold mt-0.5" style={{ color: result.finalRisk.hex }}>
                    {result.finalRisk.emoji} {formatRiskWithLevelLocalized(result.finalScore, language, t)}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-white text-sm font-medium">📍 {result.readableName}</p>
                  <p className="text-gray-500 text-xs mt-1">{result.nearestWadi.name}</p>
                </div>
              </div>
              <div className="w-full bg-[#1e3a5f] rounded-full h-4">
                <div className="h-4 rounded-full transition-all duration-1000" style={{ width: `${result.finalScore}%`, background: result.finalRisk.hex }} />
              </div>
            </div>

            <div className="bg-[#0d1f3c] rounded-2xl p-4 border border-[#1e3a5f] space-y-4">
              <div>
                <p className="text-gray-400 text-xs uppercase tracking-wider mb-3">{t(language, 'rainfallTimeline')}</p>
                <div className="grid grid-cols-3 gap-2">
                  {rainRows.map((item) => (
                    <div key={item.label} className="rounded-xl border border-[#1e3a5f] p-3 text-center bg-[#0a1628]">
                      <p className="text-xs text-gray-500 mb-2">{item.label}</p>
                      <p className="text-sm font-semibold text-[#8ecae6]">{item.value} mm</p>
                    </div>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <div className="rounded-xl border border-[#1e3a5f] p-3 bg-[#0a1628]">
                  <p className="text-xs text-gray-500 mb-1">{t(language, 'memory')}</p>
                  <p className="text-sm text-gray-200">
                    {(language === 'AR' ? result.memoryMatch?.nameAr || result.memoryMatch?.name : result.memoryMatch?.name) || t(language, 'noMemoryMatch')}
                  </p>
                </div>
                <div className="rounded-xl border border-[#1e3a5f] p-3 bg-[#0a1628]">
                  <p className="text-xs text-gray-500 mb-1">{t(language, 'community')}</p>
                  <p className="text-sm text-gray-200">{result.communityCount} {t(language, 'communityNearbyCount')}</p>
                </div>
              </div>
            </div>

            <div className="bg-[#0d1f3c] rounded-2xl p-4 border border-[#1e3a5f]">
              <p className="text-gray-400 text-xs uppercase tracking-wider mb-3">{t(language, 'timeline')}</p>
              <div className="grid grid-cols-3 gap-2">
                {riskRows.map((item) => {
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
            </div>

            <div className="bg-[#0d1f3c] rounded-2xl p-4 border border-[#1e3a5f]">
              <p className="text-[#00b4d8] text-xs font-bold uppercase tracking-wider mb-2">{t(language, 'explanation')}</p>
              <p className="text-gray-200 text-sm leading-relaxed whitespace-pre-line">{result.explanation}</p>
            </div>
          </div>
        )}
      </div>

      <MapPickerModal
        open={mapPickerOpen}
        title={t(language, 'pickScanLocation')}
        onClose={() => setMapPickerOpen(false)}
        language={language}
        onConfirm={(location) => {
          setSelectedLocation(location)
          setLocationName(location.name)
          setLocationError('')
          setMapPickerOpen(false)
        }}
      />
    </div>
  )
}
