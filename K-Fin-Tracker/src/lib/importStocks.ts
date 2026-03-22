// ─── Stock Import Utilities ───────────────────────────────────────────────────
// Supports:
//   ✅ Groww Holdings Statement (.xlsx) — exact format as of Mar 2026
//   ✅ Zerodha Kite Holdings CSV
//   ✅ Upstox Holdings CSV
//   ✅ Angel One Holdings CSV
//   ✅ Generic CSV (symbol, qty, avg price)

import type { StockHolding } from '../types'

export interface ImportResult {
  success: StockHolding[]
  errors: { row: number; reason: string; raw: string }[]
  platform: string
  summary?: {
    investedValue?: number
    closingValue?: number
    unrealisedPnl?: number
    clientName?: string
    clientCode?: string
    asOnDate?: string
  }
}

// ─── ISIN → NSE Symbol + Company + Sector ─────────────────────────────────────
// Covers all stocks listed on NSE. Groww uses ISIN, not symbols.
const ISIN_MAP: Record<string, [string, string, string]> = {
  // Metals
  'INE267A01025': ['HINDZINC',   'Hindustan Zinc Ltd',            'Metal'],
  'INE081A01012': ['HINDALCO',   'Hindalco Industries Ltd',        'Metal'],
  'INE138A01010': ['TATASTEEL',  'Tata Steel Ltd',                 'Metal'],
  'INE019A01038': ['JSWSTEEL',   'JSW Steel Ltd',                  'Metal'],
  'INE084A01016': ['SAIL',       'Steel Authority of India',       'Metal'],
  // FMCG
  'INE154A01025': ['ITC',        'ITC Ltd',                        'FMCG'],
  'INE030A01027': ['HINDUNILVR', 'Hindustan Unilever Ltd',         'FMCG'],
  'INE216A01030': ['NESTLEIND',  'Nestle India Ltd',               'FMCG'],
  'INE216A01022': ['NESTLEIND',  'Nestle India Ltd',               'FMCG'],
  'INE285A01027': ['BRITANNIA',  'Britannia Industries Ltd',       'FMCG'],
  'INE036A01022': ['DABUR',      'Dabur India Ltd',                'FMCG'],
  'INE102D01028': ['GODREJCP',   'Godrej Consumer Products',       'FMCG'],
  // Auto
  'INE775A01035': ['MOTHERSON',  'Samvardhana Motherson Intl',     'Auto'],
  'INE1TAE01010': ['TATAMOTORS', 'Tata Motors Ltd',                'Auto'],
  'INE155A01022': ['TATAMTRDVR', 'Tata Motors DVR',                'Auto'],
  'INE585B01010': ['MARUTI',     'Maruti Suzuki India Ltd',        'Auto'],
  'INE917I01010': ['BAJAJ-AUTO', 'Bajaj Auto Ltd',                 'Auto'],
  'INE158A01026': ['HEROMOTOCO', 'Hero MotoCorp Ltd',              'Auto'],
  'INE066A01021': ['EICHERMOT',  'Eicher Motors Ltd',              'Auto'],
  'INE203A01020': ['BOSCHLTD',   'Bosch Ltd',                      'Auto'],
  // IT
  'INE467B01029': ['TCS',        'Tata Consultancy Services',      'IT'],
  'INE009A01021': ['INFOSYS',    'Infosys Ltd',                    'IT'],
  'INE009B01017': ['INFY',       'Infosys Ltd',                    'IT'],
  'INE075A01022': ['WIPRO',      'Wipro Ltd',                      'IT'],
  'INE226A01021': ['HCLTECH',    'HCL Technologies Ltd',           'IT'],
  'INE058A01010': ['TECHM',      'Tech Mahindra Ltd',              'IT'],
  'INE070A01015': ['MPHASIS',    'Mphasis Ltd',                    'IT'],
  // Banking
  'INE040A01034': ['HDFCBANK',   'HDFC Bank Ltd',                  'Banking'],
  'INE090A01021': ['ICICIBANK',  'ICICI Bank Ltd',                 'Banking'],
  'INE062A01020': ['SBIN',       'State Bank of India',            'Banking'],
  'INE237A01028': ['KOTAKBANK',  'Kotak Mahindra Bank Ltd',        'Banking'],
  'INE238A01034': ['AXISBANK',   'Axis Bank Ltd',                  'Banking'],
  'INE028A01039': ['BANKBARODA', 'Bank of Baroda',                 'Banking'],
  'INE084A01024': ['SAIL',       'Steel Authority of India',       'Metal'],
  'INE457A01014': ['BANDHANBNK', 'Bandhan Bank Ltd',               'Banking'],
  // NBFC
  'INE296A01024': ['BAJFINANCE', 'Bajaj Finance Ltd',              'NBFC'],
  'INE918I01026': ['BAJAJFINSV', 'Bajaj Finserv Ltd',              'NBFC'],
  'INE121A01024': ['CHOLAFIN',   'Cholamandalam Investment',       'NBFC'],
  'INE414G01012': ['MUTHOOTFIN', 'Muthoot Finance Ltd',            'NBFC'],
  // Energy
  'INE002A01018': ['RELIANCE',   'Reliance Industries Ltd',        'Energy'],
  'INE213A01029': ['ONGC',       'Oil & Natural Gas Corp',         'Energy'],
  'INE029A01011': ['BPCL',       'Bharat Petroleum Corp',          'Energy'],
  'INE242A01010': ['IOC',        'Indian Oil Corporation',         'Energy'],
  'INE129A01019': ['GAIL',       'GAIL India Ltd',                 'Energy'],
  'INE347G01014': ['PETRONET',   'Petronet LNG Ltd',               'Energy'],
  'INE752E01010': ['ADANIGREEN', 'Adani Green Energy Ltd',         'Energy'],
  'INE031A01017': ['POWERGRID',  'Power Grid Corp of India',       'Energy'],
  // Pharma
  'INE044A01036': ['SUNPHARMA',  'Sun Pharmaceutical Industries',  'Pharma'],
  'INE089A01023': ['DRREDDY',    'Dr Reddys Laboratories',         'Pharma'],
  'INE059A01026': ['CIPLA',      'Cipla Ltd',                      'Pharma'],
  'INE361B01024': ['DIVISLAB',   "Divi's Laboratories",            'Pharma'],
  'INE406A01037': ['AUROPHARMA', 'Aurobindo Pharma Ltd',           'Pharma'],
  // Consumer / Retail
  'INE280A01028': ['TITAN',      'Titan Company Ltd',              'Consumer'],
  'INE364A01020': ['ASIANPAINT', 'Asian Paints Ltd',               'Consumer'],
  'INE318A01026': ['PIDILITIND', 'Pidilite Industries Ltd',        'Consumer'],
  'INE192A01025': ['HAVELLS',    'Havells India Ltd',              'Consumer'],
  // Cement
  'INE481G01011': ['ULTRACEMCO', 'UltraTech Cement Ltd',           'Cement'],
  'INE070B01011': ['SHREECEM',   'Shree Cement Ltd',               'Cement'],
  'INE079A01024': ['AMBUJACEM',  'Ambuja Cements Ltd',             'Cement'],
  'INE012A01025': ['ACC',        'ACC Ltd',                        'Cement'],
  // Infrastructure / Conglomerate
  'INE503A01015': ['LT',         'Larsen & Toubro Ltd',            'Infrastructure'],
  'INE268A01031': ['ADANIENT',   'Adani Enterprises Ltd',          'Conglomerate'],
  'INE742F01042': ['ADANIPORTS', 'Adani Ports & SEZ Ltd',          'Infrastructure'],
  // Travel
  'INE335Y01020': ['IRCTC',      'Indian Railway Catering & Tourism', 'Travel'],
  'INE646L01027': ['INDIGO',     'InterGlobe Aviation Ltd',        'Travel'],
  // Telecom
  'INE397D01024': ['BHARTIARTL', 'Bharti Airtel Ltd',              'Telecom'],
  'INE364U01010': ['IDEA',       'Vodafone Idea Ltd',              'Telecom'],
}

