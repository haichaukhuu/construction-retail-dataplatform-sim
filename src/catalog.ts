export interface Product { sku: string; description: string; category: string; bulky: 0 | 1; kg: number; price: number }

export const PRODUCTS: Product[] = [
  { sku: 'SKU-PLY-18-2440', description: 'Plywood 18 mm 2440x1220', category: 'timber', bulky: 1, kg: 28, price: 42.9 },
  { sku: 'SKU-OSB-12-2440', description: 'OSB board 12 mm 2440x1220', category: 'timber', bulky: 1, kg: 19, price: 21.5 },
  { sku: 'SKU-TMB-45x95-4800', description: 'Construction timber C24 45x95 4.8 m', category: 'timber', bulky: 1, kg: 19, price: 14.5 },
  { sku: 'SKU-TMB-45x145-4800', description: 'Construction timber C24 45x145 4.8 m', category: 'timber', bulky: 1, kg: 29, price: 22.9 },
  { sku: 'SKU-DECK-28x120-3600', description: 'Pressure-treated decking 28x120 3.6 m', category: 'timber', bulky: 1, kg: 11, price: 18.2 },
  { sku: 'SKU-INS-MW-145', description: 'Mineral wool insulation 145 mm pack', category: 'insulation', bulky: 1, kg: 12, price: 38.0 },
  { sku: 'SKU-INS-PIR-100', description: 'PIR insulation board 100 mm', category: 'insulation', bulky: 1, kg: 6, price: 33.5 },
  { sku: 'SKU-GYP-13-2600', description: 'Plasterboard 13 mm 2600x1200', category: 'boards', bulky: 1, kg: 24, price: 7.9 },
  { sku: 'SKU-GYP-WET-13', description: 'Moisture-resistant plasterboard 13 mm', category: 'boards', bulky: 1, kg: 25, price: 11.4 },
  { sku: 'SKU-CMT-25', description: 'Cement 25 kg bag', category: 'masonry', bulky: 1, kg: 25, price: 6.5 },
  { sku: 'SKU-CON-BLK-200', description: 'Lightweight concrete block 200 mm', category: 'masonry', bulky: 1, kg: 14, price: 3.2 },
  { sku: 'SKU-BRK-STD', description: 'Facing brick, standard', category: 'masonry', bulky: 1, kg: 2.6, price: 0.9 },
  { sku: 'SKU-ROOF-TILE-CON', description: 'Concrete roof tile', category: 'roofing', bulky: 1, kg: 4.5, price: 2.1 },
  { sku: 'SKU-ROOF-FELT-15', description: 'Roofing felt 15 m roll', category: 'roofing', bulky: 1, kg: 17, price: 48.0 },
  { sku: 'SKU-LAD-ALU-3x8', description: 'Aluminium extension ladder 3x8', category: 'tools', bulky: 1, kg: 14, price: 219 },
  { sku: 'SKU-DRL-18V', description: 'Cordless drill 18V', category: 'tools', bulky: 0, kg: 1.6, price: 129 },
  { sku: 'SKU-SAW-CIRC-1400', description: 'Circular saw 1400 W', category: 'tools', bulky: 0, kg: 4.2, price: 149 },
  { sku: 'SKU-SCR-5x60-200', description: 'Wood screws 5x60 (200 pcs)', category: 'fasteners', bulky: 0, kg: 0.8, price: 8.9 },
  { sku: 'SKU-NAIL-3x75-1KG', description: 'Nails 3x75, 1 kg', category: 'fasteners', bulky: 0, kg: 1, price: 5.4 },
  { sku: 'SKU-PNT-WHT-10L', description: 'Interior paint white 10 L', category: 'paint', bulky: 0, kg: 12, price: 59 },
  { sku: 'SKU-PNT-FAS-10L', description: 'Facade paint 10 L', category: 'paint', bulky: 0, kg: 13, price: 79 },
  { sku: 'SKU-LED-DWN-5', description: 'LED downlight 5-pack', category: 'electrical', bulky: 0, kg: 1, price: 34 },
  { sku: 'SKU-SIL-310', description: 'Silicone sealant 310 ml', category: 'chemicals', bulky: 0, kg: 0.4, price: 6.9 },
  { sku: 'SKU-GLV-PRO', description: 'Work gloves, pro', category: 'safety', bulky: 0, kg: 0.2, price: 9.5 },
];

export const CITIES: { name: string; lat: number; lon: number; zip: string }[] = [
  { name: 'Jönköping', lat: 57.78, lon: 14.16, zip: '553' }, { name: 'Göteborg', lat: 57.71, lon: 11.97, zip: '411' },
  { name: 'Stockholm', lat: 59.33, lon: 18.07, zip: '111' }, { name: 'Malmö', lat: 55.6, lon: 13.0, zip: '211' },
  { name: 'Linköping', lat: 58.41, lon: 15.62, zip: '582' }, { name: 'Örebro', lat: 59.27, lon: 15.21, zip: '702' },
  { name: 'Västerås', lat: 59.61, lon: 16.55, zip: '722' }, { name: 'Helsingborg', lat: 56.05, lon: 12.69, zip: '252' },
  { name: 'Norrköping', lat: 58.59, lon: 16.18, zip: '602' }, { name: 'Borås', lat: 57.72, lon: 12.94, zip: '503' },
  { name: 'Växjö', lat: 56.88, lon: 14.81, zip: '352' }, { name: 'Halmstad', lat: 56.67, lon: 12.86, zip: '302' },
];

export const CARRIERS = [
  { id: 'CAR-01', name: 'NordLast Transport', integration: 'API', rating: 0.93, prefix: 'NL', weight: 45 },
  { id: 'CAR-02', name: 'Svea Frakt', integration: 'WEBHOOK', rating: 0.88, prefix: 'SF', weight: 35 },
  { id: 'CAR-03', name: 'Kranbil Syd', integration: 'CSV', rating: 0.79, prefix: 'KS', weight: 20 },
] as const;

export const B2B_ACCESS = [
  'Gate code 4411, crane truck needed', 'Deliver to rear entrance', 'Call site manager 30 min before arrival',
  'Narrow access road, max 12 m vehicle', 'Unload with forklift on site', null,
];
export const B2C_ACCESS = ['Leave at front door', 'Call on arrival', null, null];
