import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'react-hot-toast';
import { useAuthStore } from './lib/authStore';
import { connectWebSocket } from './lib/api';
import { useEffect } from 'react';

import AppLayout         from './components/layout/AppLayout';
import LoginPage         from './components/pages/LoginPage';
import DashboardPage     from './components/pages/DashboardPage';
import DepartmentsPage   from './components/pages/DepartmentsPage';
import RoomsPage         from './components/pages/RoomsPage';
import CoursesPage       from './components/pages/CoursesPage';
import FacultyPage       from './components/pages/FacultyPage';
import TimetablePage     from './components/pages/TimetablePage';
import PdfIngestionPage  from './components/pages/PdfIngestionPage';
import BulkImportPage    from './components/pages/BulkImportPage';
import HealthPage        from './components/pages/HealthPage';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const isAuthenticated = useAuthStore(s => s.isAuthenticated);
  if (!isAuthenticated()) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

export default function App() {
  const isAuthenticated = useAuthStore(s => s.isAuthenticated);

  useEffect(() => {
    if (isAuthenticated()) connectWebSocket();
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/" element={
            <ProtectedRoute>
              <AppLayout />
            </ProtectedRoute>
          }>
            <Route index element={<Navigate to="/dashboard" replace />} />
            <Route path="dashboard"    element={<DashboardPage />} />
            <Route path="health"       element={<HealthPage />} />
            <Route path="departments"  element={<DepartmentsPage />} />
            <Route path="rooms"        element={<RoomsPage />} />
            <Route path="courses"      element={<CoursesPage />} />
            <Route path="faculty"      element={<FacultyPage />} />
            <Route path="timetable"    element={<TimetablePage />} />
            <Route path="pdf-ingestion" element={<PdfIngestionPage />} />
            <Route path="bulk-import"  element={<BulkImportPage />} />
          </Route>
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </BrowserRouter>
      <Toaster
        position="bottom-right"
        toastOptions={{
          duration: 4000,
          style: {
            background: '#1e293b',
            color: '#f8fafc',
            borderRadius: '12px',
            fontSize: '13px',
            fontFamily: 'Figtree, system-ui, sans-serif',
          },
          success: { iconTheme: { primary: '#10b981', secondary: '#fff' } },
          error:   { iconTheme: { primary: '#ef4444', secondary: '#fff' } },
        }}
      />
    </QueryClientProvider>
  );
}
