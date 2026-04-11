import { useState } from 'react'
import { CircleMarker, MapContainer, TileLayer, useMapEvents } from 'react-leaflet'
import 'leaflet/dist/leaflet.css'
import { reverseGeocode } from '../utils/locationService'
import { t } from '../utils/i18n'

// ===== MAP PICKER =====
// Reusable modal for selecting a location directly from the map.

// ---------------------------------------------
// COMPONENT: PickMarker
// PURPOSE: Tracks the tapped map point and sends
// the chosen location back to the parent modal
// ---------------------------------------------
function PickMarker({ onPick }) {
  const [position, setPosition] = useState(null)

  useMapEvents({
    async click(event) {
      const lat = event.latlng.lat
      const lng = event.latlng.lng
      const name = await reverseGeocode(lat, lng)
      const next = { lat, lng, name }
      setPosition([lat, lng])
      onPick(next)
    },
  })

  return position ? (
    <CircleMarker
      center={position}
      radius={10}
      pathOptions={{ color: '#00b4d8', fillColor: '#00b4d8', fillOpacity: 0.9 }}
    />
  ) : null
}

// ---------------------------------------------
// COMPONENT: MapPickerModal
// PURPOSE: Opens a temporary map dialog so a
// screen can request a user-picked coordinate
// ---------------------------------------------
export default function MapPickerModal({ open, title, onClose, onConfirm, language = 'EN' }) {
  const [pickedLocation, setPickedLocation] = useState(null)

  if (!open) return null

  return (
    <div className="absolute inset-0 z-[2000] bg-black bg-opacity-80 flex items-center justify-center p-4">
      <div className="w-full max-w-3xl bg-[#0d1f3c] border border-[#1e3a5f] rounded-3xl overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-[#1e3a5f]">
          <div>
            <h3 className="text-white font-bold">{title}</h3>
            <p className="text-xs text-gray-400 mt-1">{t(language, 'tapMapToChoose')}</p>
          </div>
          <button
            onClick={onClose}
            className="px-3 py-1.5 rounded-xl border border-[#1e3a5f] text-gray-300 text-sm"
          >
            {t(language, 'close')}
          </button>
        </div>

        <div className="h-[380px]">
          <MapContainer
            center={[23.588, 58.3829]}
            zoom={7}
            style={{ height: '100%', width: '100%' }}
          >
            <TileLayer url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png" />
            <PickMarker onPick={setPickedLocation} />
          </MapContainer>
        </div>

        <div className="px-4 py-3 border-t border-[#1e3a5f]">
          <p className="text-sm text-gray-300">
            {pickedLocation ? pickedLocation.name : t(language, 'noPointSelected')}
          </p>
          <div className="flex gap-3 mt-3">
            <button
              onClick={onClose}
              className="flex-1 py-3 rounded-2xl border border-[#1e3a5f] text-gray-300 font-semibold"
            >
              {t(language, 'cancel')}
            </button>
            <button
              onClick={() => {
                if (pickedLocation) onConfirm(pickedLocation)
              }}
              disabled={!pickedLocation}
              className="flex-1 py-3 rounded-2xl font-bold"
              style={{
                background: pickedLocation ? '#00b4d8' : '#1e3a5f',
                color: pickedLocation ? '#000' : '#4a6a8a',
              }}
            >
              {t(language, 'useThisPoint')}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
