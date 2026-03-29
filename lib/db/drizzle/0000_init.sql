CREATE TYPE "public"."driver_status" AS ENUM('AVAILABLE', 'RESERVED', 'BUSY', 'OFFLINE');--> statement-breakpoint
CREATE TYPE "public"."role" AS ENUM('admin', 'driver', 'customer');--> statement-breakpoint
CREATE TYPE "public"."payment_method" AS ENUM('cash', 'card', 'online');--> statement-breakpoint
CREATE TYPE "public"."trip_status" AS ENUM('REQUESTED', 'DRIVER_ASSIGNED', 'DRIVER_ACCEPTED', 'DRIVER_REJECTED', 'DRIVER_EN_ROUTE', 'DRIVER_ARRIVED', 'TRIP_STARTED', 'TRIP_COMPLETED', 'TRIP_CANCELLED', 'DRIVER_NO_RESPONSE', 'TIMEOUT');--> statement-breakpoint
CREATE TYPE "public"."payment_status" AS ENUM('PENDING', 'COMPLETED', 'FAILED', 'REFUNDED');--> statement-breakpoint
CREATE TABLE "audit_logs" (
	"id" text PRIMARY KEY NOT NULL,
	"entity" text NOT NULL,
	"entity_id" text,
	"action" text NOT NULL,
	"actor_id" text,
	"actor_role" text,
	"metadata" json,
	"ip_address" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cities" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"country" text NOT NULL,
	"state" text,
	"timezone" text DEFAULT 'UTC' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"lat" double precision,
	"lng" double precision,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "customer_profiles" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"preferred_payment_method" text,
	"total_trips" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "customer_profiles_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
CREATE TABLE "driver_profiles" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"license_number" text,
	"vehicle_make" text,
	"vehicle_model" text,
	"vehicle_year" integer,
	"vehicle_color" text,
	"vehicle_plate" text,
	"status" "driver_status" DEFAULT 'OFFLINE' NOT NULL,
	"is_verified" boolean DEFAULT false NOT NULL,
	"current_lat" double precision,
	"current_lng" double precision,
	"last_seen" timestamp with time zone,
	"city_id" text,
	"rating" numeric(3, 2),
	"total_trips" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "driver_profiles_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
CREATE TABLE "driver_zone_assignments" (
	"id" text PRIMARY KEY NOT NULL,
	"driver_id" text NOT NULL,
	"zone_id" text NOT NULL,
	"assigned_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "driver_zone_assignments_driver_id_zone_id_unique" UNIQUE("driver_id","zone_id")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" text PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"password_hash" text NOT NULL,
	"first_name" text NOT NULL,
	"last_name" text NOT NULL,
	"phone" text,
	"role" "role" DEFAULT 'customer' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "zones" (
	"id" text PRIMARY KEY NOT NULL,
	"city_id" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"polygon" json NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "trip_events" (
	"id" text PRIMARY KEY NOT NULL,
	"trip_id" text NOT NULL,
	"status" text NOT NULL,
	"actor_id" text,
	"actor_role" text,
	"metadata" json,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "trips" (
	"id" text PRIMARY KEY NOT NULL,
	"customer_id" text NOT NULL,
	"driver_id" text,
	"city_id" text,
	"pickup_lat" double precision NOT NULL,
	"pickup_lng" double precision NOT NULL,
	"pickup_address" text NOT NULL,
	"dropoff_lat" double precision NOT NULL,
	"dropoff_lng" double precision NOT NULL,
	"dropoff_address" text NOT NULL,
	"status" "trip_status" DEFAULT 'REQUESTED' NOT NULL,
	"distance_km" double precision,
	"estimated_fare" numeric(10, 2),
	"final_fare" numeric(10, 2),
	"currency" text DEFAULT 'USD' NOT NULL,
	"payment_method" "payment_method" DEFAULT 'cash' NOT NULL,
	"cancellation_reason" text,
	"notes" text,
	"requested_at" timestamp with time zone DEFAULT now() NOT NULL,
	"assigned_at" timestamp with time zone,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payments" (
	"id" text PRIMARY KEY NOT NULL,
	"trip_id" text NOT NULL,
	"amount" numeric(10, 2) NOT NULL,
	"currency" text DEFAULT 'USD' NOT NULL,
	"method" text DEFAULT 'cash' NOT NULL,
	"status" "payment_status" DEFAULT 'PENDING' NOT NULL,
	"transaction_id" text,
	"metadata" json,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "customer_profiles" ADD CONSTRAINT "customer_profiles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "driver_profiles" ADD CONSTRAINT "driver_profiles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "driver_profiles" ADD CONSTRAINT "driver_profiles_city_id_cities_id_fk" FOREIGN KEY ("city_id") REFERENCES "public"."cities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "driver_zone_assignments" ADD CONSTRAINT "driver_zone_assignments_driver_id_driver_profiles_id_fk" FOREIGN KEY ("driver_id") REFERENCES "public"."driver_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "driver_zone_assignments" ADD CONSTRAINT "driver_zone_assignments_zone_id_zones_id_fk" FOREIGN KEY ("zone_id") REFERENCES "public"."zones"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "zones" ADD CONSTRAINT "zones_city_id_cities_id_fk" FOREIGN KEY ("city_id") REFERENCES "public"."cities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trip_events" ADD CONSTRAINT "trip_events_trip_id_trips_id_fk" FOREIGN KEY ("trip_id") REFERENCES "public"."trips"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trips" ADD CONSTRAINT "trips_customer_id_users_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trips" ADD CONSTRAINT "trips_driver_id_driver_profiles_id_fk" FOREIGN KEY ("driver_id") REFERENCES "public"."driver_profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trips" ADD CONSTRAINT "trips_city_id_cities_id_fk" FOREIGN KEY ("city_id") REFERENCES "public"."cities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_trip_id_trips_id_fk" FOREIGN KEY ("trip_id") REFERENCES "public"."trips"("id") ON DELETE no action ON UPDATE no action;