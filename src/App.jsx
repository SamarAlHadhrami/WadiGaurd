import { useEffect, useMemo, useRef, useState } from 'react'
import CommunityScreen from './components/CommunityScreen'
import MapScreen from './components/MapScreen'
import RouteAnalysis from './components/RouteAnalysis'
import ScanScreen from './components/ScanScreen'
import WadiEcho from './components/WadiEcho'
import brandIcon from './assets/WadiGuard.png'
import { wadis } from './data/wadis'
import { countNearbyReports, distanceKm, filterReportsWithinDays } from './utils/communityService'
import { getWeatherData } from './utils/apiService'
import {
  cacheRiskResult,
  readCache,
  writeCache,
} from './utils/cacheService'
import { isArabic, t } from './utils/i18n'
import { getCurrentLocation, getShortLocationName } from './utils/locationService'
import { requestNotificationPermission, showBrowserNotification } from './utils/notificationService'
import {
  buildDynamicExplanation,
  computeEnvironmentalRisk,
  formatRiskWithLevelLocalized,
  matchHistoricalPattern,
} from './utils/riskEngine'
import {
  isFirebaseReady,
  saveCommunityReport,
  subscribeToCommunityReports,
} from './utils/firebaseService'

// ===== APP SHELL =====
// Top-level navigation, language state, live status, and community data flow.

// ---------------------------------------------
// DATA: fallbackReports
// PURPOSE: Keeps the app usable when Firebase is
// unavailable during demos or local testing
// ---------------------------------------------
const fallbackReports = [
  {
    id: 1,
    wadiName: 'Wadi Shab',
    wadiNameAr: 'وادي شاب',
    locationName: 'Wadi Shab, Oman',
    locationNameAr: 'وادي شاب، عمان',
    note: 'Road is submerged near the bridge',
    noteAr: 'الطريق مغمور بالمياه قرب الجسر',
    time: '20 mins ago',
    timeAr: 'منذ 20 دقيقة',
    lat: 22.8069,
    lng: 59.2551,
    image: null,
    photo: null,
  },
  {
    id: 2,
    wadiName: 'Wadi Tiwi',
    wadiNameAr: 'وادي طيوي',
    locationName: 'Wadi Tiwi, Oman',
    locationNameAr: 'وادي طيوي، عمان',
    note: 'Water rising slowly at entry point',
    noteAr: 'منسوب المياه يرتفع ببطء عند نقطة الدخول',
    time: '1 hour ago',
    timeAr: 'منذ ساعة',
    lat: 22.7823,
    lng: 59.3012,
    image: null,
    photo: null,
  },
]

const initialReports = fallbackReports

