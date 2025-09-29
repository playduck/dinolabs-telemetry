# D.I.N.O.labs Telemetry Interface

## Architecture
- Two Node.js servers in `apps/`: `gse` (ground station) and `inet` (internet/public)
- `gse` connects to rocketry via TCP/COBS/protobuf, serves local web at :8080
- `inet` provides public REST API with HTTP basic auth
- Frontend in `apps/public/` (Solid.js), served at localhost:8083 during dev
- Python test tools in `test/` for mock data generation

## Key Files
- `apps/config.json` - server configuration (TCP endpoints, ports)
- `apps/secrets.json` - API credentials for HTTP basic auth
- `build-frontend.js` - frontend build script
- Protocol: COBS-encoded protobufs over TCP from rocketry

## Dev Notes
- In Solid.js, always pass signal accessor functions (not their computed values) to components, and ensure signals are called within reactive contexts like createMemo or during render. Breaking the reactivity chain by pre-computing values outside the component prevents Solid from tracking dependencies and updating the UI.
