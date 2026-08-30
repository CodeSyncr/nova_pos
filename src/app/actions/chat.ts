'use server'

/**
 * Sanchay — the internal team chat.
 */

import { createSupabaseServerClient } from '@/lib/supabase/server'
import { createClient } from '@supabase/supabase-js'
import { revalidatePath } from 'next/cache'
import {
	extractPurchases,
	correctShoppingList,
	looksLikeShoppingList
} from '@/lib/chat-ai'
import { materialisePurchase } from '@/lib/purchase-materialise'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

function createAdminClient() {
	if (!supabaseUrl || !supabaseServiceKey) throw new Error('Missing admin credentials')
	return createClient(supabaseUrl, supabaseServiceKey, {
		auth: { autoRefreshToken: false, persistSession: false }
	})
}

async function requireUser() {
	const supabase = await createSupabaseServerClient()
	const {
		data: { user }
	} = await supabase.auth.getUser()
	if (!user) throw new Error('Unauthorized')
	return { supabase, userId: user.id }
}

// ─── Types ───────────────────────────────────────────────────────────────────

export type ChatConversation = {
	id: string
	kind: 'direct' | 'group' | 'channel'
	name: string | null
	avatarUrl: string | null
	lastMessageAt: string | null
	lastMessagePreview: string | null
	unreadCount: number
	memberCount: number
	/** For direct chats, the other person — the UI shows them as the title. */
	counterpartName: string | null
}

export type ChatMessage = {
	id: string
	conversationId: string
	senderId: string | null
	senderName: string | null
	kind: 'text' | 'image' | 'file' | 'system'
	body: string | null
	attachmentUrl: string | null
	attachmentName: string | null
	replyToId: string | null
	editedAt: string | null
	deletedAt: string | null
	createdAt: string
}

// ─── Conversations ───────────────────────────────────────────────────────────

/**
 * Conversations the signed-in user can see.
 *
 * Reads through the user's own session so RLS applies — a role-gated channel
 * is filtered out by the database, not by this code.
 */
export async function getConversations(): Promise<ChatConversation[]> {
	const { supabase, userId } = await requireUser()

	const { data, error } = await supabase
		.from('conversations')
		.select(
			`id, kind, name, avatar_url, last_message_at, last_message_preview,
			 conversation_members ( profile_id, last_read_at, profiles ( full_name ) )`
		)
		.order('last_message_at', { ascending: false, nullsFirst: false })
		.limit(200)

	if (error) throw new Error(error.message)

	type MemberRow = {
		profile_id: string
		last_read_at: string | null
		profiles: { full_name: string | null } | { full_name: string | null }[] | null
	}

	const conversations = (data ?? []).map((row) => {
		const members = (row.conversation_members ?? []) as MemberRow[]
		const mine = members.find((m) => m.profile_id === userId)

		// A direct chat has no name of its own; it is titled by the other person.
		let counterpartName: string | null = null
		if (row.kind === 'direct') {
			const other = members.find((m) => m.profile_id !== userId)
			const profile = Array.isArray(other?.profiles) ? other?.profiles[0] : other?.profiles
			counterpartName = profile?.full_name ?? null
		}

		return {
			id: row.id as string,
			kind: row.kind as ChatConversation['kind'],
			name: row.name as string | null,
			avatarUrl: row.avatar_url as string | null,
			lastMessageAt: row.last_message_at as string | null,
			lastMessagePreview: row.last_message_preview as string | null,
			memberCount: members.length,
			counterpartName,
			lastReadAt: mine?.last_read_at ?? null
		}
	})

	// Unread counts in one grouped query rather than one per conversation.
	const ids = conversations.map((c) => c.id)
	const unread = new Map<string, number>()

	if (ids.length > 0) {
		const { data: recent } = await supabase
			.from('messages')
			.select('conversation_id, created_at, sender_id')
			.in('conversation_id', ids)
			.order('created_at', { ascending: false })
			.limit(1000)

		for (const m of recent ?? []) {
			const conv = conversations.find((c) => c.id === m.conversation_id)
			if (!conv) continue
			if (m.sender_id === userId) continue
			if (conv.lastReadAt && new Date(m.created_at as string) <= new Date(conv.lastReadAt)) continue
			unread.set(conv.id, (unread.get(conv.id) ?? 0) + 1)
		}
	}

	// lastReadAt was only needed to compute the unread count; drop it from the
	// shape returned to the client.
	return conversations.map((c) => ({
		id: c.id,
		kind: c.kind,
		name: c.name,
		avatarUrl: c.avatarUrl,
		lastMessageAt: c.lastMessageAt,
		lastMessagePreview: c.lastMessagePreview,
		memberCount: c.memberCount,
		counterpartName: c.counterpartName,
		unreadCount: unread.get(c.id) ?? 0
	}))
}

