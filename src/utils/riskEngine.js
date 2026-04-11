import { historicalPatterns } from '../data/wadis'

// ===== RISK ENGINE =====
// Shared scoring helpers for scan, map, route, community, and voice features.

// ---------------------------------------------
// FUNCTION: calculateRiskScore
// PURPOSE: Keeps the original blended scoring
// logic used by older analysis flows
// ---------------------------------------------
export const calculateRiskScore = (imageScore, rainfall, wadi) => {
  const rainfallScore = Math.min((rainfall / 50) * 100, 100)
  const historyScore = Math.min((wadi?.baseRisk || 0) * 0.25, 15)
  const final = imageScore * 0.45 + rainfallScore * 0.35 + historyScore * 0.2
  return Math.min(Math.round(final), 100)
}

// ---------------------------------------------
// FUNCTION: getRiskLevel
// PURPOSE: Converts a numeric score into the
// shared LOW / MEDIUM / HIGH display object
// ---------------------------------------------
export const getRiskLevel = (score) => {
  if (score >= 71) return { level: 'HIGH', color: 'red', hex: '#ef233c', emoji: '🔴' }
  if (score >= 31) return { level: 'MEDIUM', color: 'orange', hex: '#f77f00', emoji: '🟠' }
  return { level: 'LOW', color: 'green', hex: '#06d6a0', emoji: '🟢' }
}

// ---------------------------------------------
// FUNCTION: formatRiskWithLevel
// PURPOSE: Formats the numeric score for UI
// display across the app
// ---------------------------------------------
export const formatRiskWithLevel = (score) => `${score}% (${getRiskLevel(score).level})`

const getLocalizedRiskLabel = (score, language = 'EN', translate = null) => {
  const risk = getRiskLevel(score)
  const label = (key, fallback) => (typeof translate === 'function' ? translate(language, key) : fallback)

  if (risk.level === 'HIGH') return label('highRisk', 'High Risk')
  if (risk.level === 'MEDIUM') return label('mediumRisk', 'Medium')
  return label('lowRisk', 'Low Risk')
}

// ---------------------------------------------
// FUNCTION: formatRiskWithLevelLocalized
// PURPOSE: Formats the numeric score with a
// translated risk label for EN / AR screens
// ---------------------------------------------
export const formatRiskWithLevelLocalized = (score, language = 'EN', translate = null) =>
  `${score}% (${getLocalizedRiskLabel(score, language, translate)})`

export const getRainIntensityLabel = (rainfall = 0, language = 'EN') => {
  if (language === 'AR') {
    if (rainfall <= 0) return 'لا يوجد مطر'
    if (rainfall < 3) return 'مطر خفيف'
    if (rainfall < 8) return 'مطر متوسط'
    return 'مطر غزير'
  }

  if (rainfall <= 0) return 'No rain'
  if (rainfall < 3) return 'Light rain'
  if (rainfall < 8) return 'Moderate rain'
  return 'Heavy rain'
}

// ---------------------------------------------
// FUNCTION: calculateContextRisk
// PURPOSE: Preserves the original context-based
// environmental scoring path
// ---------------------------------------------
export const calculateContextRisk = ({
  rainfall = 0,
  communityCount = 0,
  nearbyWadiRisk = 0,
  imageScore = 0,
  extraScore = 0,
}) => {
  const rainfallScore = Math.min(rainfall * 8, 55)
  const communityScore = Math.min(communityCount * 15, 30)
  const imageRiskScore = Math.min(imageScore * 0.22, 25)
  const hasActiveSignals = rainfall > 0 || communityCount > 0 || imageScore > 0
  const memoryBoost = hasActiveSignals ? Math.min(nearbyWadiRisk * 0.1, 10) : 0
  const comboBoost = rainfall >= 6 && communityCount > 0 ? 10 : 0

  if (!hasActiveSignals) return 8

  return Math.min(
    Math.round(rainfallScore + communityScore + imageRiskScore + memoryBoost + comboBoost + extraScore),
    100
  )
}

// ---------------------------------------------
// FUNCTION: analyzeReportNote
// PURPOSE: Extracts simple flood-related signals
// from a community note in EN or AR
// ---------------------------------------------
export const analyzeReportNote = (note = '') => {
  const normalized = note.toLowerCase()
  const keywords = {
    flood: ['flood', 'overflow', 'swollen', 'flash flood', 'فيضان', 'فيضانات', 'غرق', 'طفح'],
    water: ['water', 'stream', 'rising', 'submerged', 'wet', 'ماء', 'مياه', 'سيل', 'وادي', 'يرتفع', 'غمر'],
    dry: ['dry', 'clear', 'safe', 'empty', 'جاف', 'آمن', 'امن', 'واضح', 'فارغ'],
  }

  const foundFlood = keywords.flood.some((word) => normalized.includes(word))
  const foundWater = keywords.water.some((word) => normalized.includes(word))
  const foundDry = keywords.dry.some((word) => normalized.includes(word))

  return {
    foundFlood,
    foundWater,
    foundDry,
    supportsRisk: foundFlood || foundWater,
    suggestsLowRisk: foundDry && !foundFlood,
  }
}