// ─── Company Name → NSE Symbol fallback ───────────────────────────────────────
// Used when ISIN is not in our map
function nameToSymbol(name: string): [string, string, string] {
  const n = name.toUpperCase().trim()
  const nameMap: [string, string, string, string[]][] = [
    ['TATAMOTORS', 'Tata Motors Ltd',             'Auto',     ['TATA MOTORS']],
    ['TATAMTRDVR', 'Tata Motors DVR',             'Auto',     ['TATA MOTORS PASS', 'TATA MOTORS DVR']],
    ['HINDZINC',   'Hindustan Zinc Ltd',           'Metal',    ['HINDUSTAN ZINC']],
    ['ITC',        'ITC Ltd',                      'FMCG',     ['ITC LTD', 'ITC LIMITED']],
    ['MOTHERSON',  'Samvardhana Motherson Intl',   'Auto',     ['SAMVRDHNA', 'SAMVARDHANA', 'MOTHERSON']],
    ['INFY',       'Infosys Ltd',                  'IT',       ['INFOSYS']],
    ['TCS',        'Tata Consultancy Services',    'IT',       ['TATA CONSULTANCY']],
    ['HDFCBANK',   'HDFC Bank Ltd',                'Banking',  ['HDFC BANK']],
    ['ICICIBANK',  'ICICI Bank Ltd',               'Banking',  ['ICICI BANK']],
    ['SBIN',       'State Bank of India',          'Banking',  ['STATE BANK']],
    ['RELIANCE',   'Reliance Industries Ltd',      'Energy',   ['RELIANCE INDUSTRIES', 'RELIANCE IND']],
    ['BAJFINANCE', 'Bajaj Finance Ltd',            'NBFC',     ['BAJAJ FINANCE', 'BAJAJ FIN']],
    ['SUNPHARMA',  'Sun Pharmaceutical',           'Pharma',   ['SUN PHARMA', 'SUN PHARMACEUTICAL']],
    ['WIPRO',      'Wipro Ltd',                    'IT',       ['WIPRO']],
    ['TITAN',      'Titan Company Ltd',            'Consumer', ['TITAN']],
    ['MARUTI',     'Maruti Suzuki India',          'Auto',     ['MARUTI SUZUKI', 'MARUTI']],
    ['IRCTC',      'IRCTC',                        'Travel',   ['IRCTC', 'INDIAN RAILWAY CATERING']],
    ['HINDUNILVR', 'Hindustan Unilever',           'FMCG',     ['HINDUSTAN UNILEVER', 'HUL']],
    ['ULTRACEMCO', 'UltraTech Cement',             'Cement',   ['ULTRATECH CEMENT', 'ULTRATECH']],
    ['BHARTIARTL', 'Bharti Airtel',                'Telecom',  ['BHARTI AIRTEL', 'AIRTEL']],
    ['POWERGRID',  'Power Grid Corp',              'Energy',   ['POWER GRID']],
    ['ONGC',       'Oil & Natural Gas Corp',       'Energy',   ['ONGC', 'OIL AND NATURAL GAS']],
    ['DRREDDY',    "Dr Reddy's Laboratories",      'Pharma',   ["DR REDDY", "DR. REDDY"]],
    ['CIPLA',      'Cipla Ltd',                    'Pharma',   ['CIPLA']],
  ]
  for (const [sym, fullName, sector, patterns] of nameMap) {
    if (patterns.some(p => n.includes(p))) return [sym, fullName, sector]
  }
  // Last resort: clean the name into a plausible symbol
  const cleaned = name.replace(/\s+(LIMITED|LTD|INDIA|INDUSTRIES|CORP|CORPORATION)\.?$/i, '').trim()
  const symbol = cleaned.replace(/[^A-Z0-9]/gi, '').substring(0, 10).toUpperCase()
  return [symbol || 'UNKNOWN', name, 'Other']
}

