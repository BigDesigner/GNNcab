import React from "react";
import { useGetTrip, useCancelTrip } from "@workspace/api-client-react";
import { useRoute } from "wouter";
import { Card, CardContent, Button, Badge } from "@/components/ui";
import { MapView } from "@/components/map/map-view";
import { Car, Phone, MapPin, Clock, ShieldAlert } from "lucide-react";
import { formatCurrency } from "@/lib/utils";

export default function ActiveTrip() {
  const [, params] = useRoute("/customer/trip/:id");
  const tripId = params?.id || "";
  
  // Use React Query with polling to get live updates until we hook up full WS updates to query cache
  const { data: trip } = useGetTrip(tripId, { query: { refetchInterval: 5000 } });
  const cancelMutation = useCancelTrip();

  if (!trip) return <div className="p-8 text-center animate-pulse">Loading trip details...</div>;

  const isActive = !["TRIP_COMPLETED", "TRIP_CANCELLED", "TIMEOUT", "DRIVER_REJECTED"].includes(trip.status);

  return (
    <div className="flex flex-col lg:flex-row gap-6 h-[calc(100vh-8rem)]">
      {/* Trip Info Panel */}
      <Card className="w-full lg:w-96 flex flex-col shadow-2xl z-10 border-border/60 bg-card/95 backdrop-blur-xl shrink-0 h-fit lg:h-full overflow-hidden">
        <div className="p-6 border-b border-border bg-gradient-to-br from-card to-card/50">
          <div className="flex items-center justify-between mb-4">
            <h1 className="text-xl font-display font-bold">Trip Status</h1>
            <Badge variant="warning" className="animate-pulse">{trip.status.replace(/_/g, ' ')}</Badge>
          </div>
          
          <div className="flex items-center space-x-4 bg-background/50 p-4 rounded-xl border border-border">
            <div className="h-12 w-12 rounded-full bg-primary/20 flex items-center justify-center text-primary">
              <Car size={24} />
            </div>
            {trip.driver ? (
              <div>
                <p className="font-semibold">{trip.driver.firstName} {trip.driver.lastName}</p>
                <p className="text-xs text-muted-foreground">{trip.driver.vehicleMake} • {trip.driver.vehiclePlate}</p>
              </div>
            ) : (
              <div>
                <p className="font-medium">Finding Driver...</p>
                <p className="text-xs text-muted-foreground">Please wait</p>
              </div>
            )}
          </div>
        </div>
        
        <div className="p-6 flex-1 overflow-y-auto space-y-6">
          <div className="space-y-4 relative before:absolute before:inset-y-0 before:left-3.5 before:w-0.5 before:bg-border before:-z-10">
            <div className="relative z-10 bg-background/50 p-3 rounded-xl backdrop-blur-sm flex gap-3">
              <div className="w-3 h-3 mt-1 rounded-full bg-primary shadow-[0_0_10px_rgba(245,158,11,0.5)] flex-shrink-0" />
              <div>
                <p className="text-xs uppercase tracking-wider text-primary mb-1">Pickup</p>
                <p className="text-sm font-medium">{trip.pickupAddress}</p>
              </div>
            </div>
            
            <div className="relative z-10 bg-background/50 p-3 rounded-xl backdrop-blur-sm flex gap-3 mt-4">
              <div className="w-3 h-3 mt-1 rounded-none bg-emerald-500 flex-shrink-0" />
              <div>
                <p className="text-xs uppercase tracking-wider text-emerald-500 mb-1">Dropoff</p>
                <p className="text-sm font-medium">{trip.dropoffAddress}</p>
              </div>
            </div>
          </div>

          <div className="bg-muted/40 rounded-xl p-4 border border-border mt-6">
            <div className="flex justify-between items-center mb-2">
              <span className="text-muted-foreground text-sm">Estimated Fare</span>
              <span className="font-bold">{formatCurrency(trip.estimatedFare || 0)}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-muted-foreground text-sm">Payment</span>
              <span className="capitalize font-medium">{trip.paymentMethod}</span>
            </div>
          </div>
        </div>

        {isActive && (
          <div className="p-6 border-t border-border bg-card space-y-3">
            <Button variant="outline" className="w-full" disabled={!trip.driver}>
              <Phone className="mr-2 h-4 w-4" /> Call Driver
            </Button>
            <Button 
              variant="destructive" 
              className="w-full"
              onClick={() => cancelMutation.mutate({ tripId, data: { reason: "User requested" }})}
              isLoading={cancelMutation.isPending}
            >
              <ShieldAlert className="mr-2 h-4 w-4" /> Cancel Ride
            </Button>
          </div>
        )}
      </Card>

      {/* Map Area */}
      <div className="flex-1 relative rounded-2xl overflow-hidden border border-border shadow-xl h-[400px] lg:h-full">
        <MapView 
          center={[trip.pickupLat, trip.pickupLng]} 
          zoom={14} 
          markers={[
            { id: "pickup", lat: trip.pickupLat, lng: trip.pickupLng, title: "Pickup" },
            { id: "dropoff", lat: trip.dropoffLat, lng: trip.dropoffLng, title: "Dropoff" },
            ...(trip.driver?.currentLat ? [{
              id: "driver", 
              lat: trip.driver.currentLat, 
              lng: trip.driver.currentLng, 
              isDriver: true,
              title: trip.driver.firstName
            }] : [])
          ]}
          className="h-full border-none rounded-none"
        />
      </div>
    </div>
  );
}
