/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    // ponytail: images never change; cache optimized variants ~1yr so the
    // optimizer stops re-pulling originals from Supabase every hour (egress fix).
    minimumCacheTTL: 31536000,
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'xgnfxghqiwsjhdhqmbus.supabase.co',
        pathname: '/storage/v1/object/public/**',
      },
      {
        protocol: 'https',
        hostname: '**',
      },
    ],
  },
  async rewrites() {
    return [
      {
        source: '/ingest/static/:path*',
        destination: 'https://eu-assets.i.posthog.com/static/:path*',
      },
      {
        source: '/ingest/:path*',
        destination: 'https://eu.i.posthog.com/:path*',
      },
      {
        source: '/ingest/flags',
        destination: 'https://eu.i.posthog.com/flags',
      },
    ];
  },
  async redirects() {
    return [
      {
        source: '/2022/11/28/:slug',
        destination: '/blog/na-rudai-is-mian-leat-mian-a-bheith-ionat-a-dheanamh',
        permanent: true,
      },
    ];
  },
  // This is required to support PostHog trailing slash API requests
  skipTrailingSlashRedirect: true,
};

export default nextConfig;
