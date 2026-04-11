import { useState } from 'react'
import { CircleMarker, MapContainer, TileLayer } from 'react-leaflet'
import 'leaflet/dist/leaflet.css'
import MapPickerModal from './MapPickerModal'
import { geocodeLocation, getCurrentLocation, getShortLocationName, validateLocationQuery } from '../utils/locationService'
import { t } from '../utils/i18n'
import { analyzeImageSignals, generateRiskExplanation, getWeatherData } from '../utils/apiService'
import { computeIntelligentRisk, formatRiskWithLevelLocalized, getRiskLevel, matchHistoricalPattern } from '../utils/riskEngine'
import { filterReportsWithinDays, toTimestamp } from '../utils/communityService'

// ===== COMMUNITY REPORTS =====
// Report submission, filtering, and community report detail viewing.

// ---------------------------------------------
// COMPONENT: CommunityScreen
// PURPOSE: Lets users submit reports, review
// recent reports, and inspect report details
// ---------------------------------------------
export default function CommunityScreen({ reports, onAddReport, language }) {
  const [showForm, setShowForm] = useState(false)
  const [note, setNote] = useState('')
  const [image, setImage] = useState(null)
  const [base64, setBase64] = useState(null)
  const [submitting, setSubmitting] = useState(false)
  const [locationName, setLocationName] = useState('')
  const [selectedLocation, setSelectedLocation] = useState(null)
  const [mapPickerOpen, setMapPickerOpen] = useState(false)
  const [locationError, setLocationError] = useState('')
  const [imageError, setImageError] = useState('')
  const [filterText, setFilterText] = useState('')
  const [filterDate, setFilterDate] = useState('')
  const [selectedReport, setSelectedReport] = useState(null)

  // ---------------------------------------------
  // FUNCTION: summarizeNote
  // PURPOSE: Keeps report cards compact without
  // losing the most useful note preview
  // ---------------------------------------------
  const summarizeNote = (text = '') => (text.length > 90 ? `${text.slice(0, 90)}...` : text)

  // ---------------------------------------------
  // FUNCTION: getReportText
  // PURPOSE: Reads Arabic report fields first and
  // falls back gracefully to the base value
  // ---------------------------------------------
  const getReportText = (report, key) => (
    language === 'AR' ? report?.[`${key}Ar`] || report?.[key] : report?.[key]
  )

  // ---------------------------------------------
  // FUNCTION: handleImage
  // PURPOSE: Reads the required community report
  // photo before analysis and save
  // ---------------------------------------------
  const handleImage = (event) => {
    const file = event.target.files[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (loadEvent) => {
      setImage(loadEvent.target.result)
      setBase64(loadEvent.target.result.split(',')[1] || null)
      setImageError('')
    }
    reader.readAsDataURL(file)
  }

  // ---------------------------------------------
  // FUNCTION: submitReport
  // PURPOSE: Builds a report from image, note,
  // weather, and memory before saving
  // ---------------------------------------------
  const submitReport = async () => {
    if (!base64) {
      setImageError(t(language, 'uploadPhotoRequired'))
      return
    }

    if (!selectedLocation && !validateLocationQuery(locationName)) {
      setLocationError(t(language, 'specificLocationError'))
      return
    }

    setSubmitting(true)
    const finalLocation = selectedLocation || (await geocodeLocation(locationName))

    if (!finalLocation) {
      setLocationError(t(language, 'locationNotFound'))
      setSubmitting(false)
      return
    }

    const [imageSignals, weatherData] = await Promise.all([
      analyzeImageSignals(base64),
      getWeatherData(finalLocation.lat, finalLocation.lng),
    ])

    const memoryMatch = matchHistoricalPattern(weatherData.rainfall, imageSignals.score)
    const riskResult = computeIntelligentRisk({
      visionLabels: imageSignals.labels,
      description: note,
      rainfall: weatherData.rainfall,
      nearbyWadi: finalLocation,
      memoryMatch,
      imagePresent: true,
    })

    const shortName = getShortLocationName(finalLocation.name)
    const explanationEn = await generateRiskExplanation({
      language: 'EN',
      shortLocationName: shortName,
      visionLabels: imageSignals.labels,
      description: note,
      rainfall: weatherData.rainfall,
      memoryName: memoryMatch?.name,
      riskScore: riskResult.finalScore,
    })
    const explanationAr = await generateRiskExplanation({
      language: 'AR',
      shortLocationName: shortName,
      visionLabels: imageSignals.labels,
      description: note,
      rainfall: weatherData.rainfall,
      memoryName: memoryMatch?.name,
      riskScore: riskResult.finalScore,
    })

    await onAddReport({
      lat: finalLocation.lat,
      lng: finalLocation.lng,
      note: note || t(language, 'fieldReportSubmitted'),
      image,
      imageScore: imageSignals.score,
      finalRisk: riskResult.finalScore,
      riskLevel: riskResult.risk.level,
      riskLabel: riskResult.risk.level,
      explanation: language === 'AR' ? explanationAr : explanationEn,
      explanationEn,
      explanationAr,
      locationName: finalLocation.name,
      shortName,
      fullAddress: finalLocation.name,
    })

    setShowForm(false)
    setNote('')
    setImage(null)
    setBase64(null)
    setLocationName('')
    setSelectedLocation(null)
    setLocationError('')
    setImageError('')
    setSubmitting(false)
  }

  // ---------------------------------------------
  // BLOCK: visibleReports
  // PURPOSE: Applies the 14-day retention plus
  // simple location/date filtering for the list
  // ---------------------------------------------
  const visibleReports = filterReportsWithinDays(reports, 14).filter((report) => {
    const searchTarget = `${report.shortName || ''} ${report.locationName || ''}`.toLowerCase()
    const matchesLocation = !filterText || searchTarget.includes(filterText.toLowerCase())
    const reportDate = toTimestamp(report.createdAt)
    const matchesDate = !filterDate || (reportDate && new Date(reportDate).toISOString().slice(0, 10) === filterDate)
    return matchesLocation && matchesDate
  })

  // ---------------------------------------------
  // FUNCTION: useGps
  // PURPOSE: Uses the current device location for
  // report submission
  // ---------------------------------------------
  const useGps = async () => {
    const current = await getCurrentLocation()
    setSelectedLocation(current)
    setLocationName(current.name)
    setLocationError('')
  }

  // ---------------------------------------------
  // FUNCTION: searchLocation
  // PURPOSE: Resolves the typed Oman location into
  // coordinates for report submission
  // ---------------------------------------------
  const searchLocation = async () => {
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

  return (
    <div className="h-full overflow-y-auto">
      <div className="p-4 space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:justify-between sm:items-center">
          <h2 className="text-xl font-bold text-[#00b4d8]">{t(language, 'communityReports')}</h2>
          <button
            onClick={() => setShowForm((formOpen) => !formOpen)}
            className="w-full sm:w-auto px-4 py-2 bg-[#00b4d8] text-black rounded-xl font-bold text-sm active:scale-95 transition-all"
          >
            + {t(language, 'submitReport')}
          </button>
        </div>

        {showForm && (
          <div className="bg-[#0d1f3c] rounded-2xl p-4 border border-[#1e3a5f]">
            <div className="grid grid-cols-1 gap-2 mb-3 sm:grid-cols-[minmax(0,1fr)_auto]">
              <input
                value={locationName}
                onChange={(event) => setLocationName(event.target.value)}
                placeholder={t(language, 'searchLocation')}
                className="min-w-0 bg-[#1e3a5f] text-white rounded-xl p-3 border border-[#2a4a7f] outline-none placeholder-gray-500"
              />
              <button onClick={searchLocation} className="w-full sm:w-auto px-4 py-3 rounded-xl bg-[#1e3a5f] text-[#00b4d8] font-semibold border border-[#2a4a7f]">
                {t(language, 'searchLocation')}
              </button>
            </div>

            <div className="grid grid-cols-1 gap-2 mb-3 sm:grid-cols-2">
              <button onClick={useGps} className="flex-1 py-3 rounded-xl border border-[#1e3a5f] text-white">
                {t(language, 'useMyLocation')}
              </button>
              <button onClick={() => setMapPickerOpen(true)} className="flex-1 py-3 rounded-xl border border-[#1e3a5f] text-white">
                {t(language, 'selectOnMap')}
              </button>
            </div>

            {locationError && <p className="text-xs text-[#ef233c] mb-3">{locationError}</p>}

            <p className="text-xs text-gray-400 mb-3">
              {selectedLocation
                ? `${selectedLocation.name} (${selectedLocation.lat.toFixed(4)}, ${selectedLocation.lng.toFixed(4)})`
                : t(language, 'noExactCoordinates')}
            </p>

            <label className="block w-full bg-[#1e3a5f] text-gray-400 rounded-xl p-3 mb-3 border border-dashed border-[#2a4a7f] text-center cursor-pointer hover:border-[#00b4d8] transition-all">
              {image ? (
                <img src={image} alt={t(language, 'reportPreviewAlt')} className="max-h-32 mx-auto rounded-xl object-cover" />
              ) : (
                <span>{t(language, 'uploadPhotoRequired')}</span>
              )}
              <input type="file" accept="image/*" onChange={handleImage} className="hidden" />
            </label>
            {imageError && <p className="text-xs text-[#ef233c] mb-3">{imageError}</p>}

            <textarea
              value={note}
              onChange={(event) => setNote(event.target.value)}
              placeholder={t(language, 'notePlaceholder')}
              className="w-full bg-[#1e3a5f] text-white rounded-xl p-3 mb-3 border border-[#2a4a7f] resize-none outline-none placeholder-gray-600"
              rows={3}
            />

            <button
              onClick={submitReport}
              disabled={submitting}
              className="w-full py-3 font-bold rounded-xl transition-all active:scale-95"
              style={{ background: submitting ? '#1e3a5f' : '#00b4d8', color: submitting ? '#4a6a8a' : '#000' }}
            >
              {submitting ? t(language, 'aiAnalyzing') : t(language, 'submitAndAnalyze')}
            </button>
          </div>
        )}

        <div className="bg-[#0d1f3c] rounded-2xl p-4 border border-[#1e3a5f]">
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-[minmax(0,1fr)_auto_1fr]">
            <input
              value={filterText}
              onChange={(event) => setFilterText(event.target.value)}
              placeholder={t(language, 'searchLocation')}
              className="min-w-0 bg-[#1e3a5f] text-white rounded-xl p-3 border border-[#2a4a7f] outline-none placeholder-gray-500"
            />
            <button className="w-full sm:w-auto px-4 py-3 rounded-xl bg-[#1e3a5f] text-[#00b4d8] font-semibold border border-[#2a4a7f]">
              {t(language, 'searchLocation')}
            </button>
            <input
              type="date"
              value={filterDate}
              onChange={(event) => setFilterDate(event.target.value)}
              className="bg-[#1e3a5f] text-white rounded-xl p-3 border border-[#2a4a7f] outline-none"
            />
          </div>
        </div>

        <div className="space-y-3">
          {visibleReports.map((report) => (
            <button
              key={report.id}
              type="button"
              onClick={() => setSelectedReport(report)}
              className="w-full text-left bg-[#0d1f3c] rounded-2xl p-4 border border-[#1e3a5f]"
            >
              <div className="flex items-start justify-between gap-3 mb-2">
                <div>
                  <p className="font-bold text-white">{getReportText(report, 'shortName') || getShortLocationName(getReportText(report, 'locationName')) || t(language, 'unknownArea')}</p>
                  <p className="text-gray-500 text-xs mt-0.5">{getReportText(report, 'time')}</p>
                </div>
                {typeof report.finalRisk === 'number' && (
                  <p className="text-xs font-semibold whitespace-nowrap" style={{ color: getRiskLevel(report.finalRisk).hex }}>
                    {formatRiskWithLevelLocalized(report.finalRisk, language, t)}
                  </p>
                )}
              </div>
              <p className="text-gray-300 text-sm">{summarizeNote(getReportText(report, 'note') || t(language, 'fieldReportSubmitted'))}</p>
            </button>
          ))}
        </div>
      </div>

      <MapPickerModal
        open={mapPickerOpen}
        title={t(language, 'pickReportLocation')}
        onClose={() => setMapPickerOpen(false)}
        language={language}
        onConfirm={(location) => {
          setSelectedLocation(location)
          setLocationName(location.name)
          setLocationError('')
          setMapPickerOpen(false)
        }}
      />

      {selectedReport && (
        <div className="fixed inset-0 z-[1200] bg-black/60 p-4 flex items-center justify-center">
          <div className="w-full max-w-md max-h-[90vh] overflow-y-auto bg-[#0d1f3c] rounded-2xl border border-[#1e3a5f] p-4">
            <div className="flex items-start justify-between mb-3">
              <div>
                <p className="font-bold text-white">{getReportText(selectedReport, 'shortName') || getShortLocationName(getReportText(selectedReport, 'locationName'))}</p>
                <p className="text-xs text-gray-400 mt-1">{selectedReport.lat?.toFixed?.(4)}, {selectedReport.lng?.toFixed?.(4)}</p>
              </div>
              <button onClick={() => setSelectedReport(null)} className="w-8 h-8 rounded-full border border-[#1e3a5f] text-gray-300" aria-label={t(language, 'close')}>X</button>
            </div>

            {selectedReport.image && (
              <img src={selectedReport.image} alt={t(language, 'reportImageAlt')} className="w-full rounded-xl max-h-64 object-cover mb-3" />
            )}

            <div className="h-40 rounded-xl overflow-hidden border border-[#1e3a5f] mb-3">
              <MapContainer center={[selectedReport.lat, selectedReport.lng]} zoom={12} style={{ height: '100%', width: '100%' }} zoomControl={false}>
                <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
                <CircleMarker center={[selectedReport.lat, selectedReport.lng]} radius={10} pathOptions={{ color: '#00b4d8', fillColor: '#00b4d8', fillOpacity: 0.9 }} />
              </MapContainer>
            </div>

            <p className="text-sm text-gray-300 mb-2">{getReportText(selectedReport, 'note')}</p>
            <p className="text-sm text-gray-400 mb-2">{getReportText(selectedReport, 'fullAddress') || getReportText(selectedReport, 'locationName')}</p>
            <p className="text-sm mb-2" style={{ color: getRiskLevel(selectedReport.finalRisk || 0).hex }}>
              {t(language, 'aiRisk')}: {formatRiskWithLevelLocalized(selectedReport.finalRisk || 0, language, t)}
            </p>
            <p className="text-sm text-[#8ecae6]">
              {selectedReport[`explanation${language === 'AR' ? 'Ar' : 'En'}`] || selectedReport.explanation}
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
