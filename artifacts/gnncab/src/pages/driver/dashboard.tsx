import React, { useState } from "react";
import { useGetDriverProfile, useUpdateDriverStatus, useGetDriverTrips, useUpdateTripStatus } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle, Button, Badge } from "@/components/ui";
import { MapView } from "@/components/map/map-view";
import { useToast } from "@/hooks/use-toast";
import { MapPin, Navigation } from "lucide-react";
import { Link } from "wouter";

export default function DriverDashboard() {
  const { data: profile, refetch: refetchProfile } = useGetDriverProfile();
  const { data: trips, refetch: refetchTrips } = useGetDriverTrips({ status: "REQUESTED", limit: 5 }); // Look for pending requests
  const statusMutation = useUpdateDriverStatus();
  const tripUpdateMutation = useUpdateTripStatus();
  const { toast } = useToast();

  const isOnline = profile?.status === "AVAILABLE";

  const toggleStatus = () => {
    if (!profile) return;
    const newStatus = isOnline ? "OFFLINE" : "AVAILABLE";
    statusMutation.mutate({
      driverId: profile.id,
      data: { status: newStatus }
    }, {
      onSuccess: () => {
        refetchProfile();
        toast({ title: `You are now ${newStatus.toLowerCase()}` });
      }
    });
  };

  const handleAccept = (tripId: string) => {
    tripUpdateMutation.mutate({
      tripId,
      data: { status: "DRIVER_ACCEPTED" }
    }, {
      onSuccess: () => {
        refetchTrips();
        toast({ title: "Trip Accepted", description: "Navigate to the pickup location." });
        // In real app, redirect to active trip view
      }
    });
  };

  return (
    <div className="space-y-6 h-full flex flex-col">
      <div className="flex items-center justify-between bg-card p-4 rounded-2xl border border-border shadow-md">
        <div>
          <h1 className="text-2xl font-bold">Driver Portal</h1>
          <p className="text-sm text-muted-foreground">{profile?.vehicleMake} {profile?.vehicleModel} • {profile?.vehiclePlate}</p>
        </div>
        <Button 
          size="lg" 
          variant={isOnline ? "destructive" : "default"}
          onClick={toggleStatus}
          isLoading={statusMutation.isPending}
        >
          {isOnline ? "Go Offline" : "Go Online"}
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 flex-1 min-h-[500px]">
        <div className="lg:col-span-1 space-y-4 flex flex-col h-full">
          <h2 className="font-semibold text-lg flex items-center"><MapPin className="mr-2 h-5 w-5 text-primary" /> Pending Requests</h2>
          
          <div className="flex-1 overflow-y-auto space-y-4 pr-2">
            {!isOnline && (
              <div className="p-8 text-center bg-muted/30 rounded-xl border border-dashed border-border text-muted-foreground">
                Go online to receive trip requests.
              </div>
            )}
            {isOnline && trips?.data?.length === 0 && (
              <div className="p-8 text-center bg-muted/30 rounded-xl border border-dashed border-border text-muted-foreground">
                Waiting for nearby requests...
              </div>
            )}
            {isOnline && trips?.data?.map(trip => (
              <Card key={trip.id} className="border-primary/30 shadow-[0_0_15px_rgba(245,158,11,0.1)]">
                <CardContent className="p-4">
                  <div className="flex justify-between items-start mb-4">
                    <Badge variant="warning" className="animate-pulse">New Request</Badge>
                    <span className="font-bold text-lg">${trip.estimatedFare}</span>
                  </div>
                  
                  <div className="space-y-3 mb-4 text-sm relative before:absolute before:inset-y-0 before:left-2 before:w-0.5 before:bg-border">
                    <div className="flex gap-3 relative">
                      <div className="w-4 h-4 rounded-full bg-primary flex-shrink-0 z-10 shadow-[0_0_10px_rgba(245,158,11,0.5)]" />
                      <p className="truncate text-foreground font-medium">{trip.pickupAddress}</p>
                    </div>
                    <div className="flex gap-3 relative">
                      <div className="w-4 h-4 rounded-full bg-emerald-500 flex-shrink-0 z-10" />
                      <p className="truncate text-muted-foreground">{trip.dropoffAddress}</p>
                    </div>
                  </div>

                  <div className="flex gap-2">
                    <Button 
                      className="flex-1" 
                      onClick={() => handleAccept(trip.id)}
                      isLoading={tripUpdateMutation.isPending}
                    >
                      Accept
                    </Button>
                    <Button variant="outline" className="flex-1">Reject</Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>

        <div className="lg:col-span-2 h-full bg-card rounded-2xl border border-border overflow-hidden relative">
          <div className="absolute top-4 left-4 z-20 bg-background/90 backdrop-blur-md px-4 py-2 rounded-lg border border-border shadow-lg font-mono text-sm">
            Lat: {profile?.currentLat?.toFixed(4) || "0.00"} | Lng: {profile?.currentLng?.toFixed(4) || "0.00"}
          </div>
          {/* Default center for demo */}
          <MapView 
            center={[profile?.currentLat || 40.7128, profile?.currentLng || -74.0060]} 
            zoom={14}
            markers={profile?.currentLat ? [{
              id: 'me',
              lat: profile.currentLat,
              lng: profile.currentLng,
              isDriver: true,
              title: "You are here"
            }] : []}
            className="h-full rounded-none border-none"
          />
        </div>
      </div>
    </div>
  );
}
