export async function fetchSessions() {
  const response = await fetch("/api/sessions");
  return response.json();
}
