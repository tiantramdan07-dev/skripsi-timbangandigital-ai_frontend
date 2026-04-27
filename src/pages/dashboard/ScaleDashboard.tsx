import React, { useEffect, useState, useCallback } from 'react'
import CameraClient from '../../components/CameraClient'
import ModalNotifikasi, { ModalStatus } from '../../components/modal/ModalNotifikasi'
import { API_URL, apiFetch, getToken } from '../../utils/api'

interface Produk {
  kode_produk:  number
  nama_produk:  string
  harga_per_kg: number
  path_gambar:  string
}

// ESP32 device client ID harus cocok dengan yang dikonfigurasi di firmware
const ESP32_CLIENT_ID = 'esp32-cam-01'

function getClientId(): string {
  let id = localStorage.getItem('client_id')
  if (!id) { id = crypto.randomUUID(); localStorage.setItem('client_id', id) }
  return id
}

async function triggerRawBTPrint(
  nama_produk: string, berat_kg: number,
  harga_per_kg: number, total_harga: number
): Promise<{ ok: boolean; msg: string }> {
  try {
    const res  = await apiFetch('/api/print_rawbt', {
      method: 'POST',
      body: JSON.stringify({ nama_produk, berat_kg, harga_per_kg, total_harga }),
    })
    if (!res.ok) return { ok: false, msg: 'Server gagal generate struk' }
    const data = await res.json()
    window.location.href = data.rawbt_uri
    return { ok: true, msg: `Struk dikirim ke RawBT — kasir: ${data.kasir}` }
  } catch {
    return { ok: false, msg: 'Gagal terhubung ke server untuk print' }
  }
}

