import type { HTMLAttributes } from 'react'
import { cn } from '@/lib/utils'

export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
	return (
		<div
			{...props}
			className={cn(
				'rounded-[var(--radius)] border border-white/10 bg-white/10 p-6 backdrop-blur-lg shadow-[0_20px_60px_rgba(16,21,48,0.4)] dark:border-white/5 dark:bg-white/5',
				className
			)}
		/>
	)
}