// ---------------------------------------------
// COMPONENT: App
// PURPOSE: Hosts the full app shell, tabs, global
// language state, Firebase syncing, and live
// status ticker
// ---------------------------------------------
export default function App() {
  const [activeTab, setActiveTab] = useState('map')
  const [selectedWadi, setSelectedWadi] = useState(null)
  const [language, setLanguage] = useState('EN')
  const [communityReports, setCommunityReports] = useState(initialReports)
  const [firebaseNotice, setFirebaseNotice] = useState('')
  const [liveStatus, setLiveStatus] = useState(() => readCache('app:live-status'))
  const [isOffline, setIsOffline] = useState(() => (typeof navigator === 'undefined' ? false : !navigator.onLine))
  const [userLocation, setUserLocation] = useState(() => readCache('app:user-location'))
  const knownReportIdsRef = useRef(new Set())

  // Keep document direction in sync with the
  // active language so RTL layouts feel natural.
  useEffect(() => {
    document.body.dir = isArabic(language) ? 'rtl' : 'ltr'
  }, [language])

  useEffect(() => {
    requestNotificationPermission()
  }, [])

  useEffect(() => {
    const handleOnline = () => setIsOffline(false)
    const handleOffline = () => setIsOffline(true)

    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)

    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [])

  useEffect(() => {
    const cachedReports = readCache('app:community-reports')
    if (cachedReports?.length) {
      setCommunityReports((previous) => (previous === initialReports ? cachedReports : previous))
    }
  }, [])

  useEffect(() => {
    if (!communityReports?.length) return
    writeCache('app:community-reports', communityReports)
  }, [communityReports])

  // ---------------------------------------------
  // EFFECT: Community report sync
  // PURPOSE: Subscribes to Firestore when
  // available and falls back to local data
  // ---------------------------------------------
  useEffect(() => {
    if (!isFirebaseReady()) {
      return undefined
    }

    const unsubscribe = subscribeToCommunityReports(
      (reports) => {
        const nextReports = filterReportsWithinDays(reports, 14)
        setCommunityReports(nextReports)
        writeCache('app:community-reports', nextReports)
        setFirebaseNotice('')
      },
      () => {
        const cachedReports = readCache('app:community-reports', fallbackReports)
        setCommunityReports(cachedReports)
        setFirebaseNotice(t(language, 'firebaseLoadFallback'))
      }
    )

    return unsubscribe
  }, [language])

  // ---------------------------------------------
  // EFFECT: Live status bar refresh
  // PURPOSE: Refreshes current location risk every
  // 60 seconds for the top ticker
  // ---------------------------------------------
  useEffect(() => {
    let active = true

    const loadLiveStatus = async () => {
      try {
        const current = await getCurrentLocation()
        const weather = await getWeatherData(current.lat, current.lng)
        const nearestWadi = wadis.reduce((closest, item) => {
          const closestDistance = Math.abs(closest.lat - current.lat) + Math.abs(closest.lng - current.lng)
          const itemDistance = Math.abs(item.lat - current.lat) + Math.abs(item.lng - current.lng)
          return itemDistance < closestDistance ? item : closest
        }, wadis[0])
        const communityCount = countNearbyReports(communityReports, current.lat, current.lng, 10)
        const memoryMatch = matchHistoricalPattern(weather.rainfall, weather.rainfall * 10)
        const analysis = computeEnvironmentalRisk({
          rainfall: weather.rainfall,
          nearbyWadi: nearestWadi,
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
          .split('. ')
          .slice(0, 2)
          .join('. ')
          .trim()

        if (!active) return

        const nextLiveStatus = {
          location: getShortLocationName(current.name),
          rainfall: weather.rainfall,
          communityCount,
          risk: analysis.risk,
          riskScore: analysis.finalScore,
          explanation: explanation.endsWith('.') ? explanation : `${explanation}.`,
        }

        setUserLocation(current)
        writeCache('app:user-location', current)
        writeCache('app:live-status', nextLiveStatus)
        cacheRiskResult('live-status', nextLiveStatus)
        setLiveStatus(nextLiveStatus)
      } catch (error) {
        console.error('Live status update failed:', error)
        if (!active) return
        const cachedLiveStatus = readCache('app:live-status')
        setLiveStatus((previous) => previous || cachedLiveStatus || {
          location: t(language, 'fallbackLocationName'),
          rainfall: 0,
          communityCount: 0,
          risk: { hex: '#06d6a0', level: 'LOW' },
          riskScore: 8,
          explanation: buildDynamicExplanation({
            language,
            currentRainfall: 0,
            laterRainfall: 0,
            communityCount: 0,
          }),
        })
      }
    }

    loadLiveStatus()
    const interval = window.setInterval(loadLiveStatus, 60000)

    return () => {
      active = false
      window.clearInterval(interval)
    }
  }, [communityReports, language])

  useEffect(() => {
    if (!liveStatus || liveStatus.riskScore < 70) return

    const title = language === 'AR' ? 'تحذير من خطر فيضان مرتفع' : 'High Flood Risk Detected'
    const body = language === 'AR'
      ? 'الخطر مرتفع في منطقتك. يُنصح بتجنب السفر حالياً.'
      : 'Risk is HIGH in your area. Avoid travel.'

    showBrowserNotification({
      title,
      body,
      tag: `high-risk-${liveStatus.location}`,
      cooldownMs: 20 * 60 * 1000,
    })
  }, [language, liveStatus])

  useEffect(() => {
    if (!userLocation || !communityReports.length) return

    const knownIds = knownReportIdsRef.current
    const newNearbyReports = communityReports.filter((report) => {
      if (!report?.id || knownIds.has(report.id)) return false
      if (typeof report.lat !== 'number' || typeof report.lng !== 'number') return false
      return distanceKm(userLocation.lat, userLocation.lng, report.lat, report.lng) <= 15
    })

    communityReports.forEach((report) => {
      if (report?.id) knownIds.add(report.id)
    })

    if (!newNearbyReports.length) return

    const latestReport = newNearbyReports[0]
    const title = language === 'AR' ? 'تقرير مجتمعي جديد قريب منك' : 'New Community Report Nearby'
    const body = language === 'AR'
      ? 'تمت إضافة بلاغ جديد قريب من موقعك. افتح التطبيق للتحقق من التفاصيل.'
      : 'A new nearby report was added. Open the app to check details.'

    showBrowserNotification({
      title,
      body,
      tag: `community-report-${latestReport.id}`,
      cooldownMs: 5 * 60 * 1000,
    })
  }, [communityReports, language, userLocation])

  // ---------------------------------------------
  // FUNCTION: onAddReport
  // PURPOSE: Saves community reports to Firebase
  // or local fallback without changing the UI flow
  // ---------------------------------------------
  const onAddReport = async (report) => {
    if (!isFirebaseReady()) {
      setCommunityReports((prev) => [
        {
          ...report,
          id: Date.now(),
          wadiName: report.locationName,
          wadiNameAr: report.locationNameAr || report.locationName,
          time: t(language, 'justNow'),
          timeAr: t('AR', 'justNow'),
          createdAt: new Date(),
        },
        ...prev,
      ])
      setFirebaseNotice(t(language, 'reportAddedFallback'))
      return { ok: true, fallback: true }
    }

    try {
      await saveCommunityReport(report)
      return { ok: true, fallback: false }
    } catch (error) {
      console.error('Saving report failed:', error)
      setCommunityReports((prev) => [
        {
          ...report,
          id: Date.now(),
          wadiName: report.locationName,
          wadiNameAr: report.locationNameAr || report.locationName,
          time: t(language, 'justNow'),
          timeAr: t('AR', 'justNow'),
          createdAt: new Date(),
        },
        ...prev,
      ])
      setFirebaseNotice(t(language, 'reportAddedFallback'))
      return { ok: false, fallback: true }
    }
  }

  // Shared app-shell values derived from the
  // current language, Firebase state, and ticker.
  const dirClass = useMemo(() => (isArabic(language) ? 'text-right' : 'text-left'), [language])
  const noticeText = !isFirebaseReady() ? t(language, 'firebaseLoadFallback') : firebaseNotice
  const liveTextColor = liveStatus?.risk?.level === 'MEDIUM' ? '#0a1628' : '#ffffff'
  const tickerAnimationName = isArabic(language) ? 'wadiTickerRtl' : 'wadiTickerLtr'
  const offlineBanner = language === 'AR'
    ? 'وضع عدم الاتصال — يتم عرض آخر البيانات المعروفة'
    : 'Offline mode — showing last known data'
  const liveTickerText = liveStatus
    ? [
        liveStatus.location,
        formatRiskWithLevelLocalized(liveStatus.riskScore, language, t),
        `${liveStatus.rainfall} mm`,
        `${liveStatus.communityCount} ${t(language, 'community')}`,
        liveStatus.explanation,
      ].join(' • ')
    : t(language, 'loading')

  return (
    <div
      dir={isArabic(language) ? 'rtl' : 'ltr'}
      className={`flex flex-col bg-[#0a1628] text-white relative overflow-hidden ${dirClass}`}
      style={{ minHeight: '100dvh', height: '100dvh' }}
    >
      <div className="flex items-center justify-between px-4 py-3 bg-[#0d1f3c] border-b border-[#1e3a5f] shrink-0">
        <div className="flex items-center gap-3">
          <img src={brandIcon} alt={t(language, 'appTitle')} className="w-12 h-12 rounded-xl object-cover" />
          <div>
            <h1 className="text-lg font-bold text-[#00b4d8] leading-tight">{t(language, 'appTitle')}</h1>
            <p className="text-xs text-gray-500">{t(language, 'tagline')}</p>
          </div>
        </div>
        <button
          onClick={() => setLanguage((current) => (current === 'EN' ? 'AR' : 'EN'))}
          className="px-3 py-1.5 rounded-full border border-[#00b4d8] text-[#00b4d8] text-sm font-bold hover:bg-[#00b4d8] hover:text-black transition-all"
        >
          {language === 'EN' ? 'عربي' : 'EN'}
        </button>
      </div>

      <div
        className="px-4 py-2 border-b border-[#1e3a5f] overflow-hidden shrink-0"
        style={{ background: liveStatus?.risk?.hex || '#10243f' }}
      >
        <div className="overflow-hidden whitespace-nowrap" dir="ltr">
          <div
            className="inline-flex items-center gap-8 text-sm font-medium min-w-max"
            style={{ animation: `${tickerAnimationName} 24s linear infinite`, color: liveTextColor }}
          >
            <span>{liveTickerText}</span>
            <span>{liveTickerText}</span>
          </div>
        </div>
      </div>

      {noticeText && (
        <div className="px-4 py-2 bg-[#10243f] text-xs text-[#8ecae6] border-b border-[#1e3a5f]">
          {noticeText}
        </div>
      )}

      {isOffline && (
        <div className="px-4 py-2 bg-[#3b2a12] text-xs text-[#ffd166] border-b border-[#5d4320]">
          {offlineBanner}
        </div>
      )}

      <div className="flex-1 overflow-hidden relative">
        {activeTab === 'map' && (
          <MapScreen
            selectedWadi={selectedWadi}
            setSelectedWadi={setSelectedWadi}
            reports={communityReports}
            language={language}
          />
        )}
        {activeTab === 'scan' && <ScanScreen language={language} reports={communityReports} />}
        {activeTab === 'route' && <RouteAnalysis language={language} reports={communityReports} />}
        {activeTab === 'echo' && <WadiEcho language={language} reports={communityReports} />}
        {activeTab === 'community' && (
          <CommunityScreen
            reports={communityReports}
            onAddReport={onAddReport}
            language={language}
          />
        )}
      </div>

      <div
        className="flex bg-[#0d1f3c] border-t border-[#1e3a5f] shrink-0 overflow-x-auto"
        style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 8px)' }}
      >
        {[
          { id: 'map', icon: '🗺️', label: t(language, 'map') },
          { id: 'scan', icon: '📸', label: t(language, 'scan') },
          { id: 'route', icon: '🧭', label: t(language, 'route') },
          { id: 'echo', icon: '🎙️', label: t(language, 'echo') },
          { id: 'community', icon: '👥', label: t(language, 'community') },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex-1 min-w-[72px] py-3 flex flex-col items-center gap-1 transition-all ${
              activeTab === tab.id
                ? 'text-[#00b4d8] border-t-2 border-[#00b4d8]'
                : 'text-gray-500 hover:text-gray-300'
            }`}
          >
            <span className="text-xl">{tab.icon}</span>
            <span className="text-xs font-medium">{tab.label}</span>
          </button>
        ))}
      </div>

      <style>{`
        @keyframes wadiTickerLtr {
          0% { transform: translateX(0); }
          100% { transform: translateX(-50%); }
        }

        @keyframes wadiTickerRtl {
          0% { transform: translateX(-50%); }
          100% { transform: translateX(0); }
        }
      `}</style>
    </div>
  )
}
