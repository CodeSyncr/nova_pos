/** @type {import('next').NextConfig} */
const nextConfig = {
	output: process.platform === "win32" ? undefined : "standalone",
	// Playwright drives a real Chromium for the Zomato login. It must be
	// required at runtime, not traced into the bundle — bundling breaks its
	// browser-path resolution and would drag the driver into the build.
	serverExternalPackages: ["playwright-core"],
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
