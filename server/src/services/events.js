import { EventEmitter } from 'node:events';

// In-process pub/sub for market events. The price simulator emits on this bus
// each tick, and the SSE route subscribes to stream updates to clients.
export const marketEvents = new EventEmitter();
// Many SSE connections may subscribe at once.
marketEvents.setMaxListeners(0);

export const TICK_EVENT = 'tick';