// ---------------------------------------------
// FUNCTION: scoreDescriptionRisk
// PURPOSE: Converts report text into a numeric
// risk contribution
// ---------------------------------------------
export const scoreDescriptionRisk = (note = '') => {
  const normalized = note.toLowerCase()
  const highRisk = ['flood', 'overflowing', 'rising fast', 'strong current', 'full water', 'فيضان', 'يجري بقوة', 'يرتفع بسرعة']
  const mediumRisk = ['water flowing', 'pooling', 'rising water', 'مياه جارية', 'تجمع مياه', 'مياه مرتفعة']
  const lowRisk = ['wet', 'small water', 'مبلل', 'مياه قليلة']

  if (highRisk.some((word) => normalized.includes(word))) return 50
  if (mediumRisk.some((word) => normalized.includes(word))) return 25
  if (lowRisk.some((word) => normalized.includes(word))) return 10
  return 0
}

// ---------------------------------------------
// FUNCTION: scoreVisionLabels
// PURPOSE: Converts Google Vision labels into a
// weighted image risk score
// ---------------------------------------------
export const scoreVisionLabels = (labels = []) => {
  const weights = {
    flood: 50,
    water: 30,
    river: 20,
    road: 10,
    vehicle: 10,
  }

  return Math.min(
    labels.reduce((total, label) => {
      const normalized = label.toLowerCase()
      const match = Object.entries(weights).find(([key]) => normalized.includes(key))
      return total + (match ? match[1] : 0)
    }, 0),
    60
  )
}

// ---------------------------------------------
// FUNCTION: scoreWeatherRisk
// PURPOSE: Maps rainfall amounts to the shared
// weather contribution used in final scoring
// ---------------------------------------------
export const scoreWeatherRisk = (rainfall = 0) => {
  if (rainfall > 30) return 40
  if (rainfall >= 20) return 30
  if (rainfall >= 10) return 20
  return rainfall > 0 ? 10 : 0
}

// ---------------------------------------------
// FUNCTION: scoreMemoryRisk
// PURPOSE: Applies a supporting memory boost when
// a known wadi or historical match is relevant
// ---------------------------------------------
export const scoreMemoryRisk = ({ nearbyWadi = null, memoryMatch = null } = {}) => {
  let score = 0
  if (nearbyWadi) score += 20
  if (memoryMatch) score += 25
  return Math.min(score, 25)
}

// ---------------------------------------------
// FUNCTION: computeIntelligentRisk
// PURPOSE: Combines image, text, weather, memory,
// and community inputs into the main risk score
// ---------------------------------------------
export const computeIntelligentRisk = ({
  visionLabels = [],
  description = '',
  rainfall = 0,
  nearbyWadi = null,
  memoryMatch = null,
  imagePresent = false,
  communityCount = 0,
  requireWeatherOrMemoryForMedium = false,
}) => {
  const vision = scoreVisionLabels(visionLabels)
  const text = scoreDescriptionRisk(description)
  const weather = scoreWeatherRisk(rainfall)
  const imagePresence = imagePresent ? 10 : 0
  const community = Math.min(communityCount * 10, 20)
  const hasPrimarySignals = vision > 0 || text > 0 || weather > 0 || imagePresence > 0 || community > 0
  const memory = hasPrimarySignals ? scoreMemoryRisk({ nearbyWadi, memoryMatch }) : 0

  let finalScore = Math.min(vision + text + weather + memory + imagePresence + community, 100)

  if (requireWeatherOrMemoryForMedium && weather === 0 && !memoryMatch) {
    finalScore = Math.min(finalScore, 30)
  }

  return {
    vision,
    text,
    weather,
    memory,
    imagePresence,
    community,
    finalScore,
    risk: getRiskLevel(finalScore),
  }
}

// ---------------------------------------------
// FUNCTION: computeEnvironmentalRisk
// PURPOSE: Reuses the shared risk engine for
// weather + memory + community only flows
// ---------------------------------------------
export const computeEnvironmentalRisk = ({
  rainfall = 0,
  nearbyWadi = null,
  memoryMatch = null,
  communityCount = 0,
}) =>
  computeIntelligentRisk({
    rainfall,
    nearbyWadi,
    memoryMatch,
    communityCount,
    imagePresent: false,
  })

// ---------------------------------------------
// FUNCTION: matchHistoricalPattern
// PURPOSE: Finds the closest stored seasonal
// pattern for memory support
// ---------------------------------------------
export const matchHistoricalPattern = (rainfall, imageScore) => {
  const currentMonth = new Date().getMonth() + 1
  let bestMatch = null
  let bestSimilarity = 0

  historicalPatterns.forEach((pattern) => {
    const rainfallSim = 100 - Math.abs(pattern.rainfall - rainfall)
    const imageSim = 100 - Math.abs(pattern.imageRisk - imageScore)
    const monthBonus = Math.abs(pattern.month - currentMonth) <= 1 ? 10 : 0
    const similarity = Math.round(rainfallSim * 0.5 + imageSim * 0.4 + monthBonus)

    if (similarity > bestSimilarity && similarity > 70) {
      bestSimilarity = similarity
      bestMatch = { ...pattern, similarity }
    }
  })

  return bestMatch
}

