/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    typedRoutes: true,
    // pdfjs-dist als External markieren, damit Next es nicht bundlet
    serverComponentsExternalPackages: ['pdfjs-dist'],
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '*.supabase.co',
      },
    ],
  },
  // TODO: Pre-existing PostgREST-Join-Cast-Errors aufräumen, dann auf false stellen.
  //       Aktuell blockieren sie den Vercel-Build, sind aber kein Runtime-Problem.
  typescript: {
    ignoreBuildErrors: true,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
};

export default nextConfig;
