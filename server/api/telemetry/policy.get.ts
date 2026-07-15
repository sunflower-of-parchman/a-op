import { loadTelemetryPolicy } from '../../utils/telemetry'

export default defineEventHandler((event) => loadTelemetryPolicy(event))
