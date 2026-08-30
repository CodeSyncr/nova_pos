'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { motion } from 'framer-motion'
import { useRouter } from 'next/navigation'
import {
	MessageSquare,
	Send,
	Loader2,
	Plus,
	Sparkles,
	ShoppingBasket,
	Check,
	X,
	Search,
	ChevronLeft,
	IndianRupee
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { createSupabaseBrowserClient } from '@/lib/supabase/client'
import { useToast } from '@/components/ui/toast'
import {
	getConversations,
	getMessages,
	sendMessage,
	markConversationRead,
	startDirectConversation,
	createGroupConversation,
	getTeamMembers,
	getMessageAnalyses,
	canSeeAmounts,
	type MessageAnalysis,
	type ChatConversation,
	type ChatMessage
} from '@/app/actions/chat'
import { Avatar, MessageBubble, DateDivider, AmbientField, EmptyThread, AnalysisCard } from './chat-ui'
import {
	canReviewPurchases,
	getPendingPurchases,
	approvePendingPurchase,
	rejectPendingPurchase,
	undoApprovedPurchase,
	getPurchaseInsights,
	type PendingPurchase,
	type PurchaseInsights
} from '@/app/actions/purchase-review'

type Tab = 'chats' | 'review' | 'insights'

function timeLabel(iso: string) {
	const date = new Date(iso)
	const today = new Date()
	const sameDay = date.toDateString() === today.toDateString()
	return sameDay
		? date.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true })
		: date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })
}

/** "Today" / "Yesterday" / a date, for the day separator pills. */
function dayLabel(iso: string) {
	const date = new Date(iso)
	const today = new Date()
	const yesterday = new Date(today)
	yesterday.setDate(yesterday.getDate() - 1)

	if (date.toDateString() === today.toDateString()) return 'Today'
	if (date.toDateString() === yesterday.toDateString()) return 'Yesterday'
	return date.toLocaleDateString('en-IN', { day: '2-digit', month: 'long', year: 'numeric' })
}

/** Clock time inside a bubble. */
function clockLabel(iso: string) {
	return new Date(iso).toLocaleTimeString('en-IN', {
		hour: '2-digit',
		minute: '2-digit',
		hour12: true
	})
}

function conversationTitle(c: ChatConversation) {
	if (c.kind === 'direct') return c.counterpartName || 'Direct message'
	return c.name || 'Group'
}

