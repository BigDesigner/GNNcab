import { db } from "@workspace/db";
import {
  usersTable,
  driverProfilesTable,
  customerProfilesTable,
  citiesTable,
  zonesTable,
  driverZoneAssignmentsTable,
} from "@workspace/db/schema";
import bcrypt from "bcrypt";
import { eq } from "drizzle-orm";

const SALT_ROUNDS = 12;

async function hash(pw: string) {
  return bcrypt.hash(pw, SALT_ROUNDS);
}

async function main() {
  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "Seed aborted: scripts/src/seed.ts is development-only. Use pnpm --filter @workspace/scripts run bootstrap-admin for the first production admin."
    );
  }

  console.log("🌱 Seeding GNNcab database...");

  console.log("Development-only seed: this command is for local/test data only.");

  // Create admin
  const existing = await db.select().from(usersTable).where(eq(usersTable.email, "admin@gnncab.com")).limit(1);
  if (existing.length === 0) {
    await db.insert(usersTable).values({
      email: "admin@gnncab.com",
      passwordHash: await hash("Admin@1234!"),
      firstName: "System",
      lastName: "Admin",
      role: "admin",
      isActive: true,
    });
    console.log("✅ Admin user created: admin@gnncab.com / Admin@1234!");
  } else {
    console.log("⏭ Admin already exists");
  }

  // Create sample city
  let city;
  const existingCity = await db.select().from(citiesTable).where(eq(citiesTable.name, "Lagos")).limit(1);
  if (existingCity.length === 0) {
    [city] = await db.insert(citiesTable).values({
      name: "Lagos",
      country: "Nigeria",
      state: "Lagos State",
      timezone: "Africa/Lagos",
      lat: 6.5244,
      lng: 3.3792,
      isActive: true,
    }).returning();
    console.log("✅ City created: Lagos");
  } else {
    city = existingCity[0];
    console.log("⏭ City Lagos already exists");
  }

  // Create sample zones
  const zoneNames = ["Lagos Island", "Victoria Island", "Lekki", "Ikeja", "Surulere"];
  const zonePolygons: Array<{ lat: number; lng: number }[]> = [
    [{ lat: 6.45, lng: 3.38 }, { lat: 6.46, lng: 3.41 }, { lat: 6.44, lng: 3.43 }, { lat: 6.43, lng: 3.40 }],
    [{ lat: 6.42, lng: 3.40 }, { lat: 6.43, lng: 3.43 }, { lat: 6.41, lng: 3.44 }, { lat: 6.40, lng: 3.41 }],
    [{ lat: 6.43, lng: 3.45 }, { lat: 6.44, lng: 3.50 }, { lat: 6.42, lng: 3.52 }, { lat: 6.41, lng: 3.47 }],
    [{ lat: 6.59, lng: 3.33 }, { lat: 6.60, lng: 3.36 }, { lat: 6.58, lng: 3.37 }, { lat: 6.57, lng: 3.34 }],
    [{ lat: 6.50, lng: 3.34 }, { lat: 6.51, lng: 3.37 }, { lat: 6.49, lng: 3.38 }, { lat: 6.48, lng: 3.35 }],
  ];

  const zones: typeof zonesTable.$inferSelect[] = [];
  for (let i = 0; i < zoneNames.length; i++) {
    const existingZone = await db.select().from(zonesTable).where(eq(zonesTable.name, zoneNames[i])).limit(1);
    if (existingZone.length === 0) {
      const [zone] = await db.insert(zonesTable).values({
        cityId: city.id,
        name: zoneNames[i],
        polygon: zonePolygons[i],
        isActive: true,
      }).returning();
      zones.push(zone);
      console.log(`✅ Zone created: ${zoneNames[i]}`);
    } else {
      zones.push(existingZone[0]);
    }
  }

  // Create sample drivers
  const driverData = [
    { email: "driver1@gnncab.com", firstName: "Emeka", lastName: "Okafor", plate: "LG-123-XY", make: "Toyota", model: "Camry", color: "White" },
    { email: "driver2@gnncab.com", firstName: "Bola", lastName: "Adeyemi", plate: "LG-456-AB", make: "Honda", model: "Accord", color: "Silver" },
    { email: "driver3@gnncab.com", firstName: "Kemi", lastName: "Okonkwo", plate: "LG-789-CD", make: "Hyundai", model: "Elantra", color: "Black" },
  ];

  for (const d of driverData) {
    const existingDriver = await db.select().from(usersTable).where(eq(usersTable.email, d.email)).limit(1);
    if (existingDriver.length === 0) {
      const [user] = await db.insert(usersTable).values({
        email: d.email,
        passwordHash: await hash("Driver@1234!"),
        firstName: d.firstName,
        lastName: d.lastName,
        role: "driver",
        isActive: true,
      }).returning();

      const [profile] = await db.insert(driverProfilesTable).values({
        userId: user.id,
        vehiclePlate: d.plate,
        vehicleMake: d.make,
        vehicleModel: d.model,
        vehicleColor: d.color,
        vehicleYear: 2020,
        cityId: city.id,
        status: "AVAILABLE",
        isVerified: true,
        currentLat: 6.5244 + (Math.random() - 0.5) * 0.1,
        currentLng: 3.3792 + (Math.random() - 0.5) * 0.1,
        lastSeen: new Date(),
        licenseNumber: `LN-${Math.random().toString(36).slice(2, 8).toUpperCase()}`,
      }).returning();

      // Assign to first two zones
      if (zones.length > 0) {
        await db.insert(driverZoneAssignmentsTable).values({ driverId: profile.id, zoneId: zones[0].id }).onConflictDoNothing();
        if (zones.length > 1) {
          await db.insert(driverZoneAssignmentsTable).values({ driverId: profile.id, zoneId: zones[1].id }).onConflictDoNothing();
        }
      }

      console.log(`✅ Driver created: ${d.email} / Driver@1234!`);
    } else {
      console.log(`⏭ Driver ${d.email} already exists`);
    }
  }

  // Create sample customers
  const customerData = [
    { email: "customer1@gnncab.com", firstName: "Amara", lastName: "Nwosu" },
    { email: "customer2@gnncab.com", firstName: "Tunde", lastName: "Bakare" },
  ];

  for (const c of customerData) {
    const existingCustomer = await db.select().from(usersTable).where(eq(usersTable.email, c.email)).limit(1);
    if (existingCustomer.length === 0) {
      const [user] = await db.insert(usersTable).values({
        email: c.email,
        passwordHash: await hash("Customer@1234!"),
        firstName: c.firstName,
        lastName: c.lastName,
        role: "customer",
        isActive: true,
      }).returning();
      await db.insert(customerProfilesTable).values({ userId: user.id });
      console.log(`✅ Customer created: ${c.email} / Customer@1234!`);
    } else {
      console.log(`⏭ Customer ${c.email} already exists`);
    }
  }

  console.log("\n🎉 Seeding complete!");
  console.log("Login credentials:");
  console.log("  Admin:    admin@gnncab.com / Admin@1234!");
  console.log("  Drivers:  driver1@gnncab.com / Driver@1234! (and driver2, driver3)");
  console.log("  Customers: customer1@gnncab.com / Customer@1234! (and customer2)");

  process.exit(0);
}

main().catch((err) => {
  console.error("❌ Seed failed:", err);
  process.exit(1);
});
