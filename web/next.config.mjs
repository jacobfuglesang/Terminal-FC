/** @type {import('next').NextConfig} */
const nextConfig = {
  poweredByHeader: false,
  // Fundamentet (content/fundament.md) leses fra fil ved kjøring: ta det med i serverpakken
  outputFileTracingIncludes: { "/fundament": ["./content/**"], "/api/ask": ["./content/**"], "/status": ["./content/**"], "/bookinger": ["./content/**"] },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Robots-Tag", value: "noindex, nofollow" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "no-referrer" },
        ],
      },
    ];
  },
};

export default nextConfig;
