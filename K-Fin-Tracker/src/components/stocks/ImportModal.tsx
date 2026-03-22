import { useState, useRef, useCallback } from 'react'
import { parseCSVImport, parseExcelImport, downloadTemplate } from '../../lib/importStocks'
import type { StockHolding } from '../../types'

interface Props {
  onClose: () => void
  onImport: (holdings: StockHolding[]) => void
}

type Step = 'upload' | 'preview' | 'done'
type TabId = 'file' | 'groww' | 'zerodha' | 'upstox' | 'cas'

const PLATFORMS = [
  {
    id: 'groww' as TabId,
    name: 'Groww',
    color: '#00D09C',
    steps: [
      'Open Groww app or website',
      'Go to Portfolio → Holdings',
      'Tap the ⬇ Download / Export button (top right)',
      'Save the CSV file and upload it here',
    ],
    note: 'Groww exports: Symbol, Name, Quantity, Average Price, LTP',
  },
  {
    id: 'zerodha' as TabId,
    name: 'Zerodha',
    color: '#FF5722',
    steps: [
      'Go to console.zerodha.com',
      'Navigate to Portfolio → Holdings',
      'Click Download as CSV (top right)',
      'Upload the downloaded file here',
    ],
    note: 'Zerodha exports: Tradingsymbol, Quantity, Average_price',
  },
  {
    id: 'upstox' as TabId,
    name: 'Upstox',
    color: '#5367FF',
    steps: [
      'Open Upstox app or web',
      'Go to Portfolio → Holdings',
      'Tap Export / Download icon',
      'Upload the CSV file here',
    ],
    note: 'Upstox exports: Scrip Name, Qty, Avg. Price',
  },
  {
    id: 'cas' as TabId,
    name: 'CDSL / NSDL',
    color: '#1E40AF',
    steps: [
      'Go to mycas.in or nsdlcas.com',
      'Login with your PAN + OTP',
      'Generate Consolidated Account Statement',
      'Download CSV and upload here',
    ],
    note: 'CAS covers all your holdings across all brokers in one file',
  },
]

