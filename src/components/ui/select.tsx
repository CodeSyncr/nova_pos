'use client'

import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ChevronDown, CheckCircle2 } from 'lucide-react'
import { cn } from '@/lib/utils'

export interface SelectOption {
	value: string
	label: string
	icon?: React.ComponentType<{ className?: string }>
	description?: string
	colorClass?: string // custom icon border/text color class
}

interface CustomSelectProps {
	value: string
	onChange: (value: string) => void
	options: SelectOption[]
	placeholder?: string
	className?: string
	triggerClassName?: string
	dropdownClassName?: string
	leadingIcon?: React.ComponentType<{ className?: string }>
	disabled?: boolean
}

export function CustomSelect({
	value,
	onChange,
	options,
	placeholder = 'Select option',
	className,
	triggerClassName,
	dropdownClassName,
	leadingIcon: LeadingIcon,
	disabled = false
}: CustomSelectProps) {
	const [isOpen, setIsOpen] = useState(false)
	const selectedOption = options.find((opt) => opt.value === value)

	return (
		<div className={cn("relative w-full", className)}>
			<button
				type="button"
				disabled={disabled}
				onClick={() => setIsOpen(!isOpen)}
				className={cn(
					"flex w-full items-center justify-between rounded-xl border border-white/10 bg-black/20 px-3.5 py-2.5 text-sm text-white focus:border-white/30 focus:outline-none hover:bg-white/[0.04] transition-all disabled:opacity-50 disabled:pointer-events-none cursor-pointer",
					isOpen && "border-white/30 bg-white/[0.02]",
					triggerClassName
				)}
			>
				<div className="flex items-center gap-2.5 text-left w-full overflow-hidden">
					{selectedOption ? (
						<>
							{selectedOption.icon ? (
								<div className={cn(
									"flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border",
									selectedOption.colorClass || "border-white/10 bg-white/5 text-white/60"
								)}>
									<selectedOption.icon className="h-4 w-4" />
								</div>
							) : LeadingIcon ? (
								<LeadingIcon className="h-4 w-4 text-white/50 shrink-0" />
							) : null}
							<div className="flex flex-col truncate leading-tight">
								<span className="font-medium text-white text-sm truncate">{selectedOption.label}</span>
								{selectedOption.description && (
									<span className="text-[10px] text-white/40 truncate mt-0.5">{selectedOption.description}</span>
								)}
							</div>
						</>
					) : (
						<>
							{LeadingIcon && <LeadingIcon className="h-4 w-4 text-white/40 shrink-0" />}
							<span className="text-white/45 truncate">{placeholder}</span>
						</>
					)}
				</div>
				<ChevronDown className={cn("h-4 w-4 text-white/40 transition-transform duration-200 shrink-0 ml-2", isOpen && "rotate-180")} />
			</button>

			<AnimatePresence>
				{isOpen && (
					<>
						{/* Overlay for clicking outside */}
						<div
							className="fixed inset-0 z-40 cursor-default"
							onClick={() => setIsOpen(false)}
						/>
						<motion.div
							initial={{ opacity: 0, y: -8, scale: 0.96 }}
							animate={{ opacity: 1, y: 0, scale: 1 }}
							exit={{ opacity: 0, y: -8, scale: 0.96 }}
							transition={{ duration: 0.15, ease: 'easeOut' }}
							className={cn(
								"absolute left-0 right-0 mt-2 z-50 max-h-64 overflow-y-auto rounded-2xl border border-white/10 bg-[#0C0D21]/95 backdrop-blur-xl p-1.5 shadow-[0_20px_50px_rgba(0,0,0,0.5)] scrollbar-thin scrollbar-thumb-white/10",
								dropdownClassName
							)}
						>
							{options.length === 0 ? (
								<div className="py-4 text-center text-sm text-white/40">No options available</div>
							) : (
								options.map((opt) => {
									const isSelected = opt.value === value
									const OptIcon = opt.icon
									return (
										<button
											key={opt.value}
											type="button"
											onClick={() => {
												onChange(opt.value)
												setIsOpen(false)
											}}
											className={cn(
												"flex w-full items-center justify-between rounded-xl p-2.5 text-left transition-all duration-150 border border-transparent cursor-pointer mb-0.5 last:mb-0",
												isSelected
													? "bg-white/10 border-white/10 text-white font-medium shadow-sm"
													: "text-white/70 hover:bg-white/5 hover:text-white"
											)}
										>
											<div className="flex items-center gap-2.5 min-w-0">
												{OptIcon && (
													<div className={cn(
														"flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border transition-all",
														isSelected
															? opt.colorClass || "border-white/10 bg-white/5 text-white"
															: "border-white/5 bg-white/5 text-white/40"
													)}>
														<OptIcon className="h-4.5 w-4.5" />
													</div>
												)}
												<div className="flex flex-col min-w-0 leading-normal">
													<span className="font-semibold text-sm text-white truncate">{opt.label}</span>
													{opt.description && (
														<span className="text-xs text-white/40 truncate">{opt.description}</span>
													)}
												</div>
											</div>
											{isSelected && (
												<div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#E0342A]/15 border border-[#E0342A]/30 text-[#E0342A]">
													<CheckCircle2 className="h-3 w-3" />
												</div>
											)}
										</button>
									)
								})
							)}
						</motion.div>
					</>
				)}
			</AnimatePresence>
		</div>
	)
}
