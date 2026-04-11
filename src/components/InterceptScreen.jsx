import { getRiskLevel } from '../utils/riskEngine'

// ===== LEGACY INTERCEPT SCREEN =====
// Older danger overlay kept in the project for reference.

// ---------------------------------------------
// COMPONENT: InterceptScreen
// PURPOSE: Displays a legacy full-screen flood
// warning card with redirect action
// ---------------------------------------------
export default function InterceptScreen({ wadi, onClose }) {
  if (!wadi) return null
  getRiskLevel(wadi.baseRisk)

  // ---------------------------------------------
  // FUNCTION: openGoogleMaps
  // PURPOSE: Opens Google Maps with the selected
  // wadi destination pre-filled
  // ---------------------------------------------
  const openGoogleMaps = () => {
    window.open(
      `https://www.google.com/maps/dir/?api=1&destination=${wadi.lat},${wadi.lng}`,
      '_blank'
    )
  }

  return (
    // Full screen overlay — covers everything
    <div className="absolute inset-0 z-[2000] bg-black bg-opacity-95 flex items-center justify-center p-4 intercept-anim">
      <div className="w-full max-w-sm bg-[#0d1f3c] rounded-3xl p-6 border-2 border-[#ef233c]">

        {/* Warning icon + title */}
        <div className="text-center mb-5">
          <div className="text-6xl mb-3 animate-bounce">⚠️</div>
          <h1 className="text-2xl font-bold text-[#ef233c]">DANGER AHEAD</h1>
          <h2 className="text-lg font-semibold text-white mt-1">{wadi.name}</h2>
        </div>

        {/* Risk percentage bar */}
        <div className="bg-[#1a0a0a] rounded-2xl p-4 mb-3 border border-[#ef233c] border-opacity-40">
          <div className="flex justify-between items-center mb-2">
            <span className="text-gray-400 text-sm">Flood Risk</span>
            <span className="text-[#ef233c] font-bold text-2xl">{wadi.baseRisk}%</span>
          </div>
          <div className="w-full bg-[#0a1628] rounded-full h-3">
            <div className="h-3 rounded-full bg-[#ef233c]" style={{ width: `${wadi.baseRisk}%` }} />
          </div>
        </div>

        {/* AI explanation — English + Arabic */}
        <div className="bg-[#0a1628] rounded-2xl p-4 mb-3 border border-[#1e3a5f]">
          <p className="text-[#00b4d8] text-xs font-bold mb-2">🧠 AI Analysis</p>
          <p className="text-gray-300 text-sm leading-relaxed">
            Heavy upstream rainfall detected. Conditions match a known flood pattern for this wadi.
            Flash flood expected within 3 hours.
          </p>
          {/* Arabic translation */}
          <p className="text-gray-500 text-xs mt-2 leading-relaxed" dir="rtl">
            تم رصد هطول غزير في المنبع. تشابه الظروف مع نمط فيضان معروف. يُتوقع فيضان خاطف خلال ٣ ساعات.
          </p>
        </div>

        {/* Arabic alert confirmation */}
        <div className="bg-[#0a2a1a] rounded-2xl p-3 mb-3 border border-[#06d6a0] border-opacity-50">
          <p className="text-[#06d6a0] text-sm">
            📲 Arabic alert sent to emergency contact ✓
          </p>
        </div>

        {/* Safe route info */}
        <div className="bg-[#0a1f2a] rounded-2xl p-3 mb-5 border border-[#00b4d8] border-opacity-40">
          <p className="text-[#00b4d8] text-sm font-bold">🔀 Safe Alternate Route Added</p>
          <p className="text-gray-500 text-xs mt-1">Via coastal highway — approx. +11 min</p>
        </div>

        {/* Primary action — take safe route */}
        <button
          onClick={openGoogleMaps}
          className="w-full py-4 bg-[#06d6a0] text-black font-bold rounded-2xl text-lg mb-3 active:scale-95 transition-all"
        >
          ✅ Take Safe Route
        </button>

        {/* Secondary — override and go back */}
        <button
          onClick={onClose}
          className="w-full py-3 border border-gray-700 text-gray-500 rounded-2xl text-sm hover:border-gray-500 transition-all"
        >
          I understand the risk — go back
        </button>
      </div>
    </div>
  )
}
