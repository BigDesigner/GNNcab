import { db } from "@workspace/db";
import { driverProfilesTable, tripsTable, tripEventsTable } from "@workspace/db/schema";
import { eq, and, inArray, isNull } from "drizzle-orm";
import { dispatchTrip, tryRedispatch } from "./dispatch.js";

const startupCleanupState = {
  completed: false,
  ok: false,
};

export function isStartupReady(): boolean {
  return startupCleanupState.completed && startupCleanupState.ok;
}

/**
 * Repairs restart-sensitive dispatch state that previously depended on
 * in-memory timers or async continuation inside the old Node.js process.
 *
 * This remains a temporary operational safeguard until dispatch orchestration
 * is moved to a durable job system.
 */
export async function runStartupCleanup(): Promise<void> {
  startupCleanupState.completed = false;
  startupCleanupState.ok = false;

  try {
    const now = new Date();
    const releasedDrivers = await db
      .update(driverProfilesTable)
      .set({ status: "AVAILABLE", updatedAt: now })
      .where(eq(driverProfilesTable.status, "RESERVED"))
      .returning({ id: driverProfilesTable.id });

    if (releasedDrivers.length > 0) {
      const releasedDriverIds = releasedDrivers.map((d) => d.id);
      const orphanedAssignedTrips = await db
        .select({ id: tripsTable.id, driverId: tripsTable.driverId })
        .from(tripsTable)
        .where(
          and(
            eq(tripsTable.status, "DRIVER_ASSIGNED"),
            inArray(tripsTable.driverId, releasedDriverIds)
          )
        );

      for (const trip of orphanedAssignedTrips) {
        await db.transaction(async (tx) => {
          await tx.update(tripsTable)
            .set({ status: "DRIVER_NO_RESPONSE", updatedAt: now })
            .where(eq(tripsTable.id, trip.id));

          await tx.insert(tripEventsTable).values({
            tripId: trip.id,
            status: "DRIVER_NO_RESPONSE",
            actorId: null,
            actorRole: "system",
            metadata: {
              reason: "startup_cleanup_lost_dispatch_timer",
              driverId: trip.driverId,
            },
          });
        });
      }

      console.warn(
        `[Startup] Released ${releasedDrivers.length} orphaned RESERVED driver(s) back to AVAILABLE.`,
        `Driver IDs: ${releasedDriverIds.join(", ")}`
      );

      if (orphanedAssignedTrips.length > 0) {
        console.warn(
          `[Startup] Reconciled ${orphanedAssignedTrips.length} orphaned DRIVER_ASSIGNED trip(s) to DRIVER_NO_RESPONSE.`,
          `Trip IDs: ${orphanedAssignedTrips.map((trip) => trip.id).join(", ")}`
        );
      }
    } else {
      console.log("[Startup] No orphaned RESERVED drivers found.");
    }

    const orphanedRedispatchTrips = await db
      .select({
        id: tripsTable.id,
        status: tripsTable.status,
      })
      .from(tripsTable)
      .where(inArray(tripsTable.status, ["DRIVER_NO_RESPONSE", "DRIVER_REJECTED"]));

    if (orphanedRedispatchTrips.length > 0) {
      console.warn(
        `[Startup] Resuming redispatch for ${orphanedRedispatchTrips.length} persisted DRIVER_NO_RESPONSE / DRIVER_REJECTED trip(s).`,
        `Trip IDs: ${orphanedRedispatchTrips.map((trip) => trip.id).join(", ")}`
      );

      for (const trip of orphanedRedispatchTrips) {
        await tryRedispatch(trip.id);
      }
    }

    const orphanedRequestedTrips = await db
      .select({
        id: tripsTable.id,
        pickupLat: tripsTable.pickupLat,
        pickupLng: tripsTable.pickupLng,
        cityId: tripsTable.cityId,
      })
      .from(tripsTable)
      .where(
        and(
          eq(tripsTable.status, "REQUESTED"),
          isNull(tripsTable.driverId)
        )
      );

    if (orphanedRequestedTrips.length > 0) {
      console.warn(
        `[Startup] Resuming dispatch for ${orphanedRequestedTrips.length} orphaned REQUESTED trip(s).`,
        `Trip IDs: ${orphanedRequestedTrips.map((trip) => trip.id).join(", ")}`
      );

      for (const trip of orphanedRequestedTrips) {
        await dispatchTrip(trip.id, trip.pickupLat, trip.pickupLng, trip.cityId ?? undefined);
      }
    }

    startupCleanupState.ok = true;
  } catch (err) {
    // Log and continue - a cleanup failure must never prevent the server from booting.
    console.error("[Startup] RESERVED driver cleanup failed:", err instanceof Error ? err.message : err);
  } finally {
    startupCleanupState.completed = true;
  }
}
