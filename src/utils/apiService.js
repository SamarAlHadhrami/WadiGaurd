import axios from 'axios'
import { buildDynamicExplanation } from './riskEngine'
import {
  cacheForecastData,
  cacheWeatherData,
  getCachedForecastData,
  getCachedWeatherData,
} from './cacheService'

// ===== API SERVICES =====
// External service calls for weather, forecast, image analysis, and AI text generation.

// ---------------------------------------------
// FUNCTION: getWeatherData
// PURPOSE: Loads current weather for a coordinate
// and returns safe fallback values on failure
// ---------------------------------------------
export const getWeatherData = async (lat, lng) => {
  try {
    const res = await axios.get(
      `https://api.openweathermap.org/data/2.5/weather` +
        `?lat=${lat}&lon=${lng}` +
        `&appid=${import.meta.env.VITE_OPENWEATHER_KEY}` +
        `&units=metric`
    )
    const weatherData = {
      rainfall: res.data.rain?.['1h'] || res.data.rain?.['3h'] || 0, // fallback if no rain field exists
      description: res.data.weather?.[0]?.description || 'clear sky',
      temp: res.data.main?.temp ?? 29,
      tempMin: res.data.main?.temp_min ?? res.data.main?.temp ?? 27,
      tempMax: res.data.main?.temp_max ?? res.data.main?.temp ?? 31,
      humidity: res.data.main?.humidity ?? 68,
    }
    cacheWeatherData(lat, lng, weatherData)
    return weatherData
  } catch (error) {
    console.error('Weather API failed:', error)
    const cached = getCachedWeatherData(lat, lng)
    if (cached) return cached
    return {
      rainfall: 0,
      description: 'partly cloudy',
      temp: 29,
      tempMin: 27,
      tempMax: 31,
      humidity: 68,
    }
  }
}

// ---------------------------------------------
// FUNCTION: getForecastTimeline
// PURPOSE: Loads the short forecast buckets used
// by scan, route, and voice features
// ---------------------------------------------
export const getForecastTimeline = async (lat, lng) => {
  try {
    const res = await axios.get(
      `https://api.openweathermap.org/data/2.5/forecast` +
        `?lat=${lat}&lon=${lng}` +
        `&appid=${import.meta.env.VITE_OPENWEATHER_KEY}` +
        `&units=metric`
    )

    const list = res.data.list || []
    const entry = (index) => list[index] || list[list.length - 1] || {}

    const forecastData = {
      now: entry(0).rain?.['3h'] || 0,
      plus3h: entry(1).rain?.['3h'] || 0,
      plus6h: entry(2).rain?.['3h'] || 0,
      description: entry(0).weather?.[0]?.description || 'forecast unavailable',
    }
    cacheForecastData(lat, lng, forecastData)
    return forecastData
  } catch (error) {
    console.error('Forecast API failed:', error)
    const cached = getCachedForecastData(lat, lng)
    if (cached) return cached
    return {
      now: 0,
      plus3h: 0,
      plus6h: 0,
      description: 'forecast unavailable',
    }
  }
}

// ---------------------------------------------
// FUNCTION: analyzeImage
// PURPOSE: Preserves the simple image-score helper
// used by older flows
// ---------------------------------------------
export const analyzeImage = async (base64Image) => {
  const result = await analyzeImageSignals(base64Image)
  return result.score
}

// ---------------------------------------------
// FUNCTION: analyzeImageSignals
// PURPOSE: Sends the image to Google Vision and
// converts labels into a weighted image score
// ---------------------------------------------
export const analyzeImageSignals = async (base64Image) => {
  try {
    const res = await axios.post(
      `https://vision.googleapis.com/v1/images:annotate?key=${import.meta.env.VITE_GOOGLE_VISION_KEY}`,
      {
        requests: [
          {
            image: { content: base64Image },
            features: [
              { type: 'LABEL_DETECTION', maxResults: 10 },
              { type: 'IMAGE_PROPERTIES', maxResults: 5 },
            ],
          },
        ],
      }
    )

    const labels = (res.data.responses?.[0]?.labelAnnotations || []).map((label) => label.description)
    const score = labels.reduce((total, label) => {
      const normalized = label.toLowerCase()
      if (normalized.includes('flood')) return total + 50
      if (normalized.includes('water')) return total + 30
      if (normalized.includes('river')) return total + 20
      if (normalized.includes('road')) return total + 10
      if (normalized.includes('vehicle')) return total + 10
      return total
    }, 0)

    return {
      labels,
      score: Math.min(score || 20, 100),
    }
  } catch (error) {
    console.error('Vision API failed:', error)
    return {
      labels: [],
      score: 20,
    }
  }
}

// ---------------------------------------------
// FUNCTION: generateExplanation
// PURPOSE: Legacy wrapper for building a simple
// explanation from existing values
// ---------------------------------------------
export const generateExplanation = async (riskScore, rainfall, memoryMatch, wadiName) =>
  buildDynamicExplanation({
    language: 'EN',
    currentRainfall: rainfall,
    laterRainfall: rainfall,
    memoryMatch: memoryMatch ? { name: memoryMatch.name || wadiName } : null,
    communityCount: riskScore >= 71 ? 1 : 0,
  })

