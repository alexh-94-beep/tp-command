import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Repo-Root explizit setzen – sonst waehlt Next faelschlich ein
  // uebergeordnetes Verzeichnis mit fremdem Lockfile als Workspace-Root.
  turbopack: { root: import.meta.dirname },
  // typedRoutes ist in Next 15+/16 stabil und top-level (nicht mehr experimental).
  typedRoutes: true,
  // serverExternalPackages (vormals experimental.serverComponentsExternalPackages):
  // schwere, rein serverseitige Libraries werden hier gelistet damit Next sie
  // nicht in den Edge/Client-Bundle ziehen will.
  serverExternalPackages: ['pdf-lib'],
  images: {
    remotePatterns: [{ protocol: 'https', hostname: '*.supabase.co' }],
  },
};

export default nextConfig;