export async function getMessages(conversationId: string, limit = 100): Promise<ChatMessage[]> {
	const { supabase } = await requireUser()

	const { data, error } = await supabase
		.from('messages')
		.select(
			`id, conversation_id, sender_id, kind, body, attachment_url, attachment_name,
			 reply_to_id, edited_at, deleted_at, created_at,
			 profiles:sender_id ( full_name )`
		)
		.eq('conversation_id', conversationId)
		.order('created_at', { ascending: false })
		.limit(limit)

	if (error) throw new Error(error.message)

	// Fetched newest-first so the limit keeps the RECENT messages; the UI wants
	// them oldest-first.
	return (data ?? [])
		.map((row) => {
			const profile = Array.isArray(row.profiles) ? row.profiles[0] : row.profiles
			return {
				id: row.id as string,
				conversationId: row.conversation_id as string,
				senderId: row.sender_id as string | null,
				senderName: (profile as { full_name?: string } | null)?.full_name ?? null,
				kind: row.kind as ChatMessage['kind'],
				body: row.body as string | null,
				attachmentUrl: row.attachment_url as string | null,
				attachmentName: row.attachment_name as string | null,
				replyToId: row.reply_to_id as string | null,
				editedAt: row.edited_at as string | null,
				deletedAt: row.deleted_at as string | null,
				createdAt: row.created_at as string
			}
		})
		.reverse()
}

// ─── Sending ─────────────────────────────────────────────────────────────────

/**
 * Sends a message, then looks for purchases in it.
 *
 * The AI pass runs after the insert and never blocks or fails the send: chat
 * must keep working when Workers AI is slow or down.
 */
export async function sendMessage(params: {
	conversationId: string
	tenantId: string
	body?: string
	kind?: 'text' | 'image' | 'file'
	attachmentUrl?: string
	attachmentName?: string
	attachmentMime?: string
	attachmentSize?: number
	replyToId?: string
}): Promise<{ id: string }> {
	const { supabase, userId } = await requireUser()

	const kind = params.kind ?? 'text'
	const body = (params.body ?? '').trim()

	if (kind === 'text' && !body) throw new Error('Message cannot be empty')

	const { data, error } = await supabase
		.from('messages')
		.insert({
			conversation_id: params.conversationId,
			tenant_id: params.tenantId,
			sender_id: userId,
			kind,
			body: body || null,
			attachment_url: params.attachmentUrl ?? null,
			attachment_name: params.attachmentName ?? null,
			attachment_mime: params.attachmentMime ?? null,
			attachment_size: params.attachmentSize ?? null,
			reply_to_id: params.replyToId ?? null
		})
		.select('id, created_at')
		.single()

	if (error) throw new Error(error.message)

	if (kind === 'text' && body) {
		// If the sender may approve expenses, there is nobody above them to ask —
		// queuing their own entry for their own approval is pointless. Probed
		// through their session so RLS is the authority, not a role guess.
		const { error: permissionProbe } = await supabase
			.from('pending_purchases')
			.select('id')
			.limit(1)
		const senderCanApprove = !permissionProbe

		// Deliberately awaited: the caller is a server action, and a detached
		// promise here would be killed when the response is returned.
		await analyseMessage({
			autoApprove: senderCanApprove,
			messageId: data.id as string,
			conversationId: params.conversationId,
			tenantId: params.tenantId,
			senderId: userId,
			body,
			sentAt: data.created_at as string
		})
	}

	revalidatePath('/chat')
	return { id: data.id as string }
}

/**
 * Analyses a message: expenses, or a shopping list to send a vendor.
 *
 * Uses the service-role client because the sender may be an employee with no
 * access to `pending_purchases` — they can report a purchase in chat without
 * being able to see the queue or its amounts.
 */
