import React, { useState } from "react";
import { useGetNearbyDrivers, useGetRouteEstimate, useCreateTrip } from "@workspace/api-client-react";
import { Card, CardContent, Input, Button, Label, Select } from "@/components/ui";
import { MapView } from "@/components/map/map-view";
import { useToast } from "@/hooks/use-toast";
import { MapPin, Navigation, Clock, DollarSign, Search } from "lucide-react";
import { useLocation } from "wouter";

export default function CustomerDashboard() {
  // Demo coordinates (NYC)
  const defaultCenter: [number, number] = [40.7128, -74.0060];
  
  const [pickupLat, setPickupLat] = useState<number>(defaultCenter[0]);
  const [pickupLng, setPickupLng] = useState<number>(defaultCenter[1]);
  const [pickupAddress, setPickupAddress] = useState("123 Main St, New York");
  
  const [dropoffLat, setDropoffLat] = useState<number | null>(null);
  const [dropoffLng, setDropoffLng] = useState<number | null>(null);
  const [dropoffAddress, setDropoffAddress] = useState("");
  
  const [paymentMethod, setPaymentMethod] = useState<"cash" | "card" | "online">("card");
  
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  const { data: nearbyDrivers } = useGetNearbyDrivers({
    lat: pickupLat,
    lng: pickupLng,
    radius: 10
  });

  const getEstimateMutation = useGetRouteEstimate();
  const createTripMutation = useCreateTrip();

  const handleMapClick = (lat: number, lng: number) => {
    setDropoffLat(lat);
    setDropoffLng(lng);
    setDropoffAddress(`Selected location (${lat.toFixed(4)}, ${lng.toFixed(4)})`);
    
    getEstimateMutation.mutate({
      data: {
        fromLat: pickupLat,
        fromLng: pickupLng,
        toLat: lat,
        toLng: lng
      }
    });
  };

  const handleBookRide = () => {
    if (!dropoffLat || !dropoffLng) return;
    
    createTripMutation.mutate({
      data: {
        pickupLat,
        pickupLng,
        pickupAddress,
        dropoffLat,
        dropoffLng,
        dropoffAddress,
        paymentMethod
      }
    }, {
      onSuccess: (data) => {
        toast({ title: "Ride requested!", description: "Waiting for a driver to accept." });
        // Redirect to active trip tracking
        setLocation(`/customer/trip/${data.id}`);
      }
    });
  };

  const mapMarkers = nearbyDrivers?.map(d => ({
    id: d.id,
    lat: d.currentLat,
    lng: d.currentLng,
    title: `${d.firstName} (${d.distanceKm.toFixed(1)} km)`,
    description: `${d.vehicleMake} ${d.vehicleModel}`,
    isDriver: true
  })) || [];

  if (dropoffLat && dropoffLng) {
    mapMarkers.push({
      id: "dropoff",
      lat: dropoffLat,
      lng: dropoffLng,
      title: "Dropoff Location",
      isDriver: false
    });
  }

  return (
    <div className="flex flex-col lg:flex-row gap-6 h-[calc(100vh-8rem)]">
      {/* Booking Form */}
      <Card className="w-full lg:w-96 flex flex-col shadow-2xl z-10 border-border/60 bg-card/95 backdrop-blur-xl shrink-0 h-fit lg:h-full overflow-hidden">
        <div className="p-6 border-b border-border bg-gradient-to-br from-card to-card/50">
          <h1 className="text-2xl font-display font-bold">Book a Ride</h1>
          <p className="text-muted-foreground text-sm">Where do you want to go?</p>
        </div>
        
        <div className="p-6 flex-1 overflow-y-auto space-y-6">
          <div className="space-y-4 relative before:absolute before:inset-y-0 before:left-3.5 before:w-0.5 before:bg-border before:-z-10">
            <div className="relative z-10 bg-background/50 p-1 rounded-xl backdrop-blur-sm">
              <Label className="text-xs uppercase tracking-wider text-primary mb-1 ml-9">Pickup</Label>
              <div className="flex items-center">
                <div className="w-8 h-8 rounded-full flex items-center justify-center bg-card mr-2">
                  <div className="w-3 h-3 rounded-full bg-primary shadow-[0_0_10px_rgba(245,158,11,0.5)]" />
                </div>
                <Input value={pickupAddress} onChange={e => setPickupAddress(e.target.value)} className="bg-transparent border-none shadow-none focus-visible:ring-0 px-0 h-auto font-medium text-base" />
              </div>
            </div>
            
            <div className="relative z-10 bg-background/50 p-1 rounded-xl backdrop-blur-sm mt-4">
              <Label className="text-xs uppercase tracking-wider text-emerald-500 mb-1 ml-9">Dropoff</Label>
              <div className="flex items-center">
                <div className="w-8 h-8 rounded-full flex items-center justify-center bg-card mr-2">
                  <div className="w-3 h-3 rounded-none bg-emerald-500" />
                </div>
                <Input 
                  value={dropoffAddress} 
                  onChange={e => setDropoffAddress(e.target.value)} 
                  placeholder="Click on the map to set dropoff" 
                  className="bg-transparent border-none shadow-none focus-visible:ring-0 px-0 h-auto font-medium text-base" 
                />
              </div>
            </div>
          </div>

          {getEstimateMutation.data && (
            <div className="bg-muted/40 rounded-xl p-4 border border-border mt-6 animate-in fade-in slide-in-from-bottom-2">
              <h3 className="font-semibold mb-3">Route Estimate</h3>
              <div className="grid grid-cols-2 gap-4">
                <div className="flex items-center">
                  <Clock className="h-5 w-5 mr-2 text-muted-foreground" />
                  <div>
                    <p className="text-xs text-muted-foreground">Time</p>
                    <p className="font-medium">{getEstimateMutation.data.durationMinutes} min</p>
                  </div>
                </div>
                <div className="flex items-center">
                  <Navigation className="h-5 w-5 mr-2 text-muted-foreground" />
                  <div>
                    <p className="text-xs text-muted-foreground">Distance</p>
                    <p className="font-medium">{getEstimateMutation.data.distanceKm.toFixed(1)} km</p>
                  </div>
                </div>
              </div>
              <div className="mt-4 pt-4 border-t border-border flex items-center justify-between">
                <span className="text-muted-foreground">Estimated Fare</span>
                <span className="text-2xl font-bold text-primary">${getEstimateMutation.data.estimatedFare}</span>
              </div>
            </div>
          )}

          <div className="space-y-2 mt-4">
            <Label>Payment Method</Label>
            <Select value={paymentMethod} onChange={(e: any) => setPaymentMethod(e.target.value)}>
              <option value="card">Credit Card (**** 1234)</option>
              <option value="cash">Cash</option>
              <option value="online">Online Wallet</option>
            </Select>
          </div>
        </div>

        <div className="p-6 border-t border-border bg-card">
          <Button 
            className="w-full h-14 text-lg" 
            size="lg" 
            disabled={!dropoffLat || getEstimateMutation.isPending}
            onClick={handleBookRide}
            isLoading={createTripMutation.isPending}
          >
            {getEstimateMutation.isPending ? "Calculating..." : "Request Ride"}
          </Button>
        </div>
      </Card>

      {/* Map Area */}
      <div className="flex-1 relative rounded-2xl overflow-hidden border border-border shadow-xl h-[400px] lg:h-full">
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-20 bg-card/90 backdrop-blur-md px-6 py-3 rounded-full border border-border shadow-lg flex items-center text-sm font-medium">
          <MapPin className="mr-2 h-4 w-4 text-primary" />
          Click anywhere on the map to set destination
        </div>
        <MapView 
          center={defaultCenter} 
          zoom={13} 
          markers={mapMarkers}
          onMapClick={handleMapClick}
          className="h-full border-none rounded-none"
        />
      </div>
    </div>
  );
}
