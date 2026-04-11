import { useRef, useState } from 'react'
import { generateWadiEchoReply, getForecastTimeline, getWeatherData } from '../utils/apiService'
import { cacheRiskResult } from '../utils/cacheService'
import { countNearbyReports } from '../utils/communityService'
import { analyzeRoute, findNearbyWadis } from '../utils/routeService'
import {
  computeEnvironmentalRisk,
  formatRiskWithLevel,
  formatRiskWithLevelLocalized,
  getRainIntensityLabel,
  getRiskLevel,
  matchHistoricalPattern,
} from '../utils/riskEngine'
import { geocodeLocation, getCurrentLocation, getShortLocationName } from '../utils/locationService'
import { t } from '../utils/i18n'

// ===== VOICE ASSISTANT =====
// Natural-language flood safety assistant with text and voice interaction.

const ARABIC_TEXT_PATTERN = /[\u0600-\u06FF]/
const MY_LOCATION_PATTERNS = [/my location/i, /current location/i, /near me/i, /\bhere\b/i, /\bnearby\b/i, /this area/i, /my area/i, /موقعي/, /هنا/, /قريب/, /هذه المنطقة/]
const ROUTE_QUERY_PATTERNS = [/route/i, /travel/i, /\bgo\b/i, /drive/i, /trip/i, /المسار/, /سافر/, /اذهب/, /طريق/]
const WEATHER_QUERY_PATTERNS = [/weather/i, /rain/i, /storm/i, /forecast/i, /طقس/, /مطر/, /أمطار/]
const WADI_QUERY_PATTERNS = [/wadi/i, /وادي/]
const SAFETY_QUERY_PATTERNS = [/safe/i, /risk/i, /flood/i, /danger/i, /can i travel/i, /آمن/, /خطر/, /فيض/, /سفر/]

// ---------------------------------------------
// FUNCTION: findBestVoice
// PURPOSE: Picks the most natural available
// browser voice for the selected language
// ---------------------------------------------
const findBestVoice = (voices, language) => {
  const targetPrefix = language === 'AR' ? 'ar' : 'en'

  return (
    voices.find((voice) => voice.localService && voice.default && voice.lang?.toLowerCase().startsWith(targetPrefix)) ||
    voices.find((voice) => voice.name?.match(language === 'AR' ? /Arabic/i : /Natural|Neural|Jenny|Aria|Guy|Davis|English/i)) ||
    voices.find((voice) => voice.lang?.toLowerCase().startsWith(targetPrefix)) ||
    null
  )
}

// ---------------------------------------------
// FUNCTION: loadAvailableVoices
// PURPOSE: Waits briefly for browser voices so
// speech synthesis can reliably pick Arabic audio
// on first use
// ---------------------------------------------
const loadAvailableVoices = () =>
  new Promise((resolve) => {
    if (!window.speechSynthesis) {
      resolve([])
      return
    }

    const existingVoices = window.speechSynthesis.getVoices()
    if (existingVoices.length) {
      resolve(existingVoices)
      return
    }

    const fallbackTimer = window.setTimeout(() => {
      window.speechSynthesis.onvoiceschanged = null
      resolve(window.speechSynthesis.getVoices())
    }, 800)

    window.speechSynthesis.onvoiceschanged = () => {
      window.clearTimeout(fallbackTimer)
      window.speechSynthesis.onvoiceschanged = null
      resolve(window.speechSynthesis.getVoices())
    }
  })

// ---------------------------------------------
// FUNCTION: speakText
// PURPOSE: Speaks the assistant reply using the
// current app language when speech is available
// ---------------------------------------------
const speakText = async (message, language) => {
  try {
    if (!window.speechSynthesis) return false

    window.speechSynthesis.cancel()
    window.speechSynthesis.resume()

    const utterance = new SpeechSynthesisUtterance(message)
    utterance.lang = language === 'AR' ? 'ar' : 'en-US'
    utterance.rate = language === 'AR' ? 0.95 : 1
    utterance.pitch = 1

    const voices = await loadAvailableVoices()
    const matchingVoice = findBestVoice(voices, language)
    if (matchingVoice) utterance.voice = matchingVoice

    window.speechSynthesis.speak(utterance)
    return true
  } catch (error) {
    console.error('Speech synthesis failed:', error)
    return false
  }
}