// ---------------------------------------------
// FUNCTION: generateWadiEchoReply
// PURPOSE: Sends structured assistant context to
// Claude for natural-language voice replies
// ---------------------------------------------
export const generateWadiEchoReply = async ({ language = 'EN', query, context }) => {
  const key = import.meta.env.VITE_CLAUDE_KEY

  if (!key) {
    return null
  }

  try {
    const systemPrompt =
      language === 'AR'
        ? 'أنت Wadi Echo، مساعد ذكي للسلامة من الفيضانات في عمان. أجب بالعربية فقط. استخدم بيانات النظام فقط. لا تعرض JSON أو عناوين كاملة. اجعل الرد طبيعيا وبسيطا وواضحا.'
        : 'You are Wadi Echo, a flood-safety assistant for Oman. Reply in English only. Use only the provided system data. Do not output JSON or full addresses. Keep the tone natural, simple, and clear.'

    const styleInstruction =
      language === 'AR'
        ? 'اكتب 3 إلى 4 جمل قصيرة كحد أقصى. اذكر مستوى الخطر النهائي بصيغة مثل 40% (MEDIUM) عند توفره. اذكر حالة المطر الحالية باستخدام فقط: لا يوجد مطر، مطر خفيف، مطر متوسط، مطر غزير. اذكر اتجاه الساعتين القادمتين بصياغة طبيعية. اذكر وجود التقارير المجتمعية القريبة. لا تستخدم تعبيرات آلية أو مبالغ فيها.'
        : 'Write 3 to 4 short sentences max. Include the final risk in a format like 40% (MEDIUM) when available. Mention the current rain using only: No rain, Light rain, Moderate rain, or Heavy rain. Mention the next 2-hour trend in natural wording. Mention nearby community report presence. Avoid robotic wording.'

    const res = await axios.post(
      'https://api.anthropic.com/v1/messages',
      {
        model: 'claude-sonnet-4-20250514',
        max_tokens: 220,
        system: systemPrompt,
        messages: [
          {
            role: 'user',
            content:
              `User query: ${query}\n` +
              `Structured system data:\n${JSON.stringify(context, null, 2)}\n\n` +
              styleInstruction,
          },
        ],
      },
      {
        headers: {
          'x-api-key': key,
          'anthropic-version': '2023-06-01',
          'Content-Type': 'application/json',
          'anthropic-dangerous-direct-browser-access': 'true',
        },
      }
    )

    return res.data?.content?.[0]?.text?.trim() || null
  } catch (error) {
    console.error('Claude WadiEcho reply failed:', error)
    return null
  }
}

// ---------------------------------------------
// FUNCTION: generateRiskExplanation
// PURPOSE: Builds short AI explanations for scan
// and community analysis, with local fallback
// ---------------------------------------------
export const generateRiskExplanation = async ({
  language = 'EN',
  shortLocationName = '',
  visionLabels = [],
  description = '',
  rainfall = 0,
  rainfall1h = 0,
  rainfall2h = 0,
  memoryName = '',
  communityCount = 0,
  riskScore = 0,
}) => {
  const key = import.meta.env.VITE_CLAUDE_KEY

  if (!key) {
    return buildDynamicExplanation({
      language,
      imageScore: visionLabels.length ? Math.min(visionLabels.length * 20, 80) : 0,
      currentRainfall: rainfall,
      nextRainfall: rainfall1h,
      laterRainfall: rainfall2h,
      memoryMatch: memoryName ? { name: memoryName } : null,
      communityCount,
      noteSignals: description ? { supportsRisk: true } : null,
    })
  }

  try {
    const res = await axios.post(
      'https://api.anthropic.com/v1/messages',
      {
        model: 'claude-sonnet-4-20250514',
        max_tokens: 140,
        system:
          language === 'AR'
            ? 'أنت مساعد سلامة من الفيضانات. اكتب شرحا قصيرا وواضحا بالعربية فقط. لا تعرض JSON. استخدم أسلوبا طبيعيا وبسيطا.'
            : 'You are a flood safety assistant. Write a short, clear explanation in English only. Do not output JSON. Use natural, simple wording.',
        messages: [
          {
            role: 'user',
            content:
              JSON.stringify({
                location: shortLocationName,
                visionLabels,
                description,
                rainfall,
                rainfall1h,
                rainfall2h,
                memory: memoryName || null,
                communityReports: communityCount,
                risk: riskScore,
              }) +
              (language === 'AR'
                ? '\nاكتب تفسيرا قصيرا يشرح المطر الحالي، اتجاه الساعتين القادمتين، أثر الذاكرة أو التقارير المجتمعية، ومستوى الخطر النهائي.'
                : '\nWrite a short explanation that covers current rain, the next 2-hour trend, any memory or community impact, and the final risk level.'),
          },
        ],
      },
      {
        headers: {
          'x-api-key': key,
          'anthropic-version': '2023-06-01',
          'Content-Type': 'application/json',
          'anthropic-dangerous-direct-browser-access': 'true',
        },
      }
    )

    return res.data?.content?.[0]?.text?.trim() || ''
  } catch (error) {
    console.error('Claude risk explanation failed:', error)
    return buildDynamicExplanation({
      language,
      imageScore: visionLabels.length ? Math.min(visionLabels.length * 20, 80) : 0,
      currentRainfall: rainfall,
      nextRainfall: rainfall1h,
      laterRainfall: rainfall2h,
      memoryMatch: memoryName ? { name: memoryName } : null,
      communityCount,
      noteSignals: description ? { supportsRisk: true } : null,
    })
  }
}
