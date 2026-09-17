import { EventEmitter } from 'node:events';

// In-process pub/sub for per-user account events (trades, order fills/expiry,
// balance changes). The WebSocket layer subscribes per connection and pushes
// these to the browser so the client can update without polling.
export const userEvents = new EventEmitter();
userEvents.setMaxListeners(0);

const channel = (userId) => `user:${userId}`;

// Notify a single user's subscribers. `event.type` tells the client what
// changed (e.g. 'trade', 'orders'); the client refetches the affected data.
export function notifyUser(userId, event) {
  userEvents.emit(channel(userId), event);
}

export function subscribeUser(userId, handler) {
  const name = channel(userId);
  userEvents.on(name, handler);
  return () => userEvents.off(name, handler);
}