// ---------------------------------------------
// FUNCTION: buildTimelineItems
// PURPOSE: Creates shared NOW / +1H / +2H values
// for the assistant summary card
// ---------------------------------------------
const buildTimelineItems = (language, now, plus1, plus2) => [
  { label: t(language, 'now'), value: now },
  { label: t(language, 'plus1h'), value: plus1 },
  { label: t(language, 'plus2h'), value: plus2 },
]

const detectQueryLanguage = (query, fallback = 'EN') => (ARABIC_TEXT_PATTERN.test(query) ? 'AR' : fallback)

const stripQueryToLocation = (query) =>
  query
    .replace(/[?؟.,!]/g, ' ')
    .replace(/\b(is|there|any|check|should|can|please|tell|me|about|safe|safety|flood|flooding|rain|weather|risk|now|out|go|area|location|near|nearby|in|at|around|for|route|travel|drive|trip|to)\b/gi, ' ')
    .replace(/(هل|هناك|أي|تحقق|افحص|آمن|امان|أمان|فيضانات|فيضان|مطر|طقس|خطر|الآن|المنطقة|الموقع|قريب|حول|في|منطقة|إلى|الى|اذهب|سافر|المسار|طريق)/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

const detectIntent = (query) => {
  if (ROUTE_QUERY_PATTERNS.some((pattern) => pattern.test(query))) return 'route'
  if (MY_LOCATION_PATTERNS.some((pattern) => pattern.test(query))) return 'location'
  if (WEATHER_QUERY_PATTERNS.some((pattern) => pattern.test(query))) return 'weather'
  if (WADI_QUERY_PATTERNS.some((pattern) => pattern.test(query))) return 'wadi'
  if (SAFETY_QUERY_PATTERNS.some((pattern) => pattern.test(query))) return 'safety'
  return 'general'
}

const extractRouteDestination = (query) => {
  const englishMatch = query.match(/(?:route|go|travel|drive|trip)(?:\s+\w+){0,4}\s+to\s+(.+)$/i)
  if (englishMatch?.[1]) return stripQueryToLocation(englishMatch[1])

  const arabicMatch = query.match(/(?:اذهب|سافر|المسار|طريق).{0,20}(?:إلى|الى)\s+(.+)$/)
  if (arabicMatch?.[1]) return stripQueryToLocation(arabicMatch[1])

  return ''
}

const getTrendLine = ({ language, currentRainfall, nextRainfall, laterRainfall }) => {
  const peakRainfall = Math.max(nextRainfall, laterRainfall)
  const futureRain = getRainIntensityLabel(peakRainfall, language)

  if (language === 'AR') {
    if (peakRainfall > currentRainfall) return `من المتوقع أن تزداد الحالة خلال الساعتين القادمتين إلى ${futureRain}.`
    if (peakRainfall < currentRainfall) return `من المتوقع أن تهدأ الحالة خلال الساعتين القادمتين وتبقى عند ${futureRain}.`
    return `من المتوقع أن تبقى الحالة مستقرة خلال الساعتين القادمتين عند ${futureRain}.`
  }

  if (peakRainfall > currentRainfall) return `Conditions may increase over the next 2 hours to ${futureRain.toLowerCase()}.`
  if (peakRainfall < currentRainfall) return `Conditions may ease over the next 2 hours and stay at ${futureRain.toLowerCase()}.`
  return `Conditions are expected to stay ${futureRain.toLowerCase()} over the next 2 hours.`
}

const getCommunityLine = (language, communityReports) => {
  if (language === 'AR') {
    return communityReports > 0
      ? `توجد ${communityReports} تقارير مجتمعية قريبة.`
      : 'لا توجد تقارير قوية عن فيضانات قريبة.'
  }

  return communityReports > 0
    ? `There ${communityReports === 1 ? 'is' : 'are'} ${communityReports} nearby community ${communityReports === 1 ? 'report' : 'reports'}.`
    : 'No strong flood reports nearby.'
}

const buildFallbackReply = ({ language, context }) => {
  const finalRisk = Math.max(context.risk_now, context.risk_1h, context.risk_2h)
  const currentRain = getRainIntensityLabel(context.rainfall, language)
  const trendLine = getTrendLine({
    language,
    currentRainfall: context.rainfall,
    nextRainfall: context.rainfall_forecast_1h,
    laterRainfall: context.rainfall_forecast_2h,
  })
  const communityLine = getCommunityLine(language, context.communityReports)

  if (language === 'AR') {
    const routeLine = context.routeMessage ? ` ${context.routeMessage}` : ''
    const wadiLine = context.intent === 'wadi' && context.nearbyWadi ? ` أقرب وادٍ هو ${context.nearbyWadi}.` : ''
    return `مستوى الخطر الحالي ${formatRiskWithLevelLocalized(finalRisk, language, t)}. المطر الآن ${currentRain}. ${trendLine} ${communityLine}${routeLine}${wadiLine}`.trim()
  }

  const routeLine = context.routeMessage ? ` ${context.routeMessage}` : ''
  const wadiLine = context.intent === 'wadi' && context.nearbyWadi ? ` The nearest wadi is ${context.nearbyWadi}.` : ''
  return `Current risk is ${formatRiskWithLevel(finalRisk)}. Rain right now is ${currentRain}. ${trendLine} ${communityLine}${routeLine}${wadiLine}`.trim()
}

const buildLocalRouteMessage = (language, routeResult) => {
  const destination = getShortLocationName(routeResult?.destination?.name || '')
  const riskText = formatRiskWithLevelLocalized(routeResult?.overallRiskScore || 0, language, t)

  if (language === 'AR') {
    return routeResult?.saferRoute
      ? `المسار إلى ${destination} يحمل خطراً قدره ${riskText}. يوجد مسار أكثر أماناً حالياً.`
      : `المسار إلى ${destination} يحمل خطراً قدره ${riskText}. ${routeResult?.message || ''}`.trim()
  }

  return routeResult?.saferRoute
    ? `Route to ${destination} is ${riskText}. A safer route is available right now.`
    : `Route to ${destination} is ${riskText}. ${routeResult?.message || ''}`.trim()
}

// ---------------------------------------------
// COMPONENT: WadiEcho
// PURPOSE: Handles typed or spoken safety
// questions and returns text + voice replies
// ---------------------------------------------
export default function WadiEcho({ language, reports }) {
  const [input, setInput] = useState('')
  const [listening, setListening] = useState(false)
  const [loading, setLoading] = useState(false)
  const [response, setResponse] = useState('')
  const [summary, setSummary] = useState(null)
  const recognitionRef = useRef(null)

  const resolveLocation = async ({ query, intent, routeResult, currentLocation }) => {
    if (routeResult?.destination) return routeResult.destination
    if (MY_LOCATION_PATTERNS.some((pattern) => pattern.test(query))) return currentLocation

    const stripped = stripQueryToLocation(query)
    if (stripped) {
      const location = await geocodeLocation(stripped)
      if (location) return location
    }

    if (intent === 'wadi' || intent === 'weather' || intent === 'safety' || intent === 'general') {
      return currentLocation
    }

    return currentLocation
  }

  // ---------------------------------------------
  // FUNCTION: runCommand
  // PURPOSE: Runs the full assistant flow using
  // weather, forecast, memory, and community data
  // ---------------------------------------------
  const runCommand = async (spokenInput = input) => {
    const query = spokenInput.trim()
    if (!query) return

    const responseLanguage = detectQueryLanguage(query, language)
    setLoading(true)

    try {
      const intent = detectIntent(query)
      const currentLocation = await getCurrentLocation()
      let routeResult = null

      if (intent === 'route') {
        const destinationText = extractRouteDestination(query)
        if (destinationText) {
          routeResult = await analyzeRoute({
            startLocation: currentLocation,
            destinationText,
            reports,
            language: responseLanguage,
          })
        }
      }

      const location = await resolveLocation({
        query,
        intent,
        routeResult,
        currentLocation,
      })

      const [weather, forecast] = await Promise.all([
        getWeatherData(location.lat, location.lng),
        getForecastTimeline(location.lat, location.lng),
      ])

      const nearbyWadis = findNearbyWadis(location.lat, location.lng)
      const nearestWadi = nearbyWadis
        .slice()
        .sort(
          (a, b) =>
            Math.abs(a.lat - location.lat) + Math.abs(a.lng - location.lng) -
            (Math.abs(b.lat - location.lat) + Math.abs(b.lng - location.lng))
        )[0]

      const communityReports = routeResult?.totalCommunityReportsAlongRoute ?? countNearbyReports(reports, location.lat, location.lng, 10)
      const memoryMatch = matchHistoricalPattern(weather.rainfall, weather.rainfall * 10)

      const riskNow = routeResult?.currentRisk ?? computeEnvironmentalRisk({
        rainfall: weather.rainfall,
        nearbyWadi: nearestWadi,
        memoryMatch,
        communityCount: communityReports,
      }).finalScore
      const risk1h = routeResult?.riskAfter1Hour ?? computeEnvironmentalRisk({
        rainfall: forecast.plus3h,
        nearbyWadi: nearestWadi,
        memoryMatch,
        communityCount: communityReports,
      }).finalScore
      const risk2h = routeResult?.riskAfter2Hours ?? computeEnvironmentalRisk({
        rainfall: forecast.plus6h,
        nearbyWadi: nearestWadi,
        memoryMatch,
        communityCount: communityReports,
      }).finalScore

      const context = {
        intent,
        location: getShortLocationName(location.name),
        rainfall: weather.rainfall,
        rainfall_forecast_1h: forecast.plus3h,
        rainfall_forecast_2h: forecast.plus6h,
        risk_now: riskNow,
        risk_1h: risk1h,
        risk_2h: risk2h,
        nearbyWadi: nearestWadi ? nearestWadi.name : null,
        communityReports,
        memoryInfluence: memoryMatch?.name || (responseLanguage === 'AR' ? 'لا يوجد' : 'none'),
        sky: weather.description,
        routeMessage: routeResult ? buildLocalRouteMessage(responseLanguage, routeResult) : '',
      }

      const aiReply = await generateWadiEchoReply({
        language: responseLanguage,
        query,
        context,
      })

      const finalReply = aiReply || buildFallbackReply({ language: responseLanguage, context })
      setResponse(finalReply)
      setSummary({
        location: context.location,
        rainfall: context.rainfall,
        rainfall1h: context.rainfall_forecast_1h,
        rainfall2h: context.rainfall_forecast_2h,
        communityReports,
        riskNow,
        risk1h,
        risk2h,
      })
      cacheRiskResult('wadi-echo-last', {
        query,
        language: responseLanguage,
        response: finalReply,
        summary: {
          location: context.location,
          rainfall: context.rainfall,
          rainfall1h: context.rainfall_forecast_1h,
          rainfall2h: context.rainfall_forecast_2h,
          communityReports,
          riskNow,
          risk1h,
          risk2h,
        },
      })
      speakText(finalReply, responseLanguage)
    } catch (error) {
      console.error('WadiEcho failed:', error)
      const fallback =
        responseLanguage === 'AR'
          ? 'حدثت مشكلة أثناء التحقق، لكن آخر البيانات المتاحة ما زالت محفوظة في التطبيق.'
          : 'I hit a problem while checking that request, but the last known data is still kept in the app.'
      setResponse(fallback)
      setSummary(null)
      speakText(fallback, responseLanguage)
    } finally {
      setLoading(false)
    }
  }

  // ---------------------------------------------
  // FUNCTION: toggleListening
  // PURPOSE: Starts or stops browser speech
  // recognition for assistant queries
  // ---------------------------------------------
  const toggleListening = () => {
    if (recognitionRef.current && listening) {
      recognitionRef.current.stop()
      return
    }

    const SR = window.SpeechRecognition || window.webkitSpeechRecognition
    if (!SR) {
      const message =
        language === 'AR'
          ? 'الإدخال الصوتي غير متاح في هذا المتصفح، لكن الكتابة ما زالت تعمل.'
          : 'Speech recognition is not available in this browser, but text input still works.'
      setResponse(message)
      setSummary(null)
      return
    }

    const recognition = new SR()
    recognitionRef.current = recognition
    recognition.lang = language === 'AR' ? 'ar-SA' : 'en-US'
    recognition.onstart = () => setListening(true)
    recognition.onend = () => {
      setListening(false)
      recognitionRef.current = null
    }
    recognition.onresult = (event) => {
      const transcript = event.results?.[0]?.[0]?.transcript || ''
      setInput(transcript)
      runCommand(transcript)
    }
    recognition.start()
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="p-4 space-y-4">
        <div className="bg-[#0d1f3c] rounded-2xl p-4 border border-[#1e3a5f]">
          <h2 className="text-xl font-bold text-[#00b4d8] mb-2">{t(language, 'echoTitle')}</h2>
          <p className="text-sm text-gray-400 mb-4">{t(language, 'wadiEchoHint')}</p>

          <textarea
            value={input}
            onChange={(event) => setInput(event.target.value)}
            placeholder={t(language, 'askWadiEcho')}
            className="w-full bg-[#1e3a5f] text-white rounded-xl p-3 mb-3 border border-[#2a4a7f] resize-none outline-none placeholder-gray-500"
            rows={4}
          />

          <div className="flex gap-2">
            <button onClick={toggleListening} className="flex-1 py-3 rounded-xl border border-[#1e3a5f] text-white">
              {listening ? `${t(language, 'listening')} - ${t(language, 'pressToStop')}` : t(language, 'voiceInput')}
            </button>
            <button
              onClick={() => runCommand()}
              disabled={loading}
              className="flex-1 py-3 rounded-xl font-bold"
              style={{
                background: loading ? '#1e3a5f' : '#00b4d8',
                color: loading ? '#4a6a8a' : '#000',
              }}
            >
              {loading ? t(language, 'checking') : t(language, 'ask')}
            </button>
          </div>
        </div>

        {summary && (
          <div className="bg-[#0d1f3c] rounded-2xl p-4 border border-[#1e3a5f] space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs uppercase tracking-wider text-gray-500">{t(language, 'location')}</p>
                <p className="text-sm text-white mt-1">{summary.location}</p>
              </div>
              <div className="text-right">
                <p className="text-xs uppercase tracking-wider text-gray-500">{t(language, 'community')}</p>
                <p className="text-sm text-white mt-1">{summary.communityReports}</p>
              </div>
            </div>

            <div>
              <p className="text-gray-400 text-xs uppercase tracking-wider mb-3">{t(language, 'rainfallTimeline')}</p>
              <div className="grid grid-cols-3 gap-2">
                {buildTimelineItems(language, summary.rainfall, summary.rainfall1h, summary.rainfall2h).map((item) => (
                  <div key={item.label} className="rounded-xl border border-[#1e3a5f] p-3 text-center bg-[#0a1628]">
                    <p className="text-xs text-gray-500 mb-2">{item.label}</p>
                    <p className="text-sm font-semibold text-[#8ecae6]">{item.value} mm</p>
                  </div>
                ))}
              </div>
            </div>

            <div>
              <p className="text-gray-400 text-xs uppercase tracking-wider mb-3">{t(language, 'timeline')}</p>
              <div className="grid grid-cols-3 gap-2">
                {buildTimelineItems(language, summary.riskNow, summary.risk1h, summary.risk2h).map((item) => {
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
          </div>
        )}

        <div className="bg-[#0d1f3c] rounded-2xl p-4 border border-[#1e3a5f]">
          <p className="text-[#00b4d8] text-xs font-bold uppercase tracking-wider mb-2">{t(language, 'response')}</p>
          <p className="text-sm text-gray-200 leading-relaxed">
            {response || t(language, 'responsePlaceholder')}
          </p>
        </div>
      </div>
    </div>
  )
}