async function analyseMessage(params: {
	messageId: string
	conversationId: string
	tenantId: string
	senderId: string
	body: string
	sentAt: string
	/** True when the sender is already an approver — see sendMessage. */
	autoApprove: boolean
}): Promise<void> {
	const admin = createAdminClient()

	try {
		// Feed the model this tenant's existing vocabulary so spellings stay
		// consistent with what has been logged before.
		const { data: history } = await admin
			.from('pending_purchases')
			.select('item_name')
			.eq('tenant_id', params.tenantId)
			.eq('status', 'approved')
			.order('created_at', { ascending: false })
			.limit(120)

		const knownItems = Array.from(
			new Set((history ?? []).map((r) => String(r.item_name).toLowerCase()))
		)

		// A list of things to BUY is not a record of money spent, so the two are
		// handled separately and never both.
		if (looksLikeShoppingList(params.body)) {
			const list = await correctShoppingList(params.body, knownItems)
			if (list) {
				await admin.from('message_ai_analysis').upsert({
					message_id: params.messageId,
					tenant_id: params.tenantId,
					kind: 'list',
					entry_count: list.items.length,
					corrected_text: list.correctedText
				})
			}
			return
		}

		const purchases = await extractPurchases(params.body, knownItems)
		if (purchases.length === 0) return

		const purchasedOn = params.sentAt.slice(0, 10)

		// One row per comma-separated entry — "204 dietcoke, 15000 rent" is two
		// expenses, not one.
		const now = new Date().toISOString()

		const { data: inserted } = await admin.from('pending_purchases').upsert(
			purchases.map((p, index) => ({
				tenant_id: params.tenantId,
				message_id: params.messageId,
				line_index: index,
				conversation_id: params.conversationId,
				reported_by: params.senderId,
				item_name: p.itemName,
				category: p.category,
				quantity: p.quantity,
				unit: p.unit,
				amount: p.amount,
				supplier_name: p.supplierName,
				purchased_on: purchasedOn,
				confidence: p.confidence,
				raw_extraction: { item: p, source: params.body },
				// Approver's own entry goes straight to the books; anyone else's
				// waits for review.
				status: params.autoApprove ? 'approved' : 'pending',
				reviewed_by: params.autoApprove ? params.senderId : null,
				reviewed_at: params.autoApprove ? now : null
			})),
			{ onConflict: 'message_id,line_index' }
		).select('id, item_name, quantity, unit, amount, supplier_name, purchased_on')

		if (params.autoApprove) {
			// Create the real records, and link each back to the row it came from.
			for (const row of inserted ?? []) {
				try {
					const purchaseId = await materialisePurchase(admin, {
						tenantId: params.tenantId,
						itemName: row.item_name as string,
						quantity: row.quantity == null ? null : Number(row.quantity),
						unit: row.unit as string | null,
						amount: row.amount == null ? null : Number(row.amount),
						supplierName: row.supplier_name as string | null,
						purchasedOn: (row.purchased_on as string) ?? purchasedOn,
						createdBy: params.senderId
					})
					await admin
						.from('pending_purchases')
						.update({ purchase_id: purchaseId })
						.eq('id', row.id as string)
				} catch (error) {
					// Leave the entry approved-but-unlinked rather than losing it;
					// it still shows in analytics and can be re-linked by hand.
					console.error('[chat-ai] auto-approval could not create purchase:', error)
				}
			}
		}

		await admin.from('message_ai_analysis').upsert({
			message_id: params.messageId,
			tenant_id: params.tenantId,
			kind: 'purchase',
			entry_count: purchases.length,
			total_amount: purchases.reduce((sum, p) => sum + (p.amount ?? 0), 0),
			auto_approved: params.autoApprove
		})
	} catch (error) {
		// Analysis is an enhancement; never surface it as a send failure.
		console.error('[chat-ai] message analysis failed:', error)
	}
}

export async function markConversationRead(conversationId: string): Promise<void> {
	const { supabase, userId } = await requireUser()

	await supabase
		.from('conversation_members')
		.update({ last_read_at: new Date().toISOString() })
		.eq('conversation_id', conversationId)
		.eq('profile_id', userId)
}

// ─── Creating conversations ──────────────────────────────────────────────────

/** Opens (or reuses) a 1:1 conversation with another team member. */
export async function startDirectConversation(
	tenantId: string,
	otherProfileId: string
): Promise<{ id: string }> {
	const { supabase, userId } = await requireUser()
	if (otherProfileId === userId) throw new Error('Cannot start a chat with yourself')

	// Reuse an existing thread rather than creating duplicates.
	const { data: mine } = await supabase
		.from('conversation_members')
		.select('conversation_id, conversations!inner ( kind, tenant_id )')
		.eq('profile_id', userId)

	const candidateIds = (mine ?? [])
		.filter((row) => {
			const c = Array.isArray(row.conversations) ? row.conversations[0] : row.conversations
			return (c as { kind?: string } | null)?.kind === 'direct'
		})
		.map((row) => row.conversation_id as string)

	if (candidateIds.length > 0) {
		const { data: shared } = await supabase
			.from('conversation_members')
			.select('conversation_id')
			.eq('profile_id', otherProfileId)
			.in('conversation_id', candidateIds)
			.limit(1)

		if (shared && shared.length > 0) {
			return { id: shared[0]!.conversation_id as string }
		}
	}

	const admin = createAdminClient()

	const { data: conversation, error } = await admin
		.from('conversations')
		.insert({ tenant_id: tenantId, kind: 'direct', created_by: userId })
		.select('id')
		.single()

	if (error) throw new Error(error.message)

	const { error: membersError } = await admin.from('conversation_members').insert([
		{ conversation_id: conversation.id, profile_id: userId, role: 'admin' },
		{ conversation_id: conversation.id, profile_id: otherProfileId, role: 'admin' }
	])

	if (membersError) throw new Error(membersError.message)

	revalidatePath('/chat')
	return { id: conversation.id as string }
}

