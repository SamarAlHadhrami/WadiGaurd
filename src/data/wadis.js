// ===== WADI DATA =====
// Static data used by the map, memory engine, and route analysis.

// ---------------------------------------------
// DATA: wadis
// PURPOSE: Known wadi locations with descriptive
// information and stored base-risk context
// ---------------------------------------------
export const wadis = [
  {
    id: 1,
    name: 'Wadi Shab',
    nameAr: 'وادي شاب',
    lat: 22.8069,
    lng: 59.2551,
    baseRisk: 81,
    status: 'red',
    description: 'Popular tourist wadi - South Sharqiyah',
    descriptionAr: 'وادٍ سياحي مشهور - جنوب الشرقية',
    historicalEvents: [
      {
        date: 'October 2021',
        rainfall: 47,
        riskScore: 85,
        description: 'Cyclone Shaheen caused severe flooding',
        descriptionAr: 'تسبب إعصار شاهين في فيضانات شديدة',
      },
      {
        date: 'April 2024',
        rainfall: 52,
        riskScore: 90,
        description: 'Flash flood swept vehicles off road',
        descriptionAr: 'جرف سيل مفاجئ مركبات خارج الطريق',
      },
    ],
  },
  {
    id: 2,
    name: 'Wadi Bani Khalid',
    nameAr: 'وادي بني خالد',
    lat: 22.5746,
    lng: 58.9378,
    baseRisk: 45,
    status: 'orange',
    description: 'Famous year-round wadi near Sur',
    descriptionAr: 'وادٍ مشهور طوال العام قرب صور',
    historicalEvents: [
      {
        date: 'January 2020',
        rainfall: 28,
        riskScore: 60,
        description: 'Moderate flooding at entry road',
        descriptionAr: 'فيضانات متوسطة عند طريق الدخول',
      },
    ],
  },
  {
    id: 3,
    name: 'Wadi Al Arbeieen',
    nameAr: 'وادي الأربعين',
    lat: 23.5123,
    lng: 57.8934,
    baseRisk: 15,
    status: 'green',
    description: 'Wadi near Rustaq - usually safe',
    descriptionAr: 'وادٍ قرب الرستاق - غالباً ما يكون آمناً',
    historicalEvents: [],
  },
  {
    id: 4,
    name: 'Wadi Tiwi',
    nameAr: 'وادي طيوي',
    lat: 22.7823,
    lng: 59.3012,
    baseRisk: 62,
    status: 'orange',
    description: 'Scenic wadi - South Sharqiyah',
    descriptionAr: 'وادٍ ذو مناظر خلابة - جنوب الشرقية',
    historicalEvents: [
      {
        date: 'March 2022',
        rainfall: 35,
        riskScore: 70,
        description: 'Road flooded for 6 hours',
        descriptionAr: 'غمرت المياه الطريق لمدة 6 ساعات',
      },
    ],
  },
  {
    id: 5,
    name: 'Wadi Dayqah',
    nameAr: 'وادي ضيقة',
    lat: 22.6234,
    lng: 58.7891,
    baseRisk: 20,
    status: 'green',
    description: 'Wadi with dam near Quriyat',
    descriptionAr: 'وادٍ مع سد قرب قريات',
    historicalEvents: [],
  },
  {
    id: 6,
    name: 'Wadi Aday',
    nameAr: 'وادي عدي',
    lat: 23.6012,
    lng: 58.5234,
    baseRisk: 55,
    status: 'orange',
    description: 'Urban wadi running through Muscat',
    descriptionAr: 'وادٍ حضري يمر عبر مسقط',
    historicalEvents: [
      {
        date: 'April 2006',
        rainfall: 44,
        riskScore: 88,
        description: 'Major flood caused infrastructure damage in Muscat',
        descriptionAr: 'تسبب فيضان كبير في أضرار بالبنية الأساسية في مسقط',
      },
    ],
  },
]

// ---------------------------------------------
// DATA: historicalPatterns
// PURPOSE: Reference flood patterns used by the
// memory engine when matching current conditions
// ---------------------------------------------
export const historicalPatterns = [
  {
    id: 'p1',
    name: 'Cyclone Shaheen 2021',
    nameAr: 'إعصار شاهين 2021',
    rainfall: 47,
    imageRisk: 80,
    month: 10,
    description: 'Cyclone-driven flooding',
    descriptionAr: 'فيضانات ناتجة عن إعصار',
  },
  {
    id: 'p2',
    name: 'April 2024 Gulf Floods',
    nameAr: 'فيضانات الخليج أبريل 2024',
    rainfall: 52,
    imageRisk: 85,
    month: 4,
    description: 'Record rainfall flash flood',
    descriptionAr: 'سيل مفاجئ بسبب أمطار قياسية',
  },
  {
    id: 'p3',
    name: 'April 2006 Muscat',
    nameAr: 'مسقط أبريل 2006',
    rainfall: 44,
    imageRisk: 75,
    month: 4,
    description: 'Severe urban wadi flooding',
    descriptionAr: 'فيضانات حضرية شديدة في الوادي',
  },
]
