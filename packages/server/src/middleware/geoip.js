// IP enrichment placeholder

function enrichGeoIp(ip) {
  return { ip, country: "unknown" };
}

module.exports = { enrichGeoIp };
