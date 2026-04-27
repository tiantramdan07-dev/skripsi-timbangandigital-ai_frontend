import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import SignIn from './pages/auth/SignIn'
import SignUp from './pages/auth/SignUp'
import DashboardLayout from './layouts/DashboardLayout'
import ScaleDashboard from './pages/dashboard/ScaleDashboard'
import DataProduk from './pages/dashboard/DataProduk'
import RiwayatPenimbangan from './pages/dashboard/RiwayatPenimbangan'
import LaporanPenimbangan from './pages/dashboard/LaporanPenimbangan'
import ProtectedRoute from './components/ProtectedRoute'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Auth */}
        <Route path="/signin" element={<SignIn />} />
        <Route path="/signup" element={<SignUp />} />

        {/* Dashboard (protected) */}
        <Route
          path="/"
          element={
            <ProtectedRoute>
              <DashboardLayout />
            </ProtectedRoute>
          }
        >
          <Route index element={<Navigate to="/dashboard" replace />} />
          <Route path="dashboard"   element={<ScaleDashboard />} />
          <Route path="produk"      element={<DataProduk />} />
          <Route path="riwayat"     element={<RiwayatPenimbangan />} />
          <Route path="laporan"     element={<LaporanPenimbangan />} />
        </Route>

        {/* 404 */}
        <Route path="*" element={<Navigate to="/signin" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