// ---------------------------------------------
// FUNCTION: getTimeline
// PURPOSE: Returns timeline labels for score-based
// UI displays
// ---------------------------------------------
export const getTimeline = (score, language = 'EN', t = null) => {
  const label = (key, fallback) => (typeof t === 'function' ? t(language, key) : fallback)

  if (score >= 71) {
    return [
      { time: label('now', 'Now'), status: 'red', label: label('highRisk', 'HIGH RISK') },
      { time: label('plus3h', '+3h'), status: 'red', label: label('critical', 'CRITICAL') },
      { time: label('plus6h', '+6h'), status: 'red', label: label('peakFlood', 'PEAK FLOOD') },
    ]
  }
  if (score >= 31) {
    return [
      { time: label('now', 'Now'), status: 'orange', label: label('mediumRisk', 'MEDIUM') },
      { time: label('plus3h', '+3h'), status: 'orange', label: label('caution', 'CAUTION') },
      { time: label('plus6h', '+6h'), status: 'red', label: label('highRisk', 'HIGH RISK') },
    ]
  }

  return [
    { time: label('now', 'Now'), status: 'green', label: label('safe', 'SAFE') },
    { time: label('plus3h', '+3h'), status: 'green', label: label('safe', 'SAFE') },
    { time: label('plus6h', '+6h'), status: 'green', label: label('safe', 'SAFE') },
  ]
}

// ---------------------------------------------
// FUNCTION: buildDynamicExplanation
// PURPOSE: Builds a short human-readable
// explanation from analysis signals
// ---------------------------------------------
export const buildDynamicExplanation = ({
  language = 'EN',
  imageScore = 0,
  currentRainfall = 0,
  nextRainfall = 0,
  laterRainfall = 0,
  memoryMatch = null,
  communityCount = 0,
  noteSignals = null,
}) => {
  const inArabic = language === 'AR'
  const parts = []
  const currentRainLabel = getRainIntensityLabel(currentRainfall, language)
  const futureRainLabel = getRainIntensityLabel(Math.max(nextRainfall, laterRainfall), language)

  if (imageScore > 65) {
    parts.push(inArabic ? 'تم رصد مؤشرات قوية للمياه في الصورة.' : 'Water was strongly detected in the image.')
  } else if (imageScore > 35) {
    parts.push(inArabic ? 'تظهر الصورة مؤشرات متوسطة على تجمع المياه.' : 'The image shows moderate water indicators.')
  } else if (imageScore > 0) {
    parts.push(inArabic ? 'لا تظهر الصورة مؤشرات قوية على المياه.' : 'The image does not show strong water indicators.')
  }

  if (currentRainfall > 0 || nextRainfall > 0 || laterRainfall > 0) {
    const rainTrend =
      laterRainfall > currentRainfall
        ? inArabic
          ? 'ومن المتوقع أن تزداد الأمطار خلال الساعات القادمة.'
          : `${futureRainLabel} is expected over the next 2 hours.`
        : inArabic
          ? 'وتبدو الأمطار مستقرة أو متراجعة في الساعات القادمة.'
          : `Conditions are expected to stay at ${futureRainLabel.toLowerCase()} or ease over the next 2 hours.`

    parts.push(
      inArabic
        ? `الهطول الحالي ${currentRainfall} ملم. ${rainTrend}`
        : `${currentRainLabel} right now (${currentRainfall} mm). ${rainTrend}`
    )
  } else {
    parts.push(
      communityCount > 0 || nextRainfall > 0 || laterRainfall > 0
        ? inArabic
          ? 'لا يوجد مطر حالياً، لكن الخطر مرتفع بسبب تقارير المجتمع القريبة أو الأمطار المتوقعة.'
          : 'There is no rain right now, but nearby community reports still support this assessment.'
        : inArabic
          ? 'لا يوجد مطر حالياً.'
          : 'There is no rain right now.'
    )
  }

  if (communityCount > 0) {
    parts.push(
      inArabic
        ? `تم رصد ${communityCount} تقارير مجتمعية قريبة تدعم هذا التقييم.`
        : `${communityCount} nearby community reports support this assessment.`
    )
  }

  if (noteSignals?.supportsRisk) {
    parts.push(inArabic ? 'ملاحظة المستخدم تشير أيضاً إلى وجود مياه أو فيضان.' : 'The user note also mentions water or flooding.')
  } else if (noteSignals?.suggestsLowRisk) {
    parts.push(inArabic ? 'ملاحظة المستخدم تشير إلى ظروف أكثر هدوءاً.' : 'The user note suggests calmer conditions.')
  }

  if (memoryMatch?.name) {
    parts.push(
      inArabic
        ? `يوجد تطابق مع نمط تاريخي قريب من ${memoryMatch.name}، لكنه عامل داعم فقط.`
        : `A historical pattern matched ${memoryMatch.name}, but it is used only as a supporting factor.`
    )
  }

  return parts.join(' ')
}
