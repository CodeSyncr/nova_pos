/** @type {import('next').NextConfig} */
const nextConfig = {
	output: process.platform === "win32" ? undefined : "standalone",
	images: {
    	remotePatterns: [{ protocol: "https", hostname: "**" }],
  	},
    experimental: {
    	serverActions: {
      		bodySizeLimit: "500mb",
    	},
    	proxyClientMaxBodySize: "500mb",
  },
}

export default nextConfig
