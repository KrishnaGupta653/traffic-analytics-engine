export function createWebSocketClient(url: string) {
  return new WebSocket(url);
}
