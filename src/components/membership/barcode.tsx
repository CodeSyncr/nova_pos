'use client'

import React from 'react'

interface BarcodeProps {
	value: string
}

export function Barcode({ value }: BarcodeProps) {
	// Generate deterministic bars based on input value for a realistic Code-128 feel
	const generateBars = (input: string) => {
		const cleanInput = input.trim() || 'MEMBER'
		let hash = 0
		for (let i = 0; i < cleanInput.length; i++) {
			hash = cleanInput.charCodeAt(i) + ((hash << 5) - hash)
		}

		const bars: number[] = []
		
		// Start character pattern for Code 128
		bars.push(1, 1, 0, 1, 0, 0, 1, 1, 1, 0, 0)

		// Loop through input and generate line patterns
		for (let i = 0; i < cleanInput.length; i++) {
			const charCode = cleanInput.charCodeAt(i)
			// Generate pseudo patterns based on ASCII value
			const patternVal = (charCode * Math.abs(hash + i)) % 256
			for (let j = 0; j < 8; j++) {
				const bit = (patternVal >> j) & 1
				if (bit === 1) {
					bars.push(1, 1, 0)
				} else {
					bars.push(1, 0)
				}
			}
		}

		// Stop character pattern
		bars.push(1, 1, 0, 0, 1, 1, 1, 0, 1, 1, 0, 1, 1)
		return bars
	}

	const bars = generateBars(value)
	const barWidth = 2
	const height = 55
	const totalWidth = bars.length * barWidth

	return (
		<div className="flex flex-col items-center justify-center bg-white/95 px-5 py-3.5 rounded-2xl shadow-inner border border-white/20 select-none">
			<svg
				width="100%"
				height={height}
				viewBox={`0 0 ${totalWidth} ${height}`}
				preserveAspectRatio="none"
				className="max-w-[280px]"
			>
				<g fill="#0c0f1d">
					{bars.map((bar, index) => {
						if (bar === 1) {
							return (
								<rect
									key={index}
									x={index * barWidth}
									y={0}
									width={barWidth}
									height={height}
								/>
							)
						}
						return null
					})}
				</g>
			</svg>
			<span className="mt-2.5 font-mono text-[10px] text-slate-500 font-semibold tracking-[0.25em] uppercase">
				{value}
			</span>
		</div>
	)
}
