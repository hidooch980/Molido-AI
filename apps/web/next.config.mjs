/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Workspace packages ship TypeScript sources; Next compiles them with the app.
  transpilePackages: ['@molido/types'],
  poweredByHeader: false,
  // The repository root holds a second, legacy application. Pinning the trace
  // root stops Next inferring the wrong workspace boundary.
  outputFileTracingRoot: new URL('../../', import.meta.url).pathname,
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
        ],
      },
    ];
  },
};

export default nextConfig;
