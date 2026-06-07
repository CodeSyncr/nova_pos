'use client'

import {
	ThemeProvider as NextThemeProvider,
	type ThemeProviderProps
} from 'next-themes'

export function ThemeProvider(props: ThemeProviderProps) {
	return (
		<NextThemeProvider
			attribute="class"
			defaultTheme="dark"
			forcedTheme="dark"
			enableSystem={false}
			disableTransitionOnChange
			{...props}
		/>
	)
}
