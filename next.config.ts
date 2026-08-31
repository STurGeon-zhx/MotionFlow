import type {NextConfig} from 'next';

const nextConfig: NextConfig = {
  serverExternalPackages: ['better-sqlite3'],
  allowedDevOrigins: ['192.168.5.26'],
  agentRules: false,
};

export default nextConfig;
