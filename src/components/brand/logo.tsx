import Image from 'next/image'
import { cn } from '@/lib/utils'

type LogoProps = {
	className?: string
	collapsed?: boolean
}

export function Logo({ className, collapsed = false }: LogoProps) {
	return (
		<div
			className={cn('flex items-center gap-2 text-lg font-semibold', className)}
		>
			<span className="relative flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-white/10 shadow-[0_10px_30px_rgba(224,52,42,0.35)]">
				<Image
					src="/favicon.png"
					alt="Pizzeria Da Cafe"
					fill
					sizes="36px"
					className="object-cover"
				/>
			</span>
			{!collapsed && <span className="tracking-tight text-white">POS</span>}
		</div>
	)
}
