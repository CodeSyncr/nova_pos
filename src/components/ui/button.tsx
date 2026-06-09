import type { ButtonHTMLAttributes } from 'react'
import { Slot } from '@radix-ui/react-slot'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

const buttonVariants = cva(
	'inline-flex items-center justify-center whitespace-nowrap rounded-[calc(var(--radius)*0.9)] text-sm font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--accent))]/50 disabled:pointer-events-none disabled:opacity-60',
	{
		variants: {
			variant: {
				default:
					'bg-[hsl(var(--accent))] text-[hsl(var(--accent-foreground))] shadow-[0_10px_30px_-8px_hsl(var(--accent)/0.55)] hover:brightness-95',
				ghost:
					'bg-transparent text-[hsl(var(--foreground))] hover:bg-[hsl(var(--muted))]/60 border border-[hsl(var(--border))]/70',
				secondary:
					'bg-[hsl(var(--muted))] text-[hsl(var(--foreground))] hover:bg-[hsl(var(--muted))]/80 shadow-[0_10px_40px_rgba(15,15,30,0.15)]',
				link: 'text-[hsl(var(--foreground))] underline-offset-4 hover:underline'
			},
			size: {
				default: 'h-11 px-6',
				sm: 'h-9 px-4 text-xs uppercase tracking-wide',
				lg: 'h-14 px-8 text-base',
				icon: 'h-10 w-10'
			}
		},
		defaultVariants: {
			variant: 'default',
			size: 'default'
		}
	}
)

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> &
	VariantProps<typeof buttonVariants> & {
		asChild?: boolean
	}

export function Button({
	className,
	variant,
	size,
	asChild,
	...props
}: ButtonProps) {
	const Component = asChild ? Slot : 'button'

	return (
		<Component
			className={cn(buttonVariants({ variant, size }), className)}
			{...props}
		/>
	)
}

export { buttonVariants }
