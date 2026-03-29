export function haversineDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
    Math.cos((lat2 * Math.PI) / 180) *
    Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export interface RouteResult {
  distanceKm: number;
  durationMinutes: number;
}

export interface RoutingProvider {
  getRoute(fromLat: number, fromLng: number, toLat: number, toLng: number): Promise<RouteResult>;
}

type RoutingProviderType = "mock" | "osrm";

export class MockRoutingProvider implements RoutingProvider {
  async getRoute(fromLat: number, fromLng: number, toLat: number, toLng: number): Promise<RouteResult> {
    const distanceKm = haversineDistance(fromLat, fromLng, toLat, toLng);
    const durationMinutes = Math.ceil((distanceKm / 30) * 60);
    return {
      distanceKm: Math.round(distanceKm * 100) / 100,
      durationMinutes,
    };
  }
}

export class OSRMRoutingProvider implements RoutingProvider {
  private baseUrl: string;
  private timeoutMs: number;
  private fallback: MockRoutingProvider;

  constructor(baseUrl: string, timeoutMs: number = 3000) {
    this.baseUrl = baseUrl;
    this.timeoutMs = timeoutMs;
    this.fallback = new MockRoutingProvider();
  }

  async getRoute(fromLat: number, fromLng: number, toLat: number, toLng: number): Promise<RouteResult> {
    try {
      const controller = new AbortController();
      const id = setTimeout(() => controller.abort(), this.timeoutMs);

      // OSRM requires coordinates in Lng,Lat order
      const url = `${this.baseUrl}/route/v1/driving/${fromLng},${fromLat};${toLng},${toLat}?overview=false`;

      const response = await fetch(url, { signal: controller.signal });
      clearTimeout(id);

      if (!response.ok) {
        throw new Error(`OSRM responded with status ${response.status}`);
      }

      const data: any = await response.json();
      if (data.code !== "Ok" || !data.routes || data.routes.length === 0) {
        throw new Error(`OSRM route not found, code: ${data.code}`);
      }

      const route = data.routes[0];
      const distanceKm = route.distance / 1000;
      const durationMinutes = Math.ceil(route.duration / 60);

      return {
        distanceKm: Math.round(distanceKm * 100) / 100,
        durationMinutes,
      };
    } catch (error) {
      const isProduction = process.env.NODE_ENV === "production";
      const isTimeout = error instanceof Error && error.name === "AbortError";
      const reason = isTimeout
        ? `OSRM request timed out after ${this.timeoutMs}ms`
        : `OSRM request failed: ${error instanceof Error ? error.message : String(error)}`;

      if (isProduction) {
        console.error(
          `[Routing] FAIL-CLOSED - OSRM routing is unavailable in production.`,
          `Reason: ${reason}.`,
          `OSRM base URL: ${this.baseUrl}.`,
          `Coordinates: (${fromLat}, ${fromLng}) -> (${toLat}, ${toLng}).`
        );
        throw new Error(reason);
      }

      console.error(
        `[Routing] DEGRADED MODE - falling back to straight-line distance estimation.`,
        `Reason: ${reason}.`,
        `OSRM base URL: ${this.baseUrl}.`,
        `Coordinates: (${fromLat}, ${fromLng}) -> (${toLat}, ${toLng}).`,
        `Impact: dispatch distance ranking and fare estimates may be inaccurate.`
      );

      return this.fallback.getRoute(fromLat, fromLng, toLat, toLng);
    }
  }
}

let providerInstance: RoutingProvider | null = null;

function parseRoutingProviderType(rawProviderType: string | undefined): RoutingProviderType {
  if (rawProviderType === "mock" || rawProviderType === "osrm") {
    return rawProviderType;
  }

  throw new Error('ROUTING_PROVIDER must be explicitly set to "mock" or "osrm".');
}

export function getRoutingProvider(): RoutingProvider {
  if (providerInstance) return providerInstance;

  const nodeEnv = process.env.NODE_ENV;
  const providerType = parseRoutingProviderType(process.env.ROUTING_PROVIDER?.trim().toLowerCase());
  const osrmUrl = process.env.OSRM_BASE_URL?.trim();

  if (nodeEnv === "production" && providerType !== "osrm") {
    throw new Error('Production routing must use ROUTING_PROVIDER="osrm"; mock routing is not allowed.');
  }

  if (providerType === "osrm") {
    if (!osrmUrl) {
      throw new Error('OSRM_BASE_URL is required when ROUTING_PROVIDER="osrm".');
    }
    providerInstance = new OSRMRoutingProvider(osrmUrl);
  } else {
    providerInstance = new MockRoutingProvider();
  }

  return providerInstance;
}
