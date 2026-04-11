// ===== OMAN REGION DATA =====
// Lightweight governorate polygons used for region-based map overlays.

// ---------------------------------------------
// DATA: omanRegions
// PURPOSE: Simplified GeoJSON-style polygons for
// clean region coloring on the map
// ---------------------------------------------
export const omanRegions = {
  type: 'FeatureCollection',
  features: [
    {
      type: 'Feature',
      properties: { id: 'musandam', name: 'Musandam', center: [26.15, 56.25] },
      geometry: {
        type: 'Polygon',
        coordinates: [[
          [56.00, 25.75],
          [56.55, 25.75],
          [56.75, 26.35],
          [56.35, 26.60],
          [55.95, 26.30],
          [56.00, 25.75],
        ]],
      },
    },
    {
      type: 'Feature',
      properties: { id: 'al_buraimi', name: 'Al Buraimi', center: [24.35, 55.95] },
      geometry: {
        type: 'Polygon',
        coordinates: [[
          [55.45, 23.85],
          [56.35, 23.85],
          [56.45, 24.80],
          [55.70, 24.95],
          [55.45, 23.85],
        ]],
      },
    },
    {
      type: 'Feature',
      properties: { id: 'north_batinah', name: 'North Al Batinah', center: [24.05, 57.05] },
      geometry: {
        type: 'Polygon',
        coordinates: [[
          [56.20, 23.40],
          [57.80, 23.40],
          [57.95, 24.55],
          [56.55, 24.60],
          [56.20, 23.40],
        ]],
      },
    },
    {
      type: 'Feature',
      properties: { id: 'muscat', name: 'Muscat', center: [23.55, 58.45] },
      geometry: {
        type: 'Polygon',
        coordinates: [[
          [57.85, 23.10],
          [58.95, 23.10],
          [59.05, 23.85],
          [58.05, 23.95],
          [57.85, 23.10],
        ]],
      },
    },
    {
      type: 'Feature',
      properties: { id: 'south_batinah', name: 'South Al Batinah', center: [23.35, 57.10] },
      geometry: {
        type: 'Polygon',
        coordinates: [[
          [56.15, 22.45],
          [57.95, 22.45],
          [58.00, 23.45],
          [56.45, 23.35],
          [56.15, 22.45],
        ]],
      },
    },
    {
      type: 'Feature',
      properties: { id: 'ad_dakhiliyah', name: 'Ad Dakhiliyah', center: [22.95, 57.45] },
      geometry: {
        type: 'Polygon',
        coordinates: [[
          [56.45, 21.85],
          [58.35, 21.85],
          [58.55, 23.10],
          [56.85, 23.25],
          [56.45, 21.85],
        ]],
      },
    },
    {
      type: 'Feature',
      properties: { id: 'north_sharqiyah', name: 'North Ash Sharqiyah', center: [22.55, 58.95] },
      geometry: {
        type: 'Polygon',
        coordinates: [[
          [58.10, 21.80],
          [59.65, 21.80],
          [59.85, 23.10],
          [58.55, 23.20],
          [58.10, 21.80],
        ]],
      },
    },
    {
      type: 'Feature',
      properties: { id: 'south_sharqiyah', name: 'South Ash Sharqiyah', center: [21.55, 59.10] },
      geometry: {
        type: 'Polygon',
        coordinates: [[
          [58.30, 20.05],
          [59.95, 20.05],
          [60.15, 22.05],
          [58.65, 22.20],
          [58.30, 20.05],
        ]],
      },
    },
    {
      type: 'Feature',
      properties: { id: 'ad_dhahirah', name: 'Ad Dhahirah', center: [22.60, 56.05] },
      geometry: {
        type: 'Polygon',
        coordinates: [[
          [54.85, 21.10],
          [56.85, 21.10],
          [56.95, 23.05],
          [55.10, 23.20],
          [54.85, 21.10],
        ]],
      },
    },
    {
      type: 'Feature',
      properties: { id: 'al_wusta', name: 'Al Wusta', center: [20.20, 57.45] },
      geometry: {
        type: 'Polygon',
        coordinates: [[
          [55.20, 17.60],
          [59.30, 17.60],
          [59.45, 21.25],
          [55.55, 21.35],
          [55.20, 17.60],
        ]],
      },
    },
    {
      type: 'Feature',
      properties: { id: 'dhofar', name: 'Dhofar', center: [18.65, 54.55] },
      geometry: {
        type: 'Polygon',
        coordinates: [[
          [52.15, 16.55],
          [56.55, 16.55],
          [56.15, 19.55],
          [52.45, 19.30],
          [52.15, 16.55],
        ]],
      },
    },
  ],
}
