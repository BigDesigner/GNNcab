import React from "react";
import { Link, useLocation } from "wouter";
import { useAuth } from "@/components/auth-context";
import { useWebSocket } from "@/hooks/use-websocket";
import { 
  LayoutDashboard, 
  Map, 
  Car, 
  MapPin, 
  Users, 
  CreditCard, 
  ClipboardList, 
  LogOut,
  Menu,
  X
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui";

const adminNav = [
  { href: "/admin", label: "Dashboard", icon: LayoutDashboard },
  { href: "/admin/trips", label: "Trips", icon: Map },
  { href: "/admin/drivers", label: "Drivers", icon: Car },
  { href: "/admin/cities", label: "Cities & Zones", icon: MapPin },
  { href: "/admin/users", label: "Users", icon: Users },
  { href: "/admin/payments", label: "Payments", icon: CreditCard },
  { href: "/admin/audit", label: "Audit Logs", icon: ClipboardList },
];

const driverNav = [
  { href: "/driver", label: "Dashboard", icon: LayoutDashboard },
  { href: "/driver/trips", label: "My Trips", icon: Map },
  { href: "/driver/profile", label: "Profile", icon: Users },
];

const customerNav = [
  { href: "/customer", label: "Book a Ride", icon: Map },
  { href: "/customer/history", label: "Trip History", icon: ClipboardList },
  { href: "/customer/profile", label: "Profile", icon: Users },
];

export function AppLayout({ children }: { children: React.ReactNode }) {
  const { user, logout } = useAuth();
  const [location] = useLocation();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = React.useState(false);
  const { isConnected } = useWebSocket();

  if (!user) return <>{children}</>;

  const navItems = 
    user.role === "admin" ? adminNav :
    user.role === "driver" ? driverNav : customerNav;

  return (
    <div className="flex h-screen w-full bg-background overflow-hidden">
      {/* Sidebar */}
      <aside className={cn(
        "fixed inset-y-0 left-0 z-40 w-64 transform border-r border-border bg-card transition-transform duration-300 md:relative md:translate-x-0 flex flex-col",
        isMobileMenuOpen ? "translate-x-0" : "-translate-x-full"
      )}>
        <div className="flex h-16 items-center px-6 border-b border-border">
          <img src={`${import.meta.env.BASE_URL}images/logo.png`} alt="GNNcab" className="h-8 w-8 mr-3 object-contain" />
          <span className="text-xl font-display font-bold text-primary tracking-wide">GNN<span className="text-foreground">cab</span></span>
        </div>
        
        <div className="p-4 border-b border-border">
          <div className="flex items-center space-x-3">
            <div className="h-10 w-10 rounded-full bg-primary/20 flex items-center justify-center text-primary font-bold">
              {user.firstName[0]}{user.lastName[0]}
            </div>
            <div>
              <p className="text-sm font-semibold leading-none">{user.firstName} {user.lastName}</p>
              <p className="text-xs text-muted-foreground mt-1 capitalize">{user.role}</p>
            </div>
          </div>
        </div>

        <nav className="flex-1 overflow-y-auto p-4 space-y-1">
          {navItems.map((item) => {
            const isActive = location === item.href || (location.startsWith(item.href) && item.href !== "/admin" && item.href !== "/driver" && item.href !== "/customer");
            return (
              <Link key={item.href} href={item.href} className="block">
                <span onClick={() => setIsMobileMenuOpen(false)} className={cn(
                  "flex items-center space-x-3 rounded-xl px-3 py-3 text-sm font-medium transition-all duration-200",
                  isActive 
                    ? "bg-primary/10 text-primary" 
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                )}>
                  <item.icon className={cn("h-5 w-5", isActive ? "text-primary" : "text-muted-foreground")} />
                  <span>{item.label}</span>
                </span>
              </Link>
            );
          })}
        </nav>

        <div className="p-4 border-t border-border">
          <div className="flex items-center space-x-2 text-xs text-muted-foreground mb-4 px-2">
            <div className={cn("h-2 w-2 rounded-full", isConnected ? "bg-emerald-500" : "bg-red-500")} />
            <span>{isConnected ? "System Online" : "Reconnecting..."}</span>
          </div>
          <Button variant="ghost" className="w-full justify-start text-muted-foreground hover:text-destructive hover:bg-destructive/10" onClick={logout}>
            <LogOut className="mr-2 h-5 w-5" />
            Sign Out
          </Button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <header className="flex h-16 items-center justify-between border-b border-border bg-card/50 backdrop-blur-md px-6 md:hidden">
          <div className="flex items-center">
            <img src={`${import.meta.env.BASE_URL}images/logo.png`} alt="GNNcab" className="h-6 w-6 mr-2 object-contain" />
            <span className="text-lg font-display font-bold">GNNcab</span>
          </div>
          <button onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)} className="text-foreground p-2 rounded-md hover:bg-muted">
            {isMobileMenuOpen ? <X /> : <Menu />}
          </button>
        </header>

        <div className="flex-1 overflow-auto p-4 md:p-8">
          <div className="max-w-7xl mx-auto h-full">
            {children}
          </div>
        </div>
      </main>

      {/* Mobile overlay */}
      {isMobileMenuOpen && (
        <div className="fixed inset-0 z-30 bg-background/80 backdrop-blur-sm md:hidden" onClick={() => setIsMobileMenuOpen(false)} />
      )}
    </div>
  );
}
