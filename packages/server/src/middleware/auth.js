// API key validation placeholder

function validateApiKey(request) {
  return Boolean(request && request.headers && request.headers["x-api-key"]);
}

module.exports = { validateApiKey };
