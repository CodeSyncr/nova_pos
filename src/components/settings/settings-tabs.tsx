'use client'

import { cn } from '@/lib/utils'

type Tab = {
	id: string
	label: string
	icon: string
}

type SettingsTabsProps = {
	tabs: Tab[]
	activeTab: string
	onTabChange: (tabId: string) => void
	children: React.ReactNode
}

export function SettingsTabs({
	tabs,
	activeTab,
	onTabChange,
	children
}: SettingsTabsProps) {
	return (
		<div className="flex flex-col gap-6">
			<div className="flex gap-2 overflow-x-auto border-b border-white/10 pb-2">
				{tabs.map((tab) => (
					<button
						key={tab.id}
						onClick={() => onTabChange(tab.id)}
						className={cn(
							'flex items-center gap-2 whitespace-nowrap rounded-t-xl border-b-2 border-transparent px-4 py-2 text-sm font-medium transition-colors',
							activeTab === tab.id
								? 'border-white/40 bg-white/5 text-white'
								: 'text-white/60 hover:text-white/80'
						)}
					>
						<span>{tab.icon}</span>
						<span>{tab.label}</span>
					</button>
				))}
			</div>

			<div className="rounded-[32px] border border-white/10 bg-white/5 p-6 backdrop-blur-2xl">
				{children}
			</div>
		</div>
	)
}