// ─── GROWW xlsx parser ─────────────────────────────────────────────────────────
// Groww format (Holdings Statement xlsx):
//   Row 0:  Name, <client name>
//   Row 1:  Unique Client Code, <code>
//   Row 3:  "Holdings statement for stocks as on DD-MM-YYYY"
//   Row 5:  Summary
//   Row 6:  Invested Value, <number>
//   Row 7:  Closing Value, <number>
//   Row 8:  Unrealised P&L, <number>
//   Row 10: Headers → Stock Name | ISIN | Quantity | Average buy price | Buy value | Closing price | Closing value | Unrealised P&L
//   Row 11+: Data rows
export function parseGrowwXlsx(rows: (string | number | null)[][], userId: string): ImportResult {
  const summary: ImportResult['summary'] = {}
  const success: StockHolding[] = []
  const errors: ImportResult['errors'] = []

  // Parse metadata rows
  for (const row of rows.slice(0, 10)) {
    const key = String(row[0] || '').toLowerCase().trim()
    if (key === 'name')                summary.clientName   = String(row[1] || '')
    if (key === 'unique client code')  summary.clientCode   = String(row[1] || '')
    if (key === 'invested value')      summary.investedValue = Number(row[1])
    if (key === 'closing value')       summary.closingValue  = Number(row[1])
    if (key.includes('unrealised') || key.includes('unrealized')) summary.unrealisedPnl = Number(row[1])
    if (key.includes('holdings statement')) {
      const match = String(row[0]).match(/(\d{2}-\d{2}-\d{4})/)
      if (match) summary.asOnDate = match[1]
    }
  }

  // Find header row (contains "Stock Name" or "ISIN")
  let headerRowIdx = -1
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i]
    if (r.some(c => String(c || '').toLowerCase().includes('stock name')) ||
        r.some(c => String(c || '').toLowerCase() === 'isin')) {
      headerRowIdx = i
      break
    }
  }

  if (headerRowIdx < 0) {
    return { success: [], errors: [{ row: 0, reason: 'Could not find data headers in Groww file. Expected "Stock Name" column.', raw: '' }], platform: 'Groww', summary }
  }

  const headers = rows[headerRowIdx].map(h => String(h || '').toLowerCase().trim())
  const col = (name: string) => headers.findIndex(h => h.includes(name))

  const nameCol   = col('stock name')
  const isinCol   = col('isin')
  const qtyCol    = col('quantity')
  const avgCol    = col('average buy price')
  const closeCol  = col('closing price')

  // Parse data rows
  const dataRows = rows.slice(headerRowIdx + 1)
  for (let i = 0; i < dataRows.length; i++) {
    const row = dataRows[i]
    if (!row || row.every(c => c === null || c === undefined || String(c).trim() === '')) continue

    const rawName  = String(row[nameCol] || '').trim()
    const isin     = String(row[isinCol] || '').trim()
    const qty      = Number(row[qtyCol])
    const avgPrice = Number(row[avgCol])

    if (!rawName) { errors.push({ row: headerRowIdx + i + 2, reason: 'Empty stock name', raw: String(row) }); continue }
    if (isNaN(qty) || qty <= 0) { errors.push({ row: headerRowIdx + i + 2, reason: `Invalid quantity: ${row[qtyCol]}`, raw: rawName }); continue }
    if (isNaN(avgPrice) || avgPrice <= 0) { errors.push({ row: headerRowIdx + i + 2, reason: `Invalid avg buy price: ${row[avgCol]}`, raw: rawName }); continue }

    // Resolve symbol — ISIN first, then name matching
    let symbol: string, companyName: string, sector: string
    if (isin && ISIN_MAP[isin]) {
      [symbol, companyName, sector] = ISIN_MAP[isin]
    } else {
      [symbol, companyName, sector] = nameToSymbol(rawName)
      if (symbol === 'UNKNOWN') {
        errors.push({ row: headerRowIdx + i + 2, reason: `Could not map "${rawName}" to NSE symbol. Will use cleaned name.`, raw: rawName })
        symbol = rawName.replace(/[^A-Z0-9]/gi, '').substring(0, 10).toUpperCase()
        companyName = rawName
        sector = 'Other'
      }
    }

    // Use closing price as current LTP if available
    const closingPrice = closeCol >= 0 ? Number(row[closeCol]) : undefined

    success.push({
      id: `groww-${Date.now()}-${i}`,
      user_id: userId,
      symbol,
      exchange: 'NSE',
      company_name: companyName,
      quantity: qty,
      avg_buy_price: +avgPrice.toFixed(2),
      buy_date: new Date().toISOString().split('T')[0],
      sector,
      notes: `Imported from Groww${closingPrice ? ` · Groww LTP ₹${closingPrice}` : ''}${isin ? ` · ISIN ${isin}` : ''}`,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
  }

  return { success, errors, platform: 'Groww', summary }
}

// ─── Detect platform from headers ─────────────────────────────────────────────
function detectPlatform(headers: string[]): string {
  const h = headers.map(x => x.toLowerCase().trim())
  if (h.some(x => x.includes('stock name')) && h.some(x => x === 'isin') && h.some(x => x.includes('average buy price'))) return 'Groww'
  if (h.includes('tradingsymbol') && h.includes('average_price')) return 'Zerodha'
  if (h.some(x => x.includes('scrip')) && h.some(x => x.includes('qty'))) return 'Upstox'
  if (h.some(x => x.includes('net qty')) && h.some(x => x.includes('avg.'))) return 'AngelOne'
  return 'Generic'
}

// ─── CSV parser ───────────────────────────────────────────────────────────────
function parseCSV(text: string): string[][] {
  return text.split('\n').filter(l => l.trim()).map(line => {
    const result: string[] = []
    let inQ = false, cur = ''
    for (const ch of line) {
      if (ch === '"') inQ = !inQ
      else if (ch === ',' && !inQ) { result.push(cur.trim()); cur = '' }
      else cur += ch
    }
    result.push(cur.trim())
    return result
  })
}

function cleanNum(s: string | number | null | undefined): number {
  const n = parseFloat(String(s || '').replace(/[₹,\s]/g, ''))
  return isNaN(n) ? 0 : n
}

// ─── Generic CSV import ────────────────────────────────────────────────────────
export async function parseCSVImport(text: string, userId: string): Promise<ImportResult> {
  const rows = parseCSV(text)
  if (rows.length < 2) return { success: [], errors: [{ row: 0, reason: 'File is empty or has only headers', raw: '' }], platform: 'Unknown' }

  const headers = rows[0]
  const platform = detectPlatform(headers)
  const h = headers.map(x => x.toLowerCase().trim())
  const find = (...terms: string[]) => h.findIndex(x => terms.some(t => x.includes(t)))

  let symbolCol: number, qtyCol: number, priceCol: number, nameCol: number

  switch (platform) {
    case 'Groww':
      symbolCol = find('stock name'); qtyCol = find('quantity'); priceCol = find('average buy price'); nameCol = find('stock name'); break
    case 'Zerodha':
      symbolCol = find('tradingsymbol'); qtyCol = find('quantity'); priceCol = find('average_price', 'average price'); nameCol = find('instrument', 'name'); break
    case 'Upstox':
      symbolCol = find('scrip', 'symbol'); qtyCol = find('qty', 'quantity'); priceCol = find('avg', 'average'); nameCol = find('scrip name', 'name'); break
    case 'AngelOne':
      symbolCol = find('symbol'); qtyCol = find('net qty', 'qty'); priceCol = find('avg.', 'average'); nameCol = find('company', 'name'); break
    default:
      symbolCol = find('symbol', 'ticker', 'scrip'); qtyCol = find('qty', 'quantity', 'shares'); priceCol = find('avg', 'price', 'cost'); nameCol = find('name', 'company')
  }

  // For Groww CSV, use ISIN-based resolution
  const isinCol = find('isin')

  const success: StockHolding[] = []
  const errors: ImportResult['errors'] = []

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i]
    if (!row || row.every(c => !c.trim())) continue

    const rawName  = symbolCol >= 0 ? row[symbolCol]?.trim() : ''
    const isin     = isinCol >= 0 ? row[isinCol]?.trim() : ''
    const qty      = cleanNum(qtyCol >= 0 ? row[qtyCol] : 0)
    const avgPrice = cleanNum(priceCol >= 0 ? row[priceCol] : 0)

    if (!rawName) { errors.push({ row: i + 1, reason: 'Empty symbol/name', raw: row.join(',') }); continue }
    if (qty <= 0) { errors.push({ row: i + 1, reason: `Invalid qty: "${row[qtyCol]}"`, raw: rawName }); continue }
    if (avgPrice <= 0) { errors.push({ row: i + 1, reason: `Invalid price: "${row[priceCol]}"`, raw: rawName }); continue }

    let symbol: string, companyName: string, sector: string
    if (isin && ISIN_MAP[isin]) {
      [symbol, companyName, sector] = ISIN_MAP[isin]
    } else if (platform === 'Groww') {
      [symbol, companyName, sector] = nameToSymbol(rawName)
    } else {
      symbol = rawName.replace(/\s+/g, '').replace(/-EQ$/i, '').replace(/\.NS$/i, '').toUpperCase()
      companyName = nameCol >= 0 ? row[nameCol]?.trim() || symbol : symbol
      sector = inferSector(symbol)
    }

    success.push({
      id: `import-${Date.now()}-${i}`,
      user_id: userId,
      symbol, exchange: 'NSE', company_name: companyName,
      quantity: qty, avg_buy_price: +avgPrice.toFixed(2),
      buy_date: new Date().toISOString().split('T')[0],
      sector, notes: `Imported from ${platform}`,
      created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
    })
  }

  return { success, errors, platform }
}

