# STANDARD.md

Legacy/supporting operator document only.
It is preserved for reference, but it is no longer the primary active bootstrap source.

## Architecture Principles

- Security first
- Production-ready code
- Portable infrastructure
- No vendor lock-in

## Technology Stack

### Backend
- Node.js
- TypeScript
- Express

### Frontend
- React
- Vite

### Database
- PostgreSQL

### Realtime
- WebSocket

## Deployment Target

- DigitalOcean Ubuntu VM
- Nginx
- PM2
- PostgreSQL

## Deployment Standards

- `/deploy` is part of the maintained codebase.
- Deployment scripts must always reflect the current application structure.
- Nginx, PM2, PostgreSQL, backup, environment, and SSL setup must remain aligned with the active codebase.
- Whenever new environment variables are introduced, deployment documentation and deployment scripts must be updated.
- Whenever build or start commands change, deployment scripts must be updated.
- Whenever ports, paths, domains, WebSocket routes, or static build outputs change, Nginx and PM2 configuration must be reviewed and updated if required.

## Language Standard

The project language is English.

English must be used in all project artifacts, including:

- Source code
- Variable names
- Function names
- Database schema
- API routes
- Comments
- Documentation
- Commit messages
- Configuration files

Turkish may only be used when communicating with the project owner outside the codebase.

## CORS Policy

Cross-Origin Resource Sharing must be explicitly configured.

Rules:

- Wildcard origins must never be allowed in production.
- Only trusted frontend domains may be allowed.
- Credentials must be enabled when cookies or authenticated requests are used.
- Preflight requests must be handled correctly.
- WebSocket origins must also be validated.

Development environments may allow localhost origins.

Example allowed origins:

- http://localhost:5173
- https://app.gnncab.com
- https://admin.gnncab.com
- https://nhtaxi.com
- https://app.nhtaxi.com
- https://admin.nhtaxi.com

## Security Requirements

The backend must implement:

- bcrypt password hashing
- JWT authentication
- Role-based access control
- Rate limiting
- CORS configuration
- Secure HTTP headers via helmet
- Request validation
- Audit logging

Wildcard CORS origins must never be allowed in production.

## Dispatch Zone Policy

Zones are optional operational metadata.  
Zones must not behave as hard dispatch boundaries.

Mandatory rules:

1. Dispatch candidate discovery must begin from all eligible drivers.
2. Driver eligibility must be determined only by:
   - availability
   - online state
   - no active trip
   - known location
3. Distance or routing ETA must always be the primary ranking factor.
4. Zones may only be used as a soft secondary preference or tie-break signal.
5. Zones must never exclude otherwise eligible drivers from candidate selection.
6. A clearly closer out-of-zone driver must never lose to a farther in-zone driver only because of zone assignment.
7. If the pickup location does not match any zone, dispatch must continue normally.
8. Sequential dispatch, reservation safety, timeout handling, and reject/no-response behavior must remain independent from zone matching.
