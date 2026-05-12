/** @type {import('next').NextConfig} */
const nextConfig = {
  serverExternalPackages: ['@google-cloud/translate', 'google-gax', '@grpc/grpc-js'],
  images: {
    unoptimized: true,
  },
}

export default nextConfig