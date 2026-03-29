import React from "react";
import { useGetAdminStats, useGetTrips } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle, Badge, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui";
import { formatCurrency } from "@/lib/utils";
import { Users, Car, Map, DollarSign, Activity } from "lucide-react";
import { motion } from "framer-motion";

export default function AdminDashboard() {
  const { data: stats, isLoading: statsLoading } = useGetAdminStats();
  const { data: recentTrips } = useGetTrips({ limit: 5 });

  if (statsLoading) {
    return <div className="flex h-full items-center justify-center"><Activity className="animate-spin text-primary h-8 w-8" /></div>;
  }

  const statCards = [
    { title: "Total Revenue", value: formatCurrency(stats?.totalRevenue || 0), icon: DollarSign, color: "text-emerald-500", bg: "bg-emerald-500/10" },
    { title: "Active Trips", value: stats?.activeTrips || 0, icon: Map, color: "text-primary", bg: "bg-primary/10" },
    { title: "Active Drivers", value: stats?.activeDrivers || 0, icon: Car, color: "text-amber-500", bg: "bg-amber-500/10" },
    { title: "Total Users", value: (stats?.totalCustomers || 0) + (stats?.totalDrivers || 0), icon: Users, color: "text-blue-500", bg: "bg-blue-500/10" },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-display font-bold">Platform Overview</h1>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {statCards.map((stat, index) => (
          <motion.div
            key={stat.title}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.1 }}
          >
            <Card>
              <CardContent className="p-6 flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-muted-foreground mb-1">{stat.title}</p>
                  <h3 className="text-3xl font-bold">{stat.value}</h3>
                </div>
                <div className={`h-12 w-12 rounded-xl ${stat.bg} flex items-center justify-center`}>
                  <stat.icon className={`h-6 w-6 ${stat.color}`} />
                </div>
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Recent Activity</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>ID</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Fare</TableHead>
                  <TableHead>Date</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {recentTrips?.data?.map((trip) => (
                  <TableRow key={trip.id}>
                    <TableCell className="font-mono text-xs">{trip.id.substring(0,8)}</TableCell>
                    <TableCell>
                      <Badge variant={
                        trip.status === "TRIP_COMPLETED" ? "success" : 
                        trip.status === "TRIP_CANCELLED" ? "destructive" : "default"
                      }>
                        {trip.status.replace(/_/g, ' ')}
                      </Badge>
                    </TableCell>
                    <TableCell>{formatCurrency(trip.estimatedFare || 0)}</TableCell>
                    <TableCell className="text-muted-foreground">{new Date(trip.createdAt).toLocaleDateString()}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>System Health</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <div className="flex justify-between text-sm mb-1">
                <span className="text-muted-foreground">Cities Active</span>
                <span className="font-medium">{stats?.totalCities || 0}</span>
              </div>
              <div className="h-2 bg-muted rounded-full overflow-hidden"><div className="h-full bg-primary w-[80%]" /></div>
            </div>
            <div>
              <div className="flex justify-between text-sm mb-1">
                <span className="text-muted-foreground">Operational Zones</span>
                <span className="font-medium">{stats?.totalZones || 0}</span>
              </div>
              <div className="h-2 bg-muted rounded-full overflow-hidden"><div className="h-full bg-emerald-500 w-[95%]" /></div>
            </div>
            <div>
              <div className="flex justify-between text-sm mb-1">
                <span className="text-muted-foreground">Driver Acceptance Rate</span>
                <span className="font-medium">92%</span>
              </div>
              <div className="h-2 bg-muted rounded-full overflow-hidden"><div className="h-full bg-blue-500 w-[92%]" /></div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
