import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import { Urbanist, Dancing_Script } from 'next/font/google'
import { ThemeProvider } from '@/components/theme-provider'
import { ToastProvider } from '@/components/ui/toast'
import { PWAUpdatePrompt } from '@/components/pwa-update-prompt'
import { cn } from '@/lib/utils'
import './globals.css'

const urbanist = Urbanist({
	subsets: ['latin'],
	variable: '--font-urbanist',
	display: 'swap'
})

const cursive = Dancing_Script({
	subsets: ['latin'],
	variable: '--font-cursive',
	display: 'swap'
})

export const metadata: Metadata = {
	title: 'POS',
	description:
		'Premium restaurant POS platform with effortless onboarding and beautiful operations',
	icons: {
		icon: '/favicon.png'
	},
	manifest: '/manifest.json',
	appleWebApp: {
		capable: true,
		statusBarStyle: 'black-translucent',
		title: 'POS'
	}
}

export const viewport = {
	width: 'device-width',
	initialScale: 1,
	maximumScale: 1,
	userScalable: false,
	themeColor: '#E0342A'
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
					urbanist.variable,
					cursive.variable
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