export default function ImportModal({ onClose, onImport }: Props) {
  const [step,      setStep]      = useState<Step>('upload')
  const [activeTab, setActiveTab] = useState<TabId>('file')
  const [dragging,  setDragging]  = useState(false)
  const [parsing,   setParsing]   = useState(false)
  const [result,    setResult]    = useState<{ success: StockHolding[]; errors: { row: number; reason: string; raw: string }[]; platform: string } | null>(null)
  const [selected,  setSelected]  = useState<Set<string>>(new Set())
  const fileRef = useRef<HTMLInputElement>(null)

  const processFile = useCallback(async (file: File) => {
    setParsing(true)
    try {
      const isExcel = file.name.endsWith('.xlsx') || file.name.endsWith('.xls')
      const res = isExcel
        ? await parseExcelImport(file, 'demo')
        : await parseCSVImport(await file.text(), 'demo')
      setResult(res)
      setSelected(new Set(res.success.map(h => h.id)))
      setStep('preview')
    } catch {
      alert('Failed to read file. Please try a CSV format.')
    } finally {
      setParsing(false)
    }
  }, [])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault(); setDragging(false)
    const file = e.dataTransfer.files[0]
    if (file) processFile(file)
  }, [processFile])

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) processFile(file)
  }

  const handleImport = () => {
    if (!result) return
    const toImport = result.success.filter(h => selected.has(h.id))
    onImport(toImport)
    setStep('done')
  }

  const toggleAll = () => {
    if (!result) return
    if (selected.size === result.success.length) setSelected(new Set())
    else setSelected(new Set(result.success.map(h => h.id)))
  }

  const s: Record<string, React.CSSProperties> = {
    overlay:    { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 20 },
    modal:      { background: 'var(--bg-primary)', border: '1px solid var(--border-hover)', borderRadius: 22, width: '100%', maxWidth: 640, maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 24px 48px rgba(0,0,0,0.3)', display: 'flex', flexDirection: 'column' },
    head:       { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '20px 22px 0' },
    body:       { padding: '18px 22px', flex: 1, display: 'flex', flexDirection: 'column', gap: 16 },
    foot:       { padding: '0 22px 20px', display: 'flex', gap: 8, justifyContent: 'flex-end' },
    tab:        { padding: '7px 14px', borderRadius: 99, fontSize: 12.5, fontWeight: 500, cursor: 'pointer', border: '1px solid transparent', background: 'transparent', fontFamily: 'var(--font)', color: 'var(--text-secondary)', transition: 'all .12s' },
    tabOn:      { background: 'var(--brand-pale)', borderColor: 'var(--border-hover)', color: 'var(--brand)' },
    dropzone:   { border: `2px dashed ${dragging ? 'var(--brand)' : 'var(--border-hover)'}`, borderRadius: 16, padding: '40px 24px', textAlign: 'center' as const, cursor: 'pointer', background: dragging ? 'var(--brand-pale)' : 'var(--bg-tertiary)', transition: 'all .15s' },
    btnPri:     { padding: '9px 20px', borderRadius: 10, border: 'none', background: 'var(--brand)', color: '#fff', fontSize: 13.5, fontWeight: 600, fontFamily: 'var(--font)', cursor: 'pointer' },
    btnSec:     { padding: '9px 20px', borderRadius: 10, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-secondary)', fontSize: 13.5, fontWeight: 600, fontFamily: 'var(--font)', cursor: 'pointer' },
    stepNum:    { width: 20, height: 20, borderRadius: '50%', background: 'var(--brand-pale)', color: 'var(--brand)', fontSize: 10.5, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
    closeBtn:   { width: 28, height: 28, borderRadius: 8, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-tertiary)', cursor: 'pointer', fontSize: 14, display: 'flex', alignItems: 'center', justifyContent: 'center' },
  }

  return (
    <div style={s.overlay} onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={s.modal}>

        {/* Head */}
        <div style={s.head}>
          <div>
            <h3 style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)' }}>
              {step === 'upload' ? 'Import Holdings' : step === 'preview' ? `Preview — ${result?.success.length} stocks found` : '✓ Import Complete'}
            </h3>
            {step === 'upload' && <p style={{ fontSize: 12, color: 'var(--text-tertiary)', marginTop: 3 }}>Supports Groww, Zerodha, Upstox, Angel One, CDSL, and any generic CSV</p>}
          </div>
          <button style={s.closeBtn} onClick={onClose}>✕</button>
        </div>

        {/* ── UPLOAD STEP ── */}
        {step === 'upload' && (
          <div style={s.body}>

            {/* Platform tabs */}
            <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
              <button style={{ ...s.tab, ...(activeTab === 'file' ? s.tabOn : {}) }} onClick={() => setActiveTab('file')}>📁 Upload File</button>
              {PLATFORMS.map(p => (
                <button key={p.id} style={{ ...s.tab, ...(activeTab === p.id ? { ...s.tabOn, background: p.color + '18', borderColor: p.color + '60', color: p.color } : {}) }} onClick={() => setActiveTab(p.id)}>
                  {p.name}
                </button>
              ))}
            </div>

            {/* File upload zone */}
            {activeTab === 'file' && (
              <>
                <div style={s.dropzone}
                  onDrop={handleDrop}
                  onDragOver={e => { e.preventDefault(); setDragging(true) }}
                  onDragLeave={() => setDragging(false)}
                  onClick={() => fileRef.current?.click()}
                >
                  <input ref={fileRef} type="file" accept=".csv,.xlsx,.xls" style={{ display: 'none' }} onChange={handleFileInput} />
                  {parsing ? (
                    <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                      <div style={{ fontSize: 32, marginBottom: 10, animation: 'spin .8s linear infinite', display: 'inline-block' }}>⚙</div>
                      <div>Parsing your file…</div>
                    </div>
                  ) : (
                    <>
                      <div style={{ fontSize: 40, marginBottom: 12 }}>📂</div>
                      <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 6 }}>Drop your CSV or Excel file here</div>
                      <div style={{ fontSize: 12.5, color: 'var(--text-tertiary)', marginBottom: 14 }}>or click to browse · Supports .csv, .xlsx, .xls</div>
                      <button style={{ ...s.btnPri, fontSize: 12.5 }} onClick={e => { e.stopPropagation(); fileRef.current?.click() }}>Choose File</button>
                    </>
                  )}
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
                  <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>don't have a file?</span>
                  <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
                </div>

                <button onClick={downloadTemplate} style={{ ...s.btnSec, textAlign: 'center' as const, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, width: '100%' }}>
                  ⬇ Download Template CSV
                </button>
              </>
            )}

            {/* Platform-specific instructions */}
            {activeTab !== 'file' && (() => {
              const p = PLATFORMS.find(x => x.id === activeTab)!
              return (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                  <div style={{ background: 'var(--bg-tertiary)', borderRadius: 12, padding: 16, border: `1px solid ${p.color}30` }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 12 }}>
                      How to export from {p.name}
                    </div>
                    {p.steps.map((step, i) => (
                      <div key={i} style={{ display: 'flex', gap: 10, marginBottom: 10, alignItems: 'flex-start' }}>
                        <div style={{ ...s.stepNum, background: p.color + '20', color: p.color }}>{i + 1}</div>
                        <span style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.5 }}>{step}</span>
                      </div>
                    ))}
                    <div style={{ fontSize: 11.5, color: 'var(--text-muted)', marginTop: 8, padding: '8px 10px', background: 'var(--bg-primary)', borderRadius: 8 }}>
                      ℹ {p.note}
                    </div>
                  </div>

                  {/* Upload zone for platform tab */}
                  <div style={{ ...s.dropzone, padding: 24 }}
                    onDrop={handleDrop}
                    onDragOver={e => { e.preventDefault(); setDragging(true) }}
                    onDragLeave={() => setDragging(false)}
                    onClick={() => fileRef.current?.click()}
                  >
                    <input ref={fileRef} type="file" accept=".csv,.xlsx,.xls" style={{ display: 'none' }} onChange={handleFileInput} />
                    {parsing
                      ? <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>Parsing…</div>
                      : <>
                          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 8 }}>Upload {p.name} export file</div>
                          <button style={{ ...s.btnPri, fontSize: 12.5, background: p.color }} onClick={e => { e.stopPropagation(); fileRef.current?.click() }}>Choose {p.name} File</button>
                        </>
                    }
                  </div>

                  {/* Groww API note */}
                  {activeTab === 'groww' && (
                    <div style={{ padding: '12px 14px', background: 'var(--gold-bg)', border: '1px solid rgba(245,158,11,0.2)', borderRadius: 10, fontSize: 12.5, color: 'var(--gold)', lineHeight: 1.7 }}>
                      <strong>Why no direct Groww connect?</strong><br/>
                      Groww, Zerodha, and all Indian brokers do not provide a public API for third-party apps. This is a SEBI regulation to protect your account. The CSV export is the official and safest method. Your data never leaves your device until you explicitly upload it.
                    </div>
                  )}
                </div>
              )
            })()}
          </div>
        )}

        {/* ── PREVIEW STEP ── */}
        {step === 'preview' && result && (
          <div style={s.body}>
            {/* Platform badge */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontSize: 12, fontWeight: 600, padding: '3px 10px', borderRadius: 99, background: 'var(--pos-bg)', color: 'var(--pos)' }}>
                ✓ Detected: {result.platform}
              </span>
              <span style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>{result.success.length} stocks · {result.errors.length} skipped</span>
              <button onClick={toggleAll} style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--brand)', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'var(--font)', fontWeight: 600 }}>
                {selected.size === result.success.length ? 'Deselect all' : 'Select all'}
              </button>
            </div>

            {/* Preview table */}
            <div style={{ border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden', maxHeight: 320, overflowY: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: 'var(--bg-tertiary)' }}>
                    {['', 'Symbol', 'Company', 'Qty', 'Avg Price', 'Sector', 'Buy Date'].map(h => (
                      <th key={h} style={{ textAlign: 'left', padding: '8px 12px', fontSize: 10.5, fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.07em', whiteSpace: 'nowrap', borderBottom: '1px solid var(--border)' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {result.success.map(h => (
                    <tr key={h.id} style={{ opacity: selected.has(h.id) ? 1 : 0.4, transition: 'opacity .1s' }}
                      onClick={() => setSelected(prev => { const s = new Set(prev); s.has(h.id) ? s.delete(h.id) : s.add(h.id); return s })}
                    >
                      <td style={{ padding: '8px 12px', borderBottom: '1px solid var(--border)', cursor: 'pointer' }}>
                        <div style={{ width: 16, height: 16, borderRadius: 4, border: `2px solid ${selected.has(h.id) ? 'var(--brand)' : 'var(--border)'}`, background: selected.has(h.id) ? 'var(--brand)' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          {selected.has(h.id) && <span style={{ color: '#fff', fontSize: 10, fontWeight: 700 }}>✓</span>}
                        </div>
                      </td>
                      <td style={{ padding: '8px 12px', borderBottom: '1px solid var(--border)' }}>
                        <span style={{ fontFamily: 'var(--font)', fontSize: 12, fontWeight: 600, background: 'var(--bg-tertiary)', color: 'var(--brand)', padding: '1px 6px', borderRadius: 5 }}>{h.symbol}</span>
                      </td>
                      <td style={{ padding: '8px 12px', borderBottom: '1px solid var(--border)', fontSize: 12.5, color: 'var(--text-secondary)', maxWidth: 150, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{h.company_name}</td>
                      <td style={{ padding: '8px 12px', borderBottom: '1px solid var(--border)', fontFamily: 'var(--font)', fontSize: 12.5, textAlign: 'right' }}>{h.quantity}</td>
                      <td style={{ padding: '8px 12px', borderBottom: '1px solid var(--border)', fontFamily: 'var(--font)', fontSize: 12.5, textAlign: 'right' }}>₹{h.avg_buy_price.toLocaleString('en-IN')}</td>
                      <td style={{ padding: '8px 12px', borderBottom: '1px solid var(--border)' }}>
                        <span style={{ fontSize: 10.5, padding: '1px 7px', borderRadius: 99, background: 'var(--brand-pale)', color: 'var(--brand)' }}>{h.sector}</span>
                      </td>
                      <td style={{ padding: '8px 12px', borderBottom: '1px solid var(--border)', fontFamily: 'var(--font)', fontSize: 11.5, color: 'var(--text-tertiary)' }}>{h.buy_date}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Errors */}
            {result.errors.length > 0 && (
              <div style={{ background: 'var(--neg-bg)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 10, padding: '10px 14px' }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--neg)', marginBottom: 6 }}>{result.errors.length} rows skipped</div>
                {result.errors.slice(0, 3).map(e => (
                  <div key={e.row} style={{ fontSize: 11.5, color: 'var(--neg)', opacity: 0.8, marginBottom: 2 }}>Row {e.row}: {e.reason}</div>
                ))}
                {result.errors.length > 3 && <div style={{ fontSize: 11, color: 'var(--neg)', opacity: 0.6 }}>…and {result.errors.length - 3} more</div>}
              </div>
            )}

            <div style={s.foot}>
              <button style={s.btnSec} onClick={() => setStep('upload')}>← Back</button>
              <button style={{ ...s.btnPri, opacity: selected.size === 0 ? 0.4 : 1 }} onClick={handleImport} disabled={selected.size === 0}>
                Import {selected.size} Stock{selected.size !== 1 ? 's' : ''}
              </button>
            </div>
          </div>
        )}

        {/* ── DONE STEP ── */}
        {step === 'done' && (
          <div style={{ ...s.body, alignItems: 'center', textAlign: 'center', padding: '40px 22px' }}>
            <div style={{ fontSize: 56 }}>🎉</div>
            <h3 style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-primary)' }}>Import Successful!</h3>
            <p style={{ fontSize: 14, color: 'var(--text-secondary)' }}>Your holdings have been added. Live prices will load shortly.</p>
            <button style={{ ...s.btnPri, marginTop: 8 }} onClick={onClose}>Done</button>
          </div>
        )}
      </div>
    </div>
  )
}
