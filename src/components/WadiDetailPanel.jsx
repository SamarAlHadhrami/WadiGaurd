import { useEffect, useState } from 'react'
import { getWeatherData } from '../utils/apiService'
import { getNearbyReports } from '../utils/communityService'
import {
  buildDynamicExplanation,
  computeEnvironmentalRisk,
  formatRiskWithLevelLocalized,
  matchHistoricalPattern,
} from '../utils/riskEngine'
import { t } from '../utils/i18n'

// ===== WADI DETAIL PANEL =====
// Bottom sheet for detailed live analysis of a selected wadi.

// ---------------------------------------------
// COMPONENT: WadiDetailPanel
// PURPOSE: Shows live weather, memory, nearby
// reports, and dynamic explanation for one wadi
// ---------------------------------------------
export default function WadiDetailPanel({ wadi, onClose, reports, language }) {
  const [weather, setWeather] = useState({ rainfall: 0, description: 'clear sky' })
  const wadiTitle = language === 'AR' ? wadi.nameAr || wadi.name : wadi.name

  // ---------------------------------------------
  // EFFECT: Wadi weather refresh
  // PURPOSE: Loads the current weather for the
  // selected wadi whenever the panel opens
  // ---------------------------------------------
  useEffect(() => {
    let active = true
    getWeatherData(wadi.lat, wadi.lng).then((data) => {
      if (active) setWeather(data)
    })
    return () => {
      active = false
    }
  }, [wadi])

  const nearbyReports = getNearbyReports(reports, wadi.lat, wadi.lng, 12)
  const communityCount = nearbyReports.length
  const memoryMatch = matchHistoricalPattern(weather.rainfall, weather.rainfall * 10)
  const wadiDescription = language === 'AR' ? wadi.descriptionAr || wadi.description : wadi.description
  const memoryDescription = memoryMatch
    ? language === 'AR'
      ? memoryMatch.descriptionAr || memoryMatch.description
      : memoryMatch.description
    : ''
  const memoryTitle = memoryMatch
    ? language === 'AR'
      ? memoryMatch.nameAr || memoryMatch.name
      : memoryMatch.name
    : ''
  const analysis = computeEnvironmentalRisk({
    rainfall: weather.rainfall,
    nearbyWadi: wadi,
    memoryMatch,
    communityCount,
  })
  const explanation = buildDynamicExplanation({
    language,
    currentRainfall: weather.rainfall,
    laterRainfall: weather.rainfall,
    memoryMatch,
    communityCount,
  })

  return (
    <div
      className="absolute bottom-0 left-0 right-0 bg-[#0d1f3c] rounded-t-3xl p-5 z-[1000] border-t border-[#1e3a5f] max-h-[75vh] overflow-y-auto"
      style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 20px)' }}
    >
      <div className="flex justify-between items-start mb-4">
        <div>
          <h2 className="text-xl font-bold">{wadiTitle}</h2>
          <p className="text-gray-400 text-sm mt-0.5">{wadiDescription}</p>
        </div>
        <button
          onClick={onClose}
          className="text-gray-400 text-sm w-8 h-8 flex items-center justify-center rounded-full hover:bg-[#1e3a5f]"
          aria-label={t(language, 'close')}
        >
          X
        </button>
      </div>

      <div className="mb-4">
        <div className="flex justify-between mb-1.5">
          <span className="text-sm text-gray-400">{t(language, 'risk')}</span>
          <span className="font-bold text-lg" style={{ color: analysis.risk.hex }}>
            {analysis.risk.emoji} {formatRiskWithLevelLocalized(analysis.finalScore, language, t)}
          </span>
        </div>
        <div className="w-full bg-[#1e3a5f] rounded-full h-3">
          <div
            className="h-3 rounded-full transition-all duration-700"
            style={{ width: `${analysis.finalScore}%`, background: analysis.risk.hex }}
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="p-3 bg-[#0a1628] rounded-xl border border-[#1e3a5f]">
          <p className="text-gray-400 text-xs mb-1">{t(language, 'rainfall')}</p>
          <p className="text-white text-sm">{weather.rainfall} mm</p>
        </div>
        <div className="p-3 bg-[#0a1628] rounded-xl border border-[#1e3a5f]">
          <p className="text-gray-400 text-xs mb-1">{t(language, 'community')}</p>
          <p className="text-white text-sm">{communityCount}</p>
        </div>
      </div>

      <div className="mt-4 p-3 bg-[#0a1628] rounded-xl border border-[#1e3a5f]">
        <p className="text-gray-400 text-xs mb-1">{t(language, 'memory')}</p>
        <p className="text-sm text-gray-200">
          {memoryMatch ? `${memoryTitle} - ${memoryDescription}` : t(language, 'noMemoryMatch')}
        </p>
      </div>

      <div className="mt-4 p-3 bg-[#0a1628] rounded-xl border border-[#1e3a5f]">
        <p className="text-gray-400 text-xs mb-1">{t(language, 'explanation')}</p>
        <p className="text-sm text-gray-200">{explanation}</p>
      </div>
    </div>
  )
}
