'use client'

import { motion } from 'framer-motion'
import { cn } from '@/lib/utils'
import { Layers } from 'lucide-react'

type Tab = {
	id: string
	label: string
	icon: typeof Layers
}

type MenuTabsProps = {
	tabs: Tab[]
	activeTab: string
	onTabChange: (tabId: string) => void
	children: React.ReactNode
}

export function MenuTabs({
	tabs,
	activeTab,
	onTabChange,
	children
}: MenuTabsProps) {
	return (
		<div className="flex flex-col gap-6">
			{/* Tab Navigation */}
			<div className="flex gap-2 overflow-x-auto border-b border-white/10">
				{tabs.map((tab) => {
					const Icon = tab.icon
					const isActive = activeTab === tab.id
					return (
						<button
							key={tab.id}
							onClick={() => onTabChange(tab.id)}
							className={cn(
								'flex items-center gap-2 whitespace-nowrap border-b-2 px-4 py-3 text-sm font-medium transition',
								isActive
									? 'border-white/40 text-white'
									: 'border-transparent text-white/60 hover:text-white/80'
							)}
						>
							<Icon className="h-4 w-4" />
							{tab.label}
						</button>
					)
				})}
			</div>

			{/* Tab Content */}
			<motion.div
				key={activeTab}
				initial={{ opacity: 0, y: 10 }}
				animate={{ opacity: 1, y: 0 }}
				transition={{ duration: 0.2 }}
			>
				{children}
			</motion.div>
		</div>
	)
}