export default function ScaleDashboard() {
  const [products,       setProducts]       = useState<Produk[]>([])
  const [currentProduct, setCurrentProduct] = useState<Produk | null>(null)
  const [weight,         setWeight]         = useState(0)
  const [detection,      setDetection]      = useState('-')
  const [totalPrice,     setTotalPrice]     = useState(0)
  const [now,            setNow]            = useState(new Date())
  const [saving,         setSaving]         = useState(false)

  const [modal, setModal] = useState<{ open: boolean; msg: string; status: ModalStatus }>({
    open: false, msg: '', status: null,
  })
  const notify = (msg: string, status: ModalStatus) => setModal({ open: true, msg, status })

  // Clock
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(t)
  }, [])

  // Load products
  useEffect(() => {
    fetch(`${API_URL}/api/produk`)
      .then(r => r.json())
      .then(setProducts)
      .catch(() => {})
  }, [])

  // Poll status dari backend setiap 500ms
  // Mengambil weight + detection dari ESP32 via backend
  useEffect(() => {
    const iv = setInterval(async () => {
      try {
        const res  = await fetch(`${API_URL}/api/status`, {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          // Selalu request status dari ESP32 client
          body: JSON.stringify({ client_id: ESP32_CLIENT_ID }),
        })
        const data = await res.json()
        const w    = data.weight ?? 0
        setWeight(w)

        const detLabel = data.detection ?? '-'
        setDetection(detLabel)

        const found = products.find(p =>
          p.nama_produk?.toLowerCase() === detLabel.toLowerCase()
        )
        setCurrentProduct(found ?? null)
        setTotalPrice(found ? Math.round(w * found.harga_per_kg) : 0)
      } catch {}
    }, 500)
    return () => clearInterval(iv)
  }, [products])

  // Callback dari CameraClient saat deteksi berubah (dipakai untuk browser mode)
  const handleDetection = useCallback((label: string) => {
    setDetection(label)
    const found = products.find(p => p.nama_produk?.toLowerCase() === label.toLowerCase())
    setCurrentProduct(found ?? null)
  }, [products])

  const handleSaveAndPrint = async () => {
    if (!currentProduct || weight <= 0) {
      notify('Belum ada buah terdeteksi atau berat belum valid!', 'warning')
      return
    }
    setSaving(true)
    try {
      const res  = await apiFetch('/cetak', {
        method: 'POST',
        body: JSON.stringify({
          nama_produk:  currentProduct.nama_produk,
          berat_kg:     weight,
          harga_per_kg: currentProduct.harga_per_kg,
          total_harga:  totalPrice,
        }),
      })
      const data = await res.json()
      if (!res.ok) { notify(data.status || 'Gagal simpan transaksi', 'error'); return }

      notify('Transaksi berhasil disimpan! Membuka RawBT...', 'success')

      setTimeout(async () => {
        const print = await triggerRawBTPrint(
          currentProduct.nama_produk, weight,
          currentProduct.harga_per_kg, totalPrice
        )
        if (!print.ok) notify(print.msg, 'warning')
      }, 800)
    } catch {
      notify('Gagal terhubung ke server', 'error')
    } finally {
      setSaving(false)
    }
  }

  const formatRp = (n: number) => 'Rp ' + n.toLocaleString('id-ID')

  return (
    <div>
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-6">
        <div className="flex items-center gap-3">
          <span className="text-3xl">⚖️</span>
          <h1 className="text-xl md:text-2xl font-extrabold text-blue-800 dark:text-blue-300">
            TIMBANGAN DIGITAL AI
          </h1>
        </div>
        <span className="text-sm text-gray-500 dark:text-gray-400 font-semibold tabular-nums">
          {now.toLocaleString('id-ID')}
        </span>
      </div>

      {/* Main grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 md:gap-6">

        {/* 
          ─── KAMERA: MODE ESP32-S3 ───────────────────────────
          Frame diambil dari backend (/api/status → annotated_frame)
          yang sudah diproses YOLO di server.
          Ganti ke mode="browser" jika ingin pakai webcam browser.
        */}
        <div className="lg:col-span-2 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-2xl overflow-hidden shadow">
          <CameraClient
            onDetection={handleDetection}
            mode="esp32"
          />
        </div>

        {/* Info panel */}
        <div className="flex flex-col gap-3">

          <InfoCard label="BERAT (kg)" value={weight > 0 ? weight.toFixed(3) : '0.000'} accent />
          <InfoCard label="BUAH TERDETEKSI" value={detection === '-' ? 'Tidak Ada' : detection} />
          <InfoCard
            label="HARGA / KG"
            value={currentProduct ? formatRp(currentProduct.harga_per_kg) : '-'}
          />

          <div className="bg-blue-600 text-white rounded-2xl p-4 shadow-lg shadow-blue-200 dark:shadow-none">
            <p className="text-xs font-bold mb-1 opacity-80">TOTAL HARGA</p>
            <p className="text-3xl font-extrabold">{formatRp(totalPrice)}</p>
          </div>

          <button
            onClick={handleSaveAndPrint}
            disabled={!currentProduct || weight <= 0 || saving}
            className="
              flex items-center justify-center gap-2
              py-3 px-5 rounded-2xl font-bold text-sm
              bg-gray-200 dark:bg-gray-800
              hover:bg-green-600 hover:text-white
              disabled:opacity-40 disabled:cursor-not-allowed
              dark:text-white transition shadow
            "
          >
            🖨️ {saving ? 'Menyimpan...' : 'SIMPAN & CETAK'}
          </button>

          <p className="text-[10px] text-gray-400 dark:text-gray-500 text-center">
            Struk akan dikirim ke RawBT (Android)
          </p>
        </div>
      </div>

      {/* Daftar Produk */}
      <div className="mt-8">
        <h2 className="text-lg font-bold mb-4 text-gray-800 dark:text-gray-100">Daftar Produk</h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
          {products.map(p => {
            const active = currentProduct?.kode_produk === p.kode_produk
            return (
              <div
                key={p.kode_produk}
                className={`
                  flex items-center gap-3 p-3 rounded-xl border transition-all duration-200
                  ${active
                    ? 'bg-green-50 dark:bg-green-900/30 border-green-400 scale-105 shadow-md'
                    : 'bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-700 hover:scale-105'}
                `}
              >
                <img
                  src={`${API_URL}${p.path_gambar}`}
                  alt={p.nama_produk}
                  className="w-12 h-12 object-contain flex-shrink-0"
                  onError={e => (e.currentTarget.style.display = 'none')}
                />
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-gray-800 dark:text-white truncate">{p.nama_produk}</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    {formatRp(p.harga_per_kg)}/kg
                  </p>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      <ModalNotifikasi
        isOpen={modal.open}
        message={modal.msg}
        status={modal.status}
        onClose={() => setModal(m => ({ ...m, open: false }))}
      />
    </div>
  )
}

function InfoCard({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className={`p-4 rounded-2xl border ${accent
      ? 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-700'
      : 'bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-700'} shadow-sm`}>
      <p className="text-xs font-bold text-gray-400 dark:text-gray-500 mb-1">{label}</p>
      <p className={`text-2xl font-extrabold ${accent
        ? 'text-blue-700 dark:text-blue-300'
        : 'text-gray-900 dark:text-white'}`}>
        {value}
      </p>
    </div>
  )
}
