import { EventEmitter } from 'node:events';

// In-process bus for agent state changes. The engine emits on every step and
// after each full tick; the admin SSE route subscribes to stream live updates
// to the dashboard.
export const agentEvents = new EventEmitter();
agentEvents.setMaxListeners(0);

export const AGENT_UPDATE = 'agent-update';
export const FLEET_UPDATE = 'fleet-update';