export default function ChatPage() {
	const router = useRouter()
	const { success, error: showError } = useToast()

	const [tenantId, setTenantId] = useState('')
	const [currencySymbol, setCurrencySymbol] = useState('₹')
	const [userId, setUserId] = useState('')
	const [loading, setLoading] = useState(true)

	const [tab, setTab] = useState<Tab>('chats')
	const [conversations, setConversations] = useState<ChatConversation[]>([])
	const [activeId, setActiveId] = useState<string | null>(null)
	const [messages, setMessages] = useState<ChatMessage[]>([])
	const [draft, setDraft] = useState('')
	const [sending, setSending] = useState(false)
	const [search, setSearch] = useState('')

	// Purchase review — only rendered when the user holds the permission.
	const [canReview, setCanReview] = useState(false)
	const [pending, setPending] = useState<PendingPurchase[]>([])
	const [insights, setInsights] = useState<PurchaseInsights | null>(null)

	// New conversation
	const [showNew, setShowNew] = useState(false)
	const [team, setTeam] = useState<{ id: string; name: string; avatarUrl: string | null }[]>([])
	const [newMode, setNewMode] = useState<'direct' | 'group'>('direct')
	const [groupName, setGroupName] = useState('')
	const [selectedMembers, setSelectedMembers] = useState<string[]>([])

	// AI verdict per message, keyed by message id, for the inline cards.
	const [analyses, setAnalyses] = useState<Record<string, MessageAnalysis>>({})
	const [seesAmounts, setSeesAmounts] = useState(false)

	const bottomRef = useRef<HTMLDivElement>(null)

	useEffect(() => {
		const load = async () => {
			const supabase = createSupabaseBrowserClient()
			const {
				data: { user }
			} = await supabase.auth.getUser()
			if (!user) {
				router.push('/login')
				return
			}
			setUserId(user.id)

			const { data: pts } = await supabase
				.from('profile_tenants')
				.select('tenant:tenants(id, settings)')
				.eq('profile_id', user.id)
				.limit(1)

			type EmbeddedTenant = { id: string; settings: Record<string, unknown> | null }
			const pt = pts && pts.length > 0 ? pts[0] : null
			const embedded = pt?.tenant as unknown as EmbeddedTenant | EmbeddedTenant[] | null | undefined
			const tenant = Array.isArray(embedded) ? embedded[0] : embedded
			if (!tenant) {
				router.push('/dashboard')
				return
			}

			setTenantId(tenant.id)
			const settings = tenant.settings as Record<string, unknown> | null
			if (settings?.currencySymbol) setCurrencySymbol(settings.currencySymbol as string)

			setCanReview(await canReviewPurchases())
			setSeesAmounts(await canSeeAmounts())
			setLoading(false)
		}
		load()
	}, [router])

	const loadConversations = useCallback(async () => {
		try {
			setConversations(await getConversations())
		} catch (err) {
			showError(err instanceof Error ? err.message : 'Failed to load chats')
		}
	}, [showError])

	useEffect(() => {
		if (!loading) loadConversations()
	}, [loading, loadConversations])

	const loadMessages = useCallback(
		async (conversationId: string) => {
			try {
				const rows = await getMessages(conversationId)
				setMessages(rows)

				const found = await getMessageAnalyses(rows.map((m) => m.id))
				setAnalyses(Object.fromEntries(found.map((a) => [a.messageId, a])))

				await markConversationRead(conversationId)
				loadConversations()
			} catch (err) {
				showError(err instanceof Error ? err.message : 'Failed to load messages')
			}
		},
		[showError, loadConversations]
	)

	useEffect(() => {
		if (activeId) {
			loadMessages(activeId)
		}
	}, [activeId, loadMessages])

	// Live delivery. RLS applies to realtime payloads too, so a restricted
	// channel is not leaked through this subscription.
	useEffect(() => {
		if (!activeId) return
		const supabase = createSupabaseBrowserClient()

		const channel = supabase
			.channel(`messages:${activeId}`)
			.on(
				'postgres_changes',
				{
					event: 'INSERT',
					schema: 'public',
					table: 'messages',
					filter: `conversation_id=eq.${activeId}`
				},
				() => {
					// Refetch rather than trusting the payload: the row arrives
					// without the joined sender name.
					loadMessages(activeId)
				}
			)
			.subscribe()

		return () => {
			supabase.removeChannel(channel)
		}
	}, [activeId, loadMessages])

	useEffect(() => {
		bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
	}, [messages])

	const loadReview = useCallback(async () => {
		if (!canReview) return
		try {
			const end = new Date()
			const start = new Date(end)
			start.setDate(start.getDate() - 30)
			const [rows, ins] = await Promise.all([
				getPendingPurchases('pending'),
				getPurchaseInsights(start.toISOString(), end.toISOString())
			])
			setPending(rows)
			setInsights(ins)
		} catch (err) {
			showError(err instanceof Error ? err.message : 'Failed to load review queue')
		}
	}, [canReview, showError])

	useEffect(() => {
		if (tab === 'review' || tab === 'insights') loadReview()
	}, [tab, loadReview])

	const handleSend = async () => {
		if (!activeId || !draft.trim() || !tenantId) return
		const body = draft.trim()
		setDraft('')
		setSending(true)
		try {
			await sendMessage({ conversationId: activeId, tenantId, body })
			await loadMessages(activeId)
			if (canReview) loadReview()
		} catch (err) {
			setDraft(body)
			showError(err instanceof Error ? err.message : 'Failed to send')
		} finally {
			setSending(false)
		}
	}

	const openNew = async () => {
		setShowNew(true)
		try {
			setTeam(await getTeamMembers(tenantId))
		} catch (err) {
			showError(err instanceof Error ? err.message : 'Failed to load team')
		}
	}

	const handleStartDirect = async (profileId: string) => {
		try {
			const { id } = await startDirectConversation(tenantId, profileId)
			setShowNew(false)
			await loadConversations()
			setActiveId(id)
		} catch (err) {
			showError(err instanceof Error ? err.message : 'Failed to start chat')
		}
	}

	const handleCreateGroup = async () => {
		try {
			const { id } = await createGroupConversation({
				tenantId,
				name: groupName,
				memberIds: selectedMembers
			})
			setShowNew(false)
			setGroupName('')
			setSelectedMembers([])
			await loadConversations()
			setActiveId(id)
		} catch (err) {
			showError(err instanceof Error ? err.message : 'Failed to create group')
		}
	}

	const handleUndo = async (entryId: string) => {
		try {
			await undoApprovedPurchase(entryId)
			success('Removed from books')
			if (activeId) await loadMessages(activeId)
			if (canReview) loadReview()
		} catch (err) {
			showError(err instanceof Error ? err.message : 'Could not undo')
		}
	}

	const handleApprove = async (id: string) => {
		try {
			await approvePendingPurchase(id)
			success('Purchase logged')
			loadReview()
		} catch (err) {
			showError(err instanceof Error ? err.message : 'Could not approve')
		}
	}

	const handleReject = async (id: string) => {
		try {
			await rejectPendingPurchase(id)
			loadReview()
		} catch (err) {
			showError(err instanceof Error ? err.message : 'Could not reject')
		}
	}

	if (loading) {
		return (
			<div className="flex h-[60vh] items-center justify-center">
				<Loader2 className="h-6 w-6 animate-spin text-[hsl(var(--accent))]" />
			</div>
		)
	}

	const active = conversations.find((c) => c.id === activeId) ?? null
	const filtered = conversations.filter((c) =>
		conversationTitle(c).toLowerCase().includes(search.toLowerCase())
	)

	return (
		<div className="space-y-4 pb-6">
			{/* Header */}
			<div className="flex flex-wrap items-center justify-between gap-3">
				<div>
					<h1 className="flex items-center gap-2.5 text-xl font-semibold tracking-tight text-white sm:text-2xl">
						<span className="flex h-9 w-9 items-center justify-center rounded-2xl bg-gradient-to-br from-[hsl(var(--accent))] to-[hsl(var(--accent))]/70 shadow-[0_10px_28px_-8px_hsl(var(--accent)/0.7)]">
							<MessageSquare className="h-[18px] w-[18px] text-white" />
						</span>
						Sanchay
					</h1>
					<p className="mt-1 hidden text-xs text-white/40 sm:block">
						Team messages, with expenses captured as you type
					</p>
				</div>

				{/* Segmented control */}
				<div className="flex shrink-0 gap-1 rounded-2xl border border-white/[0.08] bg-white/[0.03] p-1 backdrop-blur-xl">
					{(['chats', 'review', 'insights'] as Tab[])
						// Review and Insights are financial: hidden unless the user
						// holds the purchases permission.
						.filter((t) => t === 'chats' || canReview)
						.map((t) => (
							<button
								key={t}
								onClick={() => setTab(t)}
								className={`relative rounded-xl px-4 py-1.5 text-xs font-medium capitalize transition-colors ${
									tab === t ? 'text-white' : 'text-white/45 hover:text-white/70'
								}`}
							>
								{tab === t && (
									<motion.span
										layoutId="chat-tab"
										className="absolute inset-0 rounded-xl bg-gradient-to-br from-[hsl(var(--accent))] to-[hsl(var(--accent))]/75 shadow-[0_8px_22px_-8px_hsl(var(--accent)/0.8)]"
										transition={{ type: 'spring', stiffness: 400, damping: 32 }}
									/>
								)}
								<span className="relative z-10">
									{t}
									{t === 'review' && pending.length > 0 && (
										<span className="ml-1.5 rounded-full bg-white/20 px-1.5 py-0.5 text-[10px]">
											{pending.length}
										</span>
									)}
								</span>
							</button>
						))}
				</div>
			</div>

			{tab === 'chats' && (
				<div className="grid gap-0 overflow-hidden rounded-[calc(var(--radius)*1.4)] border border-white/10 bg-[hsl(var(--card))]/60 shadow-[0_40px_120px_rgba(3,5,18,0.85)] backdrop-blur-2xl lg:grid-cols-[minmax(300px,360px)_1fr]">
					{/* Conversation rail */}
					<div
						className={`${
							activeId ? 'hidden lg:flex' : 'flex'
						} h-[calc(100dvh-13rem)] flex-col border-r border-white/[0.07] lg:h-[74vh]`}
					>
						<div className="flex items-center gap-2 p-3.5">
							<div className="relative flex-1">
								<Search className="absolute left-3.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-white/30" />
								<input
									value={search}
									onChange={(e) => setSearch(e.target.value)}
									placeholder="Search conversations"
									className="h-10 w-full rounded-2xl border border-white/[0.08] bg-white/[0.04] pl-9 pr-3 text-[13px] text-white/85 outline-none transition-colors placeholder:text-white/30 focus:border-[hsl(var(--accent))]/40 focus:bg-white/[0.06]"
								/>
							</div>
							<button
								onClick={openNew}
								title="New conversation"
								className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-[hsl(var(--accent))] to-[hsl(var(--accent))]/75 text-white shadow-[0_10px_28px_-8px_hsl(var(--accent)/0.7)] transition-transform hover:scale-105"
							>
								<Plus className="h-4.5 w-4.5" />
							</button>
						</div>

						<div className="flex-1 space-y-1 overflow-y-auto px-2 pb-3">
							{filtered.length === 0 ? (
								<p className="px-4 py-10 text-center text-xs text-white/35">
									No conversations yet.
									<br />
									Tap + to message a teammate.
								</p>
							) : (
								filtered.map((c) => {
									const isActive = c.id === activeId
									return (
										<button
											key={c.id}
											onClick={() => setActiveId(c.id)}
											className={`group relative flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-left transition-all ${
												isActive
													? 'bg-white/[0.07] shadow-[0_8px_24px_rgba(0,0,0,0.35)]'
													: 'hover:bg-white/[0.035]'
											}`}
										>
											{/* Accent rail marks the open conversation. */}
											{isActive && (
												<span className="absolute left-0 top-1/2 h-7 w-[3px] -translate-y-1/2 rounded-r-full bg-[hsl(var(--accent))]" />
											)}
											<Avatar name={conversationTitle(c)} kind={c.kind} />
											<div className="min-w-0 flex-1">
												<div className="flex items-baseline justify-between gap-2">
													<span
														className={`truncate text-[14px] ${
															c.unreadCount > 0
																? 'font-semibold text-white'
																: 'font-medium text-white/80'
														}`}
													>
														{conversationTitle(c)}
													</span>
													{c.lastMessageAt && (
														<span className="flex-shrink-0 text-[10px] text-white/35">
															{timeLabel(c.lastMessageAt)}
														</span>
													)}
												</div>
												<div className="mt-0.5 flex items-center justify-between gap-2">
													<p
														className={`truncate text-[12px] ${
															c.unreadCount > 0 ? 'text-white/70' : 'text-white/40'
														}`}
													>
														{c.lastMessagePreview || 'No messages yet'}
													</p>
													{c.unreadCount > 0 && (
														<span className="flex h-[19px] min-w-[19px] flex-shrink-0 items-center justify-center rounded-full bg-[hsl(var(--accent))] px-1.5 text-[10px] font-bold text-white shadow-[0_4px_12px_-2px_hsl(var(--accent)/0.8)]">
															{c.unreadCount}
														</span>
													)}
												</div>
											</div>
										</button>
									)
								})
							)}
						</div>
					</div>

					{/* Thread */}
					<div
						className={`${
							activeId ? 'flex' : 'hidden lg:flex'
						} relative h-[calc(100dvh-13rem)] flex-col lg:h-[74vh]`}
					>
						<AmbientField />

						{!active ? (
							<EmptyThread />
						) : (
							<>
								<div className="relative z-10 flex items-center justify-between gap-3 border-b border-white/[0.07] px-3 py-3 backdrop-blur-xl lg:px-4">
									<div className="flex min-w-0 items-center gap-2.5 lg:gap-3">
										{/* Mobile is single-pane, so the thread needs a way back. */}
										<button
											onClick={() => setActiveId(null)}
											aria-label="Back to conversations"
											className="-ml-1 flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl text-white/60 transition-colors hover:bg-white/[0.06] hover:text-white lg:hidden"
										>
											<ChevronLeft className="h-5 w-5" />
										</button>
										<Avatar name={conversationTitle(active)} kind={active.kind} size="sm" />
										<div className="min-w-0">
											<p className="truncate text-[15px] font-semibold text-white/90">
												{conversationTitle(active)}
											</p>
											<p className="truncate text-[11px] text-white/40">
												{active.kind === 'direct'
													? 'Direct message'
													: `${active.memberCount} members`}
											</p>
										</div>
									</div>
									{/* AI now reads every message automatically; nothing to trigger. */}
									<span className="hidden items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-[10px] font-medium text-white/45 sm:flex">
										<Sparkles className="h-3 w-3 text-[hsl(var(--accent))]" />
										AI watching
									</span>
								</div>

								<div className="relative z-10 flex-1 overflow-y-auto px-3 py-3 sm:px-4 md:px-8">
									{messages.map((m, i) => {
										const prev = i > 0 ? messages[i - 1] : null
										const mine = m.senderId === userId
										const newDay =
											!prev ||
											new Date(prev.createdAt).toDateString() !==
												new Date(m.createdAt).toDateString()
										const startsRun = newDay || !prev || prev.senderId !== m.senderId

										if (m.kind === 'system') {
											return (
												<div key={m.id}>
													{newDay && <DateDivider label={dayLabel(m.createdAt)} />}
													<p className="my-2 text-center text-[11px] text-white/30">{m.body}</p>
												</div>
											)
										}

										return (
											<div key={m.id}>
												{newDay && <DateDivider label={dayLabel(m.createdAt)} />}
												<MessageBubble
													index={i}
													mine={mine}
													body={m.body}
													time={clockLabel(m.createdAt)}
													senderName={m.senderName}
													showSender={startsRun && active.kind !== 'direct'}
													showTail={startsRun}
													deleted={!!m.deletedAt}
													read={false}
												/>
												{/* The AI's read of this message. Shown to whoever wrote
												    it, and to anyone who may see amounts. */}
												{analyses[m.id] && (mine || seesAmounts) && (
													<AnalysisCard
														analysis={analyses[m.id]!}
														mine={mine}
														currency={currencySymbol}
														showAmounts={seesAmounts}
														canShare={canReview}
														onUndo={handleUndo}
													/>
												)}
											</div>
										)
									})}
									<div ref={bottomRef} />
								</div>

								<div className="relative z-10 flex items-end gap-2.5 border-t border-white/[0.07] p-3.5 backdrop-blur-xl">
									<textarea
										value={draft}
										onChange={(e) => setDraft(e.target.value)}
										onKeyDown={(e) => {
											if (e.key === 'Enter' && !e.shiftKey) {
												e.preventDefault()
												handleSend()
											}
										}}
										rows={1}
										placeholder="Write a message"
										className="max-h-32 min-h-[46px] flex-1 resize-none rounded-2xl border border-white/[0.08] bg-white/[0.04] px-4 py-3 text-[14px] text-white/90 outline-none transition-colors placeholder:text-white/30 focus:border-[hsl(var(--accent))]/40 focus:bg-white/[0.06]"
									/>
									<button
										onClick={handleSend}
										disabled={sending || !draft.trim()}
										className="flex h-[46px] w-[46px] flex-shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-[hsl(var(--accent))] to-[hsl(var(--accent))]/75 text-white shadow-[0_12px_30px_-8px_hsl(var(--accent)/0.75)] transition-all hover:scale-105 disabled:scale-100 disabled:opacity-35 disabled:shadow-none"
									>
										{sending ? (
											<Loader2 className="h-5 w-5 animate-spin" />
										) : (
											<Send className="h-[18px] w-[18px]" />
										)}
									</button>
								</div>
							</>
						)}
					</div>
				</div>
			)}

			{/* Purchase review queue */}
			{tab === 'review' && canReview && (
				<div className="space-y-3">
					<p className="text-xs text-white/45">
						Purchases the AI spotted in chat. Nothing reaches your books until you approve it.
					</p>
					{pending.length === 0 ? (
						<div className="flex h-44 flex-col items-center justify-center gap-3 rounded-[calc(var(--radius)*1.2)] border border-white/10 bg-white/[0.03] backdrop-blur-xl">
							<ShoppingBasket className="h-8 w-8 text-white/45/50" />
							<p className="text-sm text-white/45">Nothing waiting for review</p>
						</div>
					) : (
						pending.map((p) => (
							<div
								key={p.id}
								className="rounded-[calc(var(--radius)*1.2)] border border-white/10 bg-white/[0.04] p-4 backdrop-blur-xl shadow-[0_20px_60px_rgba(3,5,18,0.5)]"
							>
								<div className="flex flex-wrap items-start justify-between gap-3">
									<div className="min-w-0">
										<p className="text-sm font-semibold capitalize">
											{p.itemName}
											<span className="ml-2 rounded-full bg-[hsl(var(--muted))] px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-white/45">
												{p.category}
											</span>
										</p>
										<p className="mt-1 text-xs text-white/45">
											{p.quantity ?? '—'}
											{p.unit ?? ''} · {currencySymbol}
											{p.amount?.toLocaleString('en-IN') ?? '—'}
											{p.supplierName && ` · ${p.supplierName}`}
										</p>
										{p.sourceText && (
											<p className="mt-2 border-l-2 border-[hsl(var(--border))] pl-2 text-xs italic text-white/45">
												“{p.sourceText}”
											</p>
										)}
										<p className="mt-1 text-[10px] text-white/45">
											reported by {p.reportedByName ?? 'someone'} · {timeLabel(p.createdAt)}
										</p>
									</div>
									<div className="flex gap-2">
										<Button size="sm" onClick={() => handleApprove(p.id)}>
											<Check className="mr-1.5 h-3.5 w-3.5" />
											Approve
										</Button>
										<Button size="sm" variant="ghost" onClick={() => handleReject(p.id)}>
											<X className="mr-1.5 h-3.5 w-3.5" />
											Reject
										</Button>
									</div>
								</div>
							</div>
						))
					)}
				</div>
			)}

			{/* Insights */}
			{tab === 'insights' && canReview && insights && (
				<div className="space-y-4">
					<p className="text-xs text-white/45">
						Approved chat-logged purchases, last 30 days.
					</p>
					<div className="grid gap-4 sm:grid-cols-3">
						<div className="rounded-[calc(var(--radius)*1.2)] border border-white/10 bg-white/[0.04] p-4 backdrop-blur-xl shadow-[0_20px_60px_rgba(3,5,18,0.5)]">
							<div className="flex items-center gap-2 text-white/45">
								<IndianRupee className="h-4 w-4" />
								<span className="text-xs font-medium uppercase tracking-wide">Total spend</span>
							</div>
							<p className="mt-2 text-2xl font-semibold">
								{currencySymbol}
								{insights.totalSpend.toLocaleString('en-IN')}
							</p>
						</div>
						<div className="rounded-[calc(var(--radius)*1.2)] border border-[hsl(var(--accent))]/30 bg-[hsl(var(--accent))]/[0.08] p-4 backdrop-blur-xl">
							<div className="flex items-center gap-2 text-white/45">
								<ShoppingBasket className="h-4 w-4" />
								<span className="text-xs font-medium uppercase tracking-wide">Vegetables</span>
							</div>
							<p className="mt-2 text-2xl font-semibold">
								{currencySymbol}
								{insights.vegetableSpend.toLocaleString('en-IN')}
							</p>
						</div>
						<div className="rounded-[calc(var(--radius)*1.2)] border border-white/10 bg-white/[0.04] p-4 backdrop-blur-xl shadow-[0_20px_60px_rgba(3,5,18,0.5)]">
							<div className="flex items-center gap-2 text-white/45">
								<ShoppingBasket className="h-4 w-4" />
								<span className="text-xs font-medium uppercase tracking-wide">Awaiting review</span>
							</div>
							<p className="mt-2 text-2xl font-semibold">{insights.pendingCount}</p>
						</div>
					</div>

					<div className="overflow-hidden rounded-[calc(var(--radius)*1.2)] border border-white/10 bg-white/[0.04] backdrop-blur-xl">
						<table className="w-full text-sm">
							<thead>
								<tr className="border-b border-white/[0.07] text-left text-[10px] uppercase tracking-[0.12em] text-white/40">
									<th className="px-4 py-3 font-medium">Category</th>
									<th className="px-4 py-3 font-medium">Entries</th>
									<th className="px-4 py-3 text-right font-medium">Spend</th>
								</tr>
							</thead>
							<tbody>
								{insights.byCategory.map((c) => (
									<tr key={c.category} className="border-b border-white/[0.05] last:border-0">
										<td className="px-4 py-3 capitalize">{c.category}</td>
										<td className="px-4 py-3 text-white/45">{c.itemCount}</td>
										<td className="px-4 py-3 text-right font-medium">
											{currencySymbol}
											{c.total.toLocaleString('en-IN')}
										</td>
									</tr>
								))}
							</tbody>
						</table>
					</div>
				</div>
			)}

			{/* New conversation */}
			{showNew && (
				<div
					className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
					onClick={() => setShowNew(false)}
				>
					<div
						onClick={(e) => e.stopPropagation()}
						className="flex max-h-[80vh] w-full max-w-md flex-col overflow-hidden rounded-[calc(var(--radius)*1.2)] border border-white/10 bg-white/[0.04] backdrop-blur-xl"
					>
						<div className="border-b border-white/[0.07] p-4">
							<h2 className="text-sm font-semibold">New conversation</h2>
							{/* Direct and group are separate modes: mixing them in one list
							    made picking a person ambiguous and silently did nothing. */}
							<div className="mt-3 flex gap-2">
								{(['direct', 'group'] as const).map((mode) => (
									<button
										key={mode}
										onClick={() => setNewMode(mode)}
										className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
											newMode === mode
												? 'bg-[hsl(var(--accent))] text-[hsl(var(--accent-foreground))]'
												: 'border border-[hsl(var(--border))] text-white/45'
										}`}
									>
										{mode === 'direct' ? 'One to one' : 'Group'}
									</button>
								))}
							</div>
							{newMode === 'group' && (
								<input
									value={groupName}
									onChange={(e) => setGroupName(e.target.value)}
									placeholder="Group name"
									className="mt-3 h-10 w-full rounded-[calc(var(--radius)*0.9)] border border-white/[0.08] bg-white/[0.04] px-3 text-sm outline-none focus:ring-2 focus:ring-[hsl(var(--accent))]/40"
								/>
							)}
						</div>

						<div className="flex-1 overflow-y-auto p-2">
							{team.length === 0 ? (
								<p className="p-6 text-center text-xs text-white/45">
									No other team members found. Add staff under Staff first.
								</p>
							) : newMode === 'direct' ? (
								team.map((m) => (
									<button
										key={m.id}
										onClick={() => handleStartDirect(m.id)}
										className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left hover:bg-white/[0.05]"
									>
										<Avatar name={m.name} size="sm" />
										<span className="text-sm">{m.name}</span>
									</button>
								))
							) : (
								team.map((m) => {
									const checked = selectedMembers.includes(m.id)
									return (
										<button
											key={m.id}
											onClick={() =>
												setSelectedMembers((prev) =>
													checked ? prev.filter((x) => x !== m.id) : [...prev, m.id]
												)
											}
											className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left hover:bg-white/[0.05]"
										>
											<Avatar name={m.name} size="sm" />
											<span className="flex-1 text-sm">{m.name}</span>
											<span
												className={`flex h-5 w-5 items-center justify-center rounded-full border ${
													checked
														? 'border-[hsl(var(--accent))] bg-[hsl(var(--accent))] text-[hsl(var(--accent-foreground))]'
														: 'border-[hsl(var(--border))]'
												}`}
											>
												{checked && <Check className="h-3 w-3" />}
											</span>
										</button>
									)
								})
							)}
						</div>

						{newMode === 'group' && (
							<div className="flex items-center gap-2 border-t border-white/[0.07] p-4">
								<Button
									size="sm"
									onClick={handleCreateGroup}
									disabled={!groupName.trim() || selectedMembers.length === 0}
								>
									Create group ({selectedMembers.length})
								</Button>
								<Button variant="ghost" size="sm" onClick={() => setShowNew(false)}>
									Cancel
								</Button>
							</div>
						)}
					</div>
				</div>
			)}
		</div>
	)
}