/**
 * Creates a group or a role-gated channel.
 *
 * `requiredPermission` makes the conversation invisible to anyone lacking that
 * permission category — enforced by RLS, so it holds for direct API calls too.
 */
export async function createGroupConversation(params: {
	tenantId: string
	name: string
	memberIds: string[]
	kind?: 'group' | 'channel'
	requiredPermission?: string | null
}): Promise<{ id: string }> {
	const { userId } = await requireUser()

	if (!params.name.trim()) throw new Error('Group name is required')

	const admin = createAdminClient()

	const { data: conversation, error } = await admin
		.from('conversations')
		.insert({
			tenant_id: params.tenantId,
			kind: params.kind ?? 'group',
			name: params.name.trim(),
			required_permission: params.requiredPermission || null,
			created_by: userId
		})
		.select('id')
		.single()

	if (error) throw new Error(error.message)

	const memberIds = Array.from(new Set([userId, ...params.memberIds]))
	const { error: membersError } = await admin.from('conversation_members').insert(
		memberIds.map((id) => ({
			conversation_id: conversation.id,
			profile_id: id,
			role: id === userId ? 'admin' : 'member'
		}))
	)

	if (membersError) throw new Error(membersError.message)

	revalidatePath('/chat')
	return { id: conversation.id as string }
}

/** Team members who can be added to a conversation. */
export async function getTeamMembers(
	tenantId: string
): Promise<{ id: string; name: string; avatarUrl: string | null }[]> {
	const { supabase, userId } = await requireUser()

	// `profiles` holds no email column — email lives in auth.users — so
	// selecting one here would error the whole query and empty the picker.
	const { data, error } = await supabase
		.from('profile_tenants')
		.select('profile_id, profiles ( id, full_name, avatar_url )')
		.eq('tenant_id', tenantId)

	if (error) throw new Error(error.message)

	return (data ?? [])
		.map((row) => {
			const p = Array.isArray(row.profiles) ? row.profiles[0] : row.profiles
			const profile = p as { id?: string; full_name?: string; avatar_url?: string } | null
			if (!profile?.id || profile.id === userId) return null
			return {
				id: profile.id,
				name: profile.full_name || 'Team member',
				avatarUrl: profile.avatar_url ?? null
			}
		})
		.filter((m): m is { id: string; name: string; avatarUrl: string | null } => m !== null)
}

// ─── AI ──────────────────────────────────────────────────────────────────────

export type MessageAnalysis = {
	messageId: string
	kind: 'purchase' | 'list' | 'none'
	entryCount: number
	totalAmount: number | null
	correctedText: string | null
	/** True when it went straight to the books, skipping review. */
	autoApproved: boolean
	/** Individual expenses — only populated for users who may see amounts. */
	entries: { id: string; itemName: string; category: string; amount: number | null }[]
}

/**
 * AI analysis for a set of messages, for the inline cards.
 *
 * Amounts are fetched through the caller's own session, so the
 * `pending_purchases` policy decides whether they come back. A member of staff
 * gets the card telling them their message was logged as an expense, without
 * the figures.
 */
export async function getMessageAnalyses(messageIds: string[]): Promise<MessageAnalysis[]> {
	const { supabase } = await requireUser()
	if (messageIds.length === 0) return []

	const { data: analyses, error } = await supabase
		.from('message_ai_analysis')
		.select('message_id, kind, entry_count, total_amount, corrected_text, auto_approved')
		.in('message_id', messageIds)

	if (error) throw new Error(error.message)
	if (!analyses || analyses.length === 0) return []

	// Gated by RLS: returns nothing for users without the purchases permission.
	const { data: entries } = await supabase
		.from('pending_purchases')
		.select('id, message_id, item_name, category, amount, line_index')
		.in('message_id', messageIds)
		.order('line_index', { ascending: true })

	return analyses.map((a) => ({
		messageId: a.message_id as string,
		kind: a.kind as MessageAnalysis['kind'],
		entryCount: a.entry_count as number,
		totalAmount: a.total_amount == null ? null : Number(a.total_amount),
		correctedText: a.corrected_text as string | null,
		autoApproved: Boolean(a.auto_approved),
		entries: (entries ?? [])
			.filter((e) => e.message_id === a.message_id)
			.map((e) => ({
				id: e.id as string,
				itemName: e.item_name as string,
				category: e.category as string,
				amount: e.amount == null ? null : Number(e.amount)
			}))
	}))
}

/** True when the caller may see expense amounts. */
export async function canSeeAmounts(): Promise<boolean> {
	try {
		const { supabase } = await requireUser()
		const { error } = await supabase.from('pending_purchases').select('id').limit(1)
		return !error
	} catch {
		return false
	}
}