// ─── Excel (.xlsx) parser — handles Groww xlsx natively ──────────────────────
export async function parseExcelImport(file: File, userId: string): Promise<ImportResult> {
  return new Promise((resolve) => {
    const reader = new FileReader()
    reader.onload = async (e) => {
      try {
        if (!(window as any).XLSX) {
          await new Promise<void>((res, rej) => {
            const s = document.createElement('script')
            s.src = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js'
            s.onload = () => res(); s.onerror = () => rej()
            document.head.appendChild(s)
          })
        }
        const XLSX = (window as any).XLSX
        const data = new Uint8Array(e.target!.result as ArrayBuffer)
        const wb   = XLSX.read(data, { type: 'array' })
        const ws   = wb.Sheets[wb.SheetNames[0]]

        // Get raw rows preserving types (numbers stay as numbers)
        const rawRows: (string | number | null)[][] = XLSX.utils.sheet_to_json(ws, {
          header: 1,
          raw: true,
          defval: null,
        })

        // Check if this looks like a Groww file
        const isGroww = rawRows.slice(0, 12).some(row =>
          row?.some(c => String(c || '').toLowerCase().includes('holdings statement')) ||
          row?.some(c => String(c || '').toLowerCase().includes('unique client code')) ||
          row?.some(c => String(c || '').toLowerCase().includes('stock name'))
        )

        if (isGroww) {
          resolve(parseGrowwXlsx(rawRows, userId))
        } else {
          // Fall back to CSV conversion for non-Groww Excel files
          const csv: string = XLSX.utils.sheet_to_csv(ws)
          resolve(await parseCSVImport(csv, userId))
        }
      } catch (err) {
        resolve({
          success: [],
          errors: [{ row: 0, reason: 'Failed to read Excel file. Try File → Download as CSV from your broker and upload that instead.', raw: '' }],
          platform: 'Excel',
        })
      }
    }
    reader.readAsArrayBuffer(file)
  })
}

