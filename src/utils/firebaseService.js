import { getApp, getApps, initializeApp } from 'firebase/app'
import {
  addDoc,
  collection,
  getFirestore,
  onSnapshot,
  orderBy,
  query,
} from 'firebase/firestore'
import { formatReportTime } from './communityService'

// ===== COMMUNITY STORAGE =====
// Firebase setup and Firestore helpers for live community reports.

// ---------------------------------------------
// BLOCK: Firebase configuration
// PURPOSE: Reads Firebase Web SDK values from the
// Vite environment
// ---------------------------------------------
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
}

const isConfigComplete = Object.values(firebaseConfig).every(Boolean)
const firebaseApp = isConfigComplete
  ? getApps().length
    ? getApp()
    : initializeApp(firebaseConfig)
  : null
export const db = firebaseApp ? getFirestore(firebaseApp) : null

// ---------------------------------------------
// FUNCTION: isFirebaseReady
// PURPOSE: Tells the app if Firestore is available
// or if local fallback should be used
// ---------------------------------------------
export const isFirebaseReady = () => Boolean(db)

// ---------------------------------------------
// FUNCTION: subscribeToCommunityReports
// PURPOSE: Opens a real-time listener for the
// reports collection and maps Firestore docs into
// UI-friendly report objects
// ---------------------------------------------
export const subscribeToCommunityReports = (onReports, onError) => {
  if (!db) {
    onError?.(new Error('Firebase not configured'))
    return () => {}
  }

  const reportsRef = collection(db, 'reports')
  const reportsQuery = query(reportsRef, orderBy('createdAt', 'desc'))

  return onSnapshot(
    reportsQuery,
    (snapshot) => {
      const reports = snapshot.docs.map((doc) => {
        const data = doc.data()
        return {
          id: doc.id,
          lat: Number(data.lat),
          lng: Number(data.lng),
          note: data.note || '',
          image: data.image || null,
          photo: data.image || null,
          imageScore: Number(data.imageScore || 0),
          finalRisk: Number(data.finalRisk || 0),
          explanation: data.explanation || '',
          explanationEn: data.explanationEn || data.explanation || '',
          explanationAr: data.explanationAr || data.explanation || '',
          createdAt: data.createdAt || null, // Firestore timestamp if present
          locationName: data.locationName || 'Unknown area',
          shortName: data.shortName || data.locationName || 'Unknown area',
          fullAddress: data.fullAddress || data.locationName || 'Unknown area',
          riskLabel: data.riskLabel || '',
          wadiName: data.locationName || 'Shared location',
          time: formatReportTime(data.createdAt),
        }
      })
      console.log('Fetched reports from Firebase:', reports.length)
      onReports(reports)
    },
    (error) => {
      console.error('Firestore subscribe failed:', error)
      onError?.(error)
    }
  )
}

// ---------------------------------------------
// FUNCTION: saveCommunityReport
// PURPOSE: Stores a community report document in
// Firestore using the current app report shape
// ---------------------------------------------
export const saveCommunityReport = async (report) => {
  if (!db) throw new Error('Firebase not configured')

  const reportsRef = collection(db, 'reports')
  await addDoc(reportsRef, {
    lat: report.lat,
    lng: report.lng,
    note: report.note || '',
    image: report.image || null,
    imageScore: report.imageScore || 0,
    finalRisk: report.finalRisk || 0,
    explanation: report.explanation || '',
    explanationEn: report.explanationEn || report.explanation || '',
    explanationAr: report.explanationAr || report.explanation || '',
    locationName: report.locationName || 'Unknown area',
    shortName: report.shortName || report.locationName || 'Unknown area',
    fullAddress: report.fullAddress || report.locationName || 'Unknown area',
    riskLabel: report.riskLabel || '',
    createdAt: new Date(),
  })
  console.log('Saved to Firebase')
}
