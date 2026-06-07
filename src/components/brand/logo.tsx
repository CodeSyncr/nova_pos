import { Sparkles } from 'lucide-react'
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
			<span className="flex h-9 w-9 items-center justify-center rounded-2xl bg-gradient-to-br from-[#A98CFF] via-[#6F6BFF] to-[#4DD4FF] text-white shadow-[0_10px_30px_rgba(109,104,255,0.45)]">
				<Sparkles className="h-4 w-4" strokeWidth={1.8} />
			</span>
			{!collapsed && (
				<span className="tracking-tight">
					Nova<span className="text-[#7A74FF]">POS</span>
				</span>
			)}
		</div>
	)
}
