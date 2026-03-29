import React from "react";
import { useGetTrips } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle, Table, TableBody, TableCell, TableHead, TableHeader, TableRow, Badge, Button } from "@/components/ui";
import { formatCurrency } from "@/lib/utils";
import { RefreshCw, Search } from "lucide-react";

export default function AdminTrips() {
  const { data: trips, refetch, isFetching } = useGetTrips({ limit: 50 });

  return (
    <div className="space-y-6 h-full flex flex-col">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-display font-bold">Trip Monitoring</h1>
          <p className="text-muted-foreground mt-1">Live overview of all trips</p>
        </div>
        <Button variant="outline" onClick={() => refetch()} isLoading={isFetching}>
          <RefreshCw className="mr-2 h-4 w-4" /> Refresh
        </Button>
      </div>

      <Card className="flex-1 flex flex-col overflow-hidden">
        <CardContent className="p-0 flex-1 overflow-auto">
          <Table>
            <TableHeader className="sticky top-0 bg-card z-10 shadow-sm">
              <TableRow>
                <TableHead>Trip ID</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Pickup</TableHead>
                <TableHead>Dropoff</TableHead>
                <TableHead>Fare</TableHead>
                <TableHead>Method</TableHead>
                <TableHead>Date</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {trips?.data?.map((trip) => (
                <TableRow key={trip.id}>
                  <TableCell className="font-mono text-xs opacity-70">{trip.id.substring(0,8)}</TableCell>
                  <TableCell>
                    <Badge variant={
                      trip.status === "TRIP_COMPLETED" ? "success" : 
                      trip.status === "TRIP_CANCELLED" ? "destructive" : 
                      trip.status === "REQUESTED" ? "warning" : "default"
                    }>
                      {trip.status.replace(/_/g, ' ')}
                    </Badge>
                  </TableCell>
                  <TableCell className="max-w-[200px] truncate" title={trip.pickupAddress}>{trip.pickupAddress}</TableCell>
                  <TableCell className="max-w-[200px] truncate" title={trip.dropoffAddress}>{trip.dropoffAddress}</TableCell>
                  <TableCell>{formatCurrency(trip.estimatedFare || 0)}</TableCell>
                  <TableCell className="capitalize">{trip.paymentMethod}</TableCell>
                  <TableCell className="text-muted-foreground whitespace-nowrap">
                    {new Date(trip.createdAt).toLocaleString()}
                  </TableCell>
                </TableRow>
              ))}
              {!trips?.data?.length && (
                <TableRow>
                  <TableCell colSpan={7} className="h-32 text-center text-muted-foreground">
                    No trips found.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
