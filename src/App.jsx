import { Toaster } from "@/components/ui/toaster"
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClientInstance } from '@/lib/query-client'
import { BrowserRouter as Router, Route, Routes, Navigate } from 'react-router-dom';
import PageNotFound from './lib/PageNotFound';
import { AuthProvider, useAuth } from '@/lib/AuthContext';
import UserNotRegisteredError from '@/components/UserNotRegisteredError';
import ProtectedRoute from '@/components/ProtectedRoute';
import OnboardingGate from '@/components/OnboardingGate';
import Layout from '@/components/Layout';
import Onboarding from '@/pages/Onboarding';
import Home from '@/pages/Home';
import Marketplace from '@/pages/Marketplace';
import ProductDetail from '@/pages/ProductDetail';
import Projects from '@/pages/Projects';
import ProjectDetail from '@/pages/ProjectDetail';
import RFQs from '@/pages/RFQs';
import RFQDetail from '@/pages/RFQDetail';
import Orders from '@/pages/Orders';
import OrderDetail from '@/pages/OrderDetail';
import Checkout from '@/pages/Checkout';
import ExceptionDetail from '@/pages/ExceptionDetail';
import Messages from '@/pages/Messages';
import Conversation from '@/pages/Conversation';
import Favorites from '@/pages/Favorites';
import Account from '@/pages/Account';
import EditBuyerProfile from '@/pages/EditBuyerProfile';
import Settings from '@/pages/Settings';
import ReportProblem from '@/pages/ReportProblem';
import PrivacyPolicy from '@/pages/PrivacyPolicy';
import Terms from '@/pages/Terms';
import CommunityRules from '@/pages/CommunityRules';
import VendorPublicProfile from '@/pages/VendorPublicProfile';
import VendorDashboard from '@/pages/VendorDashboard';
import VendorInventory from '@/pages/VendorInventory';
import ProductForm from '@/pages/ProductForm';
import VendorRFQs from '@/pages/VendorRFQs';
import EditVendorProfile from '@/pages/EditVendorProfile';
import QuoteForm from '@/pages/QuoteForm';
import AdminDashboard from '@/pages/AdminDashboard';
import Login from '@/pages/Login';
import Register from '@/pages/Register';
import ForgotPassword from '@/pages/ForgotPassword';
import ResetPassword from '@/pages/ResetPassword';
import BecomeSeller from '@/pages/BecomeSeller';
import BecomeCarrier from '@/pages/BecomeCarrier';
import CarrierDashboard from '@/pages/CarrierDashboard';
import CarrierLoads from '@/pages/CarrierLoads';
import CarrierFinancials from '@/pages/CarrierFinancials';
import EditCarrierProfile from '@/pages/EditCarrierProfile';
import VendorFinancials from '@/pages/VendorFinancials';
import CarrierGuard from '@/components/CarrierGuard';
import DeleteAccount from '@/pages/DeleteAccount';
import VendorGuard from '@/components/VendorGuard';
import { ThemeProvider } from "next-themes";
import AppErrorBoundary from "@/components/AppErrorBoundary";
import ClientErrorReporter from "@/components/ClientErrorReporter";
// Add page imports here

const AuthenticatedApp = () => {
  const { isLoadingAuth, isLoadingPublicSettings } = useAuth();

  // Show loading spinner while checking app public settings or auth
  if (isLoadingPublicSettings || isLoadingAuth) {
    return (
      <div className="fixed inset-0 flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-slate-200 border-t-slate-800 rounded-full animate-spin"></div>
      </div>
    );
  }

  // Public routes must remain reachable while signed out. Authentication and
  // registration errors are handled inside ProtectedRoute for protected pages;
  // handling them here would redirect legal/privacy/account-deletion URLs before
  // React Router has a chance to render those public pages.

  // Render the main app
  return (
    <Routes>
      {/* Auth routes */}
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route path="/reset-password" element={<ResetPassword />} />

      {/* Public legal pages — accessible without an account */}
      <Route path="/privacy" element={<PrivacyPolicy />} />
      <Route path="/terms" element={<Terms />} />
      <Route path="/community-rules" element={<CommunityRules />} />
      <Route path="/delete-account" element={<DeleteAccount />} />

      {/* Authenticated app */}
      <Route element={<ProtectedRoute unauthenticatedElement={<Navigate to="/login" replace />} />}>
        <Route element={<OnboardingGate />}>
          <Route path="/onboarding" element={<Onboarding />} />
          <Route path="/become-seller" element={<BecomeSeller />} />
          <Route path="/become-carrier" element={<BecomeCarrier />} />
          <Route element={<Layout />}>
            <Route path="/" element={<Home />} />
            <Route path="/marketplace" element={<Marketplace />} />
            <Route path="/product/:id" element={<ProductDetail />} />
            <Route path="/vendor/:id" element={<VendorPublicProfile />} />
            <Route path="/projects" element={<Projects />} />
            <Route path="/projects/:id" element={<ProjectDetail />} />
            <Route path="/rfqs" element={<RFQs />} />
            <Route path="/rfqs/:id" element={<RFQDetail />} />
            <Route path="/orders" element={<Orders />} />
            <Route path="/orders/:id" element={<OrderDetail />} />
            <Route path="/checkout" element={<Checkout />} />
            <Route path="/messages" element={<Messages />} />
            <Route path="/messages/:id" element={<Conversation />} />
            <Route path="/favorites" element={<Favorites />} />
            <Route path="/account" element={<Account />} />
            <Route path="/profile" element={<Account />} />
            <Route path="/edit-buyer-profile" element={<EditBuyerProfile />} />
            <Route path="/settings" element={<Settings />} />
            <Route path="/report-problem" element={<ReportProblem />} />
            <Route path="/admin" element={<AdminDashboard />} />
            <Route path="/admin/exceptions/:id" element={<ExceptionDetail />} />
            <Route element={<VendorGuard />}>
              <Route path="/vendor" element={<VendorDashboard />} />
              <Route path="/vendor/inventory" element={<VendorInventory />} />
              <Route path="/vendor/inventory/new" element={<ProductForm />} />
              <Route path="/vendor/inventory/:id" element={<ProductForm />} />
              <Route path="/vendor/rfqs" element={<VendorRFQs />} />
              <Route path="/vendor/edit-profile" element={<EditVendorProfile />} />
              <Route path="/vendor/rfqs/:rfqId/quote" element={<QuoteForm />} />
              <Route path="/vendor/orders" element={<Orders />} />
              <Route path="/vendor/financials" element={<VendorFinancials />} />
            </Route>
            <Route element={<CarrierGuard />}>
              <Route path="/carrier" element={<CarrierDashboard />} />
              <Route path="/carrier/loads" element={<CarrierLoads />} />
              <Route path="/carrier/financials" element={<CarrierFinancials />} />
              <Route path="/carrier/edit-profile" element={<EditCarrierProfile />} />
            </Route>
          </Route>
        </Route>
      </Route>
      <Route path="*" element={<PageNotFound />} />
    </Routes>
  );
};


function App() {

  return (
    <AuthProvider>
      <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
        <QueryClientProvider client={queryClientInstance}>
          <Router>
            <AppErrorBoundary>
              <ClientErrorReporter />
              <AuthenticatedApp />
            </AppErrorBoundary>
          </Router>
          <Toaster />
        </QueryClientProvider>
      </ThemeProvider>
    </AuthProvider>
  )
}

export default App