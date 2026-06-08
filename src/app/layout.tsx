import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import { Inter, Space_Mono } from 'next/font/google'
import { ThemeProvider } from '@/components/theme-provider'
import { ToastProvider } from '@/components/ui/toast'
import { PWAUpdatePrompt } from '@/components/pwa-update-prompt'
import { cn } from '@/lib/utils'
import './globals.css'

const inter = Inter({
	subsets: ['latin'],
	variable: '--font-geist-sans',
	display: 'swap'
})

const spaceMono = Space_Mono({
	subsets: ['latin'],
	weight: ['400', '700'],
	variable: '--font-geist-mono',
	display: 'swap'
})

export const metadata: Metadata = {
	title: 'Nova POS',
	description:
		'Premium restaurant POS platform with effortless onboarding and beautiful operations',
	icons: {
		icon: '/icon.svg'
	},
	manifest: '/manifest.json',
	appleWebApp: {
		capable: true,
		statusBarStyle: 'black-translucent',
		title: 'Nova POS'
	}
}

export const viewport = {
	width: 'device-width',
	initialScale: 1,
	maximumScale: 1,
	userScalable: false,
	themeColor: '#6F6BFF'
}

export default function RootLayout(props: Readonly<{ children: ReactNode }>) {
	return (
		<html lang="en" suppressHydrationWarning>
			<head>
				<meta name="apple-mobile-web-app-capable" content="yes" />
				<link rel="apple-touch-icon" href="/icon-192.svg" />
			</head>
			<body
				className={cn(
					'min-h-screen bg-[hsl(var(--background))] text-[hsl(var(--foreground))] antialiased overflow-y-auto',
					inter.variable,
					spaceMono.variable
				)}
			>
				<ThemeProvider>
					<ToastProvider>{props.children}</ToastProvider>
					<PWAUpdatePrompt />
				</ThemeProvider>
				<div className="grain" aria-hidden="true" />
				<script
					dangerouslySetInnerHTML={{
						__html: `
							if ('serviceWorker' in navigator) {
								window.addEventListener('load', () => {
									navigator.serviceWorker.register('/sw.js').catch(() => {})
								})
							}
						`
					}}
				/>
			</body>
		</html>
	)
}
