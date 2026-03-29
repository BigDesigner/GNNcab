import React from "react";
import { useGetAdminUsers } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle, Table, TableBody, TableCell, TableHead, TableHeader, TableRow, Badge } from "@/components/ui";

export default function AdminUsers() {
  const { data: users, isLoading } = useGetAdminUsers({ limit: 50 });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-display font-bold">User Management</h1>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Joined</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow><TableCell colSpan={5} className="text-center py-8">Loading...</TableCell></TableRow>
              ) : users?.data?.map((u) => (
                <TableRow key={u.id}>
                  <TableCell className="font-medium">{u.firstName} {u.lastName}</TableCell>
                  <TableCell className="text-muted-foreground">{u.email}</TableCell>
                  <TableCell>
                    <Badge variant={u.role === 'admin' ? 'destructive' : u.role === 'driver' ? 'warning' : 'default'} className="uppercase text-[10px]">
                      {u.role}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center">
                      <div className={`h-2 w-2 rounded-full mr-2 ${u.isActive ? 'bg-emerald-500' : 'bg-red-500'}`} />
                      {u.isActive ? 'Active' : 'Inactive'}
                    </div>
                  </TableCell>
                  <TableCell className="text-muted-foreground">{new Date(u.createdAt).toLocaleDateString()}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