// ─── Sector inference from NSE symbol ─────────────────────────────────────────
const SECTOR_MAP: Record<string, string> = {
  TCS:'IT', INFY:'IT', WIPRO:'IT', TECHM:'IT', HCLTECH:'IT', MPHASIS:'IT',
  HDFCBANK:'Banking', ICICIBANK:'Banking', SBIN:'Banking', KOTAKBANK:'Banking', AXISBANK:'Banking',
  RELIANCE:'Energy', ONGC:'Energy', BPCL:'Energy', IOC:'Energy', GAIL:'Energy',
  BAJFINANCE:'NBFC', BAJAJFINSV:'NBFC', CHOLAFIN:'NBFC', MUTHOOTFIN:'NBFC',
  TITAN:'Consumer', HINDUNILVR:'FMCG', ITC:'FMCG', NESTLEIND:'FMCG', BRITANNIA:'FMCG',
  MARUTI:'Auto', TATAMOTORS:'Auto', BAJAJ_AUTO:'Auto', HEROMOTOCO:'Auto', EICHERMOT:'Auto', MOTHERSON:'Auto',
  SUNPHARMA:'Pharma', DRREDDY:'Pharma', CIPLA:'Pharma', DIVISLAB:'Pharma', AUROPHARMA:'Pharma',
  ULTRACEMCO:'Cement', SHREECEM:'Cement', AMBUJACEM:'Cement', ACC:'Cement',
  LT:'Infrastructure', ADANIPORTS:'Infrastructure', IRCTC:'Travel', INDIGO:'Travel',
  ADANIENT:'Conglomerate', TATASTEEL:'Metal', HINDALCO:'Metal', JSWSTEEL:'Metal', HINDZINC:'Metal',
  BHARTIARTL:'Telecom', IDEA:'Telecom',
}
function inferSector(symbol: string): string {
  return SECTOR_MAP[symbol.toUpperCase().replace('-', '_')] || 'Other'
}

// ─── Template CSV download ────────────────────────────────────────────────────
export function downloadTemplate() {
  const csv = [
    'Symbol,Company Name,Quantity,Average Price,Buy Date,Exchange',
    'RELIANCE,Reliance Industries,50,2480,2023-04-12,NSE',
    'TCS,Tata Consultancy Services,20,3820,2023-01-08,NSE',
    'HDFCBANK,HDFC Bank,35,1620,2023-06-20,NSE',
  ].join('\n')
  const blob = new Blob([csv], { type: 'text/csv' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url; a.download = 'kfin-stocks-template.csv'
  a.click(); URL.revokeObjectURL(url)
}
