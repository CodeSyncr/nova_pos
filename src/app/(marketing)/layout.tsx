import type { ReactNode } from 'react'

export default function MarketingLayout({ children }: { children: ReactNode }) {
	return (
		<div className="relative min-h-screen overflow-hidden bg-[#050611] text-white">
			<div className="pointer-events-none absolute inset-0">
				<div className="glow -top-32 left-1/2 h-96 w-96 -translate-x-1/2 bg-[#7B6CFF]/40" />
				<div className="glow bottom-0 left-20 h-72 w-72 bg-[#30F0FF]/30" />
				<div className="glow -bottom-10 right-10 h-80 w-80 bg-[#FF7ACB]/35" />
			</div>
			<main className="relative z-10">{children}</main>
		</div>
	)
}
