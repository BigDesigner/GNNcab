import { Switch, Route, Router as WouterRouter, Redirect } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/components/auth-context";
import { AppLayout } from "@/components/layout/app-layout";
import { WebSocketProvider } from "@/hooks/use-websocket";

// Pages
import Login from "@/pages/login";
import AdminDashboard from "@/pages/admin/dashboard";
import AdminTrips from "@/pages/admin/trips";
import AdminUsers from "@/pages/admin/users";
import DriverDashboard from "@/pages/driver/dashboard";
import CustomerDashboard from "@/pages/customer/dashboard";
import ActiveTrip from "@/pages/customer/active-trip";
import NotFound from "@/pages/not-found";

// Initialize fetching interceptor
import "@/lib/fetch-interceptor";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

function ProtectedRoute({ component: Component, allowedRoles }: { component: React.ComponentType, allowedRoles: string[] }) {
  const { user, isLoading } = useAuth();
  
  if (isLoading) return <div className="min-h-screen bg-background flex items-center justify-center text-primary">Loading...</div>;
  
  if (!user) return <Redirect to="/login" />;
  
  if (!allowedRoles.includes(user.role)) {
    // Redirect to proper home based on role
    if (user.role === 'admin') return <Redirect to="/admin" />;
    if (user.role === 'driver') return <Redirect to="/driver" />;
    return <Redirect to="/customer" />;
  }

  return (
    <AppLayout>
      <Component />
    </AppLayout>
  );
}

function HomeRouter() {
  const { user, isLoading } = useAuth();
  if (isLoading) return <div className="min-h-screen bg-background" />;
  if (!user) return <Redirect to="/login" />;
  
  if (user.role === 'admin') return <Redirect to="/admin" />;
  if (user.role === 'driver') return <Redirect to="/driver" />;
  return <Redirect to="/customer" />;
}

function Router() {
  return (
    <Switch>
      <Route path="/login" component={Login} />
      <Route path="/" component={HomeRouter} />

      {/* Admin Routes */}
      <Route path="/admin">
        <ProtectedRoute component={AdminDashboard} allowedRoles={["admin"]} />
      </Route>
      <Route path="/admin/trips">
        <ProtectedRoute component={AdminTrips} allowedRoles={["admin"]} />
      </Route>
      <Route path="/admin/users">
        <ProtectedRoute component={AdminUsers} allowedRoles={["admin"]} />
      </Route>
      
      {/* Driver Routes */}
      <Route path="/driver">
        <ProtectedRoute component={DriverDashboard} allowedRoles={["driver"]} />
      </Route>
      
      {/* Customer Routes */}
      <Route path="/customer">
        <ProtectedRoute component={CustomerDashboard} allowedRoles={["customer"]} />
      </Route>
      <Route path="/customer/trip/:id">
        <ProtectedRoute component={ActiveTrip} allowedRoles={["customer"]} />
      </Route>

      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <WebSocketProvider>
          <TooltipProvider>
            <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
              <Router />
            </WouterRouter>
            <Toaster />
          </TooltipProvider>
        </WebSocketProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}

export default App;
