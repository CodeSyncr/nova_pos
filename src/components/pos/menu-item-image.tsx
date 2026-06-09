'use client'

import { useState } from 'react'
import { cn } from '@/lib/utils'

/**
 * Progressive menu-item image.
 * - Shows /placeholder.png immediately (and while the real image loads).
 * - Fades the real image in only once it's fully loaded.
 * - Falls back to the placeholder when there's no image or it fails to load.
 */
export function MenuItemImage({
	src,
	alt
}: {
	src: string | null
	alt: string
}) {
	const [loaded, setLoaded] = useState(false)
	const [failed, setFailed] = useState(false)

	return (
		<>
			{/* eslint-disable-next-line @next/next/no-img-element */}
			<img
				src="/placeholder.png"
				alt=""
				aria-hidden="true"
				className="absolute inset-0 h-full w-full object-cover"
			/>
			{src && !failed && (
				/* eslint-disable-next-line @next/next/no-img-element */
				<img
					src={src}
					alt={alt}
					loading="lazy"
					decoding="async"
					onLoad={() => setLoaded(true)}
					onError={() => setFailed(true)}
					className={cn(
						'absolute inset-0 h-full w-full object-cover transition-opacity duration-500 group-hover:scale-105',
						loaded ? 'opacity-100' : 'opacity-0'
					)}
				/>
			)}
		</>
	)
}
