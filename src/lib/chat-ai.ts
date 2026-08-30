/**
 * AI features for Sanchay, the internal team chat.
 *
 * Runs on Cloudflare Workers AI, the same provider the customer chatbot uses.
 *
 * The guiding rule: the model never writes to financial tables. Extractions
 * land in `pending_purchases` for a human to approve, because a model reading
 * "12kg" as "120kg" would otherwise corrupt inventory and spend reporting with
 * nothing to catch it.
 */

const CF_MODEL = '@cf/meta/llama-3.1-8b-instruct-fast'

/** Categories the spend breakdown is grouped by. */
export const PURCHASE_CATEGORIES = [
	'vegetables',
	'fruits',
	'dairy',
	'meat',
	'grains',
	'beverages',
	'packaging',
	'supplies',
	// Expenses staff log in chat that are not stock at all. Without these,
	// "15000 rent" would be filed as a supply purchase.
	'rent',
	'loan',
	'salary',
	'utilities',
	'transport',
	'other'
] as const

export type PurchaseCategory = (typeof PURCHASE_CATEGORIES)[number]

export type ExtractedPurchase = {
	itemName: string
	category: PurchaseCategory
	quantity: number | null
	unit: string | null
	amount: number | null
	supplierName: string | null
	purchasedOn: string | null // YYYY-MM-DD
	confidence: number // 0..1
}

export class ChatAiError extends Error {
	readonly step: string
	constructor(message: string, step: string) {
		super(message)
		this.name = 'ChatAiError'
		this.step = step
	}
}

/* -------------------------------------------------------------------------- */
/* Cloudflare                                                                  */
/* -------------------------------------------------------------------------- */

async function runModel(
	messages: { role: 'system' | 'user' | 'assistant'; content: string }[],
	maxTokens = 512
): Promise<string> {
	const accountId = process.env.CLOUDFLARE_ACCOUNT_ID
	const apiToken = process.env.CLOUDFLARE_API_TOKEN

	if (!accountId || !apiToken) {
		throw new ChatAiError('Cloudflare AI is not configured on this server.', 'config')
	}

	const response = await fetch(
		`https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/${CF_MODEL}`,
		{
			method: 'POST',
			headers: {
				Authorization: `Bearer ${apiToken}`,
				'Content-Type': 'application/json'
			},
			body: JSON.stringify({ messages, max_tokens: maxTokens }),
			cache: 'no-store'
		}
	)

	if (!response.ok) {
		throw new ChatAiError(`Workers AI returned HTTP ${response.status}.`, 'model')
	}

	// Workers AI returns both a flat `result.response` and an OpenAI-shaped
	// `result.choices[].message.content`, and which one carries the text varies
	// by model and request. Read either, and never hand a non-string onwards.
	const data = (await response.json()) as {
		result?: {
			response?: unknown
			choices?: { message?: { content?: unknown } }[]
		}
	}

	const flat = data.result?.response
	if (typeof flat === 'string') return flat

	const choice = data.result?.choices?.[0]?.message?.content
	if (typeof choice === 'string') return choice

	return ''
}

/**
 * Pulls the first JSON object out of a model response.
 *
 * Small instruction-tuned models routinely wrap JSON in prose or a code fence
 * however firmly you ask them not to, so this is expected rather than
 * exceptional.
 */
function extractJson(text: string): unknown | null {
	const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/)
	const candidate = fenced?.[1] ?? text

	const start = candidate.indexOf('{')
	const end = candidate.lastIndexOf('}')
	if (start === -1 || end === -1 || end <= start) return null

	try {
		return JSON.parse(candidate.slice(start, end + 1))
	} catch {
		return null
	}
}

/* -------------------------------------------------------------------------- */
/* Purchase detection                                                          */
/* -------------------------------------------------------------------------- */

/**
 * A cheap pre-filter run before the model.
 *
 * Most chat traffic is ordinary conversation, and calling an LLM on every
 * message would be slow and wasteful. A message only reaches the model if it
 * looks like it might describe a purchase.
 */
export function looksLikePurchase(text: string): boolean {
	if (!text || text.trim().length < 6) return false

	const lower = text.toLowerCase()

	// A number is necessary — a purchase has a quantity or a price.
	if (!/\d/.test(lower)) return false

	const buyWords =
		/\b(bought|buy|purchase[d]?|paid|spent|order(ed)?|got|took|bill|invoice|rent|loan|emi|salary|kharida|liya|diya)\b/
	const moneyWords = /(₹|rs\.?|rupees?|inr)\s*\d|\d\s*(₹|rs\.?|rupees?|inr)/
	const unitWords = /\b\d+(\.\d+)?\s*(kg|kgs|g|gram|grams|l|ltr|litre|liter|ml|pc|pcs|piece|packet|packets|box|boxes|crate|crates|dozen|bag|bags)\b/
	// The house style is terse and amount-first: "204 dietcoke, 305 instamart".
	// A number immediately followed by words is the strongest signal there is.
	const amountFirst = /(^|,|\n)\s*\d{2,6}\s+[a-z]/

	return buyWords.test(lower) || moneyWords.test(lower) || unitWords.test(lower) || amountFirst.test(lower)
}

const EXTRACTION_SYSTEM_PROMPT = `You extract expense entries from restaurant staff chat messages.

Reply with ONLY a JSON object, no prose:
{"is_purchase": true|false, "items": [{"item_name": string, "category": string, "quantity": number|null, "unit": string|null, "amount": number|null, "supplier_name": string|null, "confidence": number}]}

FORMAT — staff usually write AMOUNT FIRST, several entries per line separated by commas:
  "204 dietcoke and ice, 305 instamart, 15000 rent, 2000 loan"
  => four separate entries:
     {"item_name":"dietcoke and ice","category":"beverages","amount":204}
     {"item_name":"instamart","category":"supplies","amount":305}
     {"item_name":"rent","category":"rent","amount":15000}
     {"item_name":"loan","category":"loan","amount":2000}

RULES
- The leading number is the AMOUNT in rupees, not a quantity, unless a unit follows it (12kg, 5 pcs, 40 litre).
- Return ONE entry per comma-separated part. Never merge them.
- "category" MUST be one of: vegetables, fruits, dairy, meat, grains, beverages, packaging, supplies, rent, loan, salary, utilities, transport, other
- Vegetables: tomato, onion, potato, aloo, pyaaz, spinach, palak, capsicum, cabbage, carrot, chilli, mirchi, coriander, dhaniya, garlic, lehsun, ginger, adrak, mushroom, lettuce, broccoli, beans, peas, matar
- rent / loan / salary / EMI / electricity / water / fuel / petrol are NOT stock — use the matching category.
- "quantity" and "unit" only when explicitly stated (12kg => 12, "kg"). Otherwise null.
- Messages may mix English and Hindi/Hinglish. "kharida", "liya", "diya" mean bought or paid.
- If the message is not about money spent, reply {"is_purchase": false, "items": []}
- "confidence" 0.0-1.0. Never invent values; use null for anything not stated.`

/** Normalises whatever the model returned into a safe, typed row. */
function normaliseItem(raw: unknown): ExtractedPurchase | null {
	if (!raw || typeof raw !== 'object') return null
	const r = raw as Record<string, unknown>

	const itemName = typeof r.item_name === 'string' ? r.item_name.trim() : ''
	if (!itemName) return null

	const rawCategory = String(r.category ?? 'other').toLowerCase().trim()
	const category = (PURCHASE_CATEGORIES as readonly string[]).includes(rawCategory)
		? (rawCategory as PurchaseCategory)
		: 'other'

	const num = (value: unknown): number | null => {
		if (value === null || value === undefined || value === '') return null
		const parsed = Number(value)
		return Number.isFinite(parsed) && parsed >= 0 ? parsed : null
	}

	const confidence = num(r.confidence)

	return {
		itemName: itemName.slice(0, 120),
		category,
		quantity: num(r.quantity),
		unit: typeof r.unit === 'string' && r.unit.trim() ? r.unit.trim().slice(0, 20) : null,
		amount: num(r.amount),
		supplierName:
			typeof r.supplier_name === 'string' && r.supplier_name.trim()
				? r.supplier_name.trim().slice(0, 120)
				: null,
		purchasedOn: null, // Set by the caller from the message timestamp.
		// Clamp: models occasionally emit 95 when they mean 0.95.
		confidence: confidence === null ? 0.5 : Math.min(1, confidence > 1 ? confidence / 100 : confidence)
	}
}

/**
 * Extracts any purchases described in `text`.
 *
 * Returns an empty array both when nothing was found and when the model
 * answered unusably — a failed extraction must look like "no purchase here",
 * never like a purchase with guessed values.
 */
export async function extractPurchases(
	text: string,
	knownItems: string[] = []
): Promise<ExtractedPurchase[]> {
	if (!looksLikePurchase(text)) return []

	// Feeding back what this restaurant has actually bought before keeps the
	// model on the house vocabulary — "dietcoke" stays "dietcoke" instead of
	// drifting to "Diet Coke", so spend groups by item instead of fragmenting.
	const vocabulary = knownItems.slice(0, 60).join(', ')
	const systemPrompt = vocabulary
		? `${EXTRACTION_SYSTEM_PROMPT}\n\nThis restaurant has previously logged these items — reuse the exact spelling when a message refers to one of them:\n${vocabulary}`
		: EXTRACTION_SYSTEM_PROMPT

	let response: string
	try {
		response = await runModel(
			[
				{ role: 'system', content: systemPrompt },
				{ role: 'user', content: text.slice(0, 1000) }
			],
			600
		)
	} catch {
		// Detection is best-effort; a model outage must not break sending chat.
		return []
	}

	const parsed = extractJson(response)
	if (!parsed || typeof parsed !== 'object') return []

	const payload = parsed as { is_purchase?: unknown; items?: unknown }
	if (payload.is_purchase === false) return []
	if (!Array.isArray(payload.items)) return []

	return payload.items
		.map(normaliseItem)
		.filter((item): item is ExtractedPurchase => item !== null)
		// A very low score means the model itself is unsure; better to miss one
		// than to fill the reviewer's queue with noise.
		.filter((item) => item.confidence >= 0.35)
}

/* -------------------------------------------------------------------------- */
/* Conversation summary                                                        */
/* -------------------------------------------------------------------------- */

/**
 * Summarises recent messages — for catching up on a busy group.
 *
 * Takes messages oldest-first.
 */
export async function summariseConversation(
	messages: { sender: string; body: string }[]
): Promise<string> {
	if (messages.length === 0) return 'Nothing to summarise yet.'

	const transcript = messages
		.slice(-60)
		.map((m) => `${m.sender}: ${m.body}`)
		.join('\n')
		.slice(0, 6000)

	try {
		const response = await runModel(
			[
				{
					role: 'system',
					content:
						'Summarise this restaurant team chat in at most 5 short bullet points. ' +
						'Lead with decisions, tasks and anything needing follow-up. ' +
						'Be concrete and use the names given. Plain text bullets, no preamble.'
				},
				{ role: 'user', content: transcript }
			],
			300
		)
		return response.trim() || 'Could not summarise this conversation.'
	} catch {
		return 'Summary is unavailable right now.'
	}
}

/* -------------------------------------------------------------------------- */
/* Task detection                                                              */
/* -------------------------------------------------------------------------- */

export type ExtractedTask = {
	title: string
	assigneeHint: string | null
	dueHint: string | null
}

/**
 * Spots action items ("Ramesh, order gas cylinders tomorrow") so they can be
 * offered as tasks rather than lost in scrollback.
 */
export async function extractTasks(text: string): Promise<ExtractedTask[]> {
	if (!text || text.trim().length < 10) return []

	try {
		const response = await runModel(
			[
				{
					role: 'system',
					content:
						'Extract action items from a restaurant team chat message. Reply ONLY with JSON: ' +
						'{"tasks":[{"title":string,"assignee":string|null,"due":string|null}]}. ' +
						'A task is something someone must DO. Questions, comments and completed work are not tasks. ' +
						'If there are none, reply {"tasks":[]}. Keep titles under 80 characters.'
				},
				{ role: 'user', content: text.slice(0, 800) }
			],
			250
		)

		const parsed = extractJson(response) as { tasks?: unknown } | null
		if (!parsed || !Array.isArray(parsed.tasks)) return []

		return parsed.tasks
			.map((raw): ExtractedTask | null => {
				if (!raw || typeof raw !== 'object') return null
				const r = raw as Record<string, unknown>
				const title = typeof r.title === 'string' ? r.title.trim() : ''
				if (!title) return null
				return {
					title: title.slice(0, 120),
					assigneeHint: typeof r.assignee === 'string' && r.assignee.trim() ? r.assignee.trim() : null,
					dueHint: typeof r.due === 'string' && r.due.trim() ? r.due.trim() : null
				}
			})
			.filter((t): t is ExtractedTask => t !== null)
	} catch {
		return []
	}
}

/* -------------------------------------------------------------------------- */
/* Shopping lists                                                              */
/* -------------------------------------------------------------------------- */

export type ShoppingList = {
	/** The message rewritten with spellings fixed, one item per line. */
	correctedText: string
	items: { name: string; quantity: string | null }[]
}

/**
 * A list of things to buy, as opposed to a record of things bought.
 *
 * Distinguishing them matters: an order going to a vendor must not also be
 * filed as money already spent. Amounts and past-tense verbs mean it is a
 * purchase; bare item names mean it is a list.
 */
export function looksLikeShoppingList(text: string): boolean {
	if (!text || text.trim().length < 5) return false

	const lower = text.toLowerCase()

	// Past-tense spend words mean this is a record, not a request.
	if (/\b(bought|paid|spent|purchased|kharida|liya|diya)\b/.test(lower)) return false
	// A leading amount is the purchase house style.
	if (/(^|,|\n)\s*\d{2,6}\s+[a-z]/.test(lower)) return false

	const parts = lower.split(/[,\n]/).map((p) => p.trim()).filter(Boolean)
	if (parts.length < 2) return false

	// Mostly short phrases with no currency reads as a list to buy.
	const shortParts = parts.filter((p) => p.split(/\s+/).length <= 4).length
	return shortParts >= parts.length - 1 && !/(₹|rs\.?|rupees)/.test(lower)
}

/**
 * Cleans up a shopping list for sending to a vendor.
 *
 * Fixes spelling and normalises layout, but never adds or removes items — a
 * list going to a supplier has to say exactly what was asked for.
 */
export async function correctShoppingList(
	text: string,
	knownItems: string[] = []
): Promise<ShoppingList | null> {
	const vocabulary = knownItems.slice(0, 60).join(', ')

	try {
		const response = await runModel(
			[
				{
					role: 'system',
					content:
						'You clean up a restaurant shopping list for sending to a vendor. ' +
						'Reply ONLY with JSON: {"items":[{"name":string,"quantity":string|null}]}. ' +
						'Fix spelling mistakes in item names (tamatar->tomato, oinon->onion, potatoe->potato, ' +
						'dhaniya->coriander, pyaaz->onion, palak->spinach). Keep quantities exactly as written. ' +
						'Do NOT add items that are not there. Do NOT remove any item. Keep the original order.' +
						(vocabulary
							? `\nPrefer these known spellings where they match: ${vocabulary}`
							: '')
				},
				{ role: 'user', content: text.slice(0, 800) }
			],
			400
		)

		const parsed = extractJson(response) as { items?: unknown } | null
		if (!parsed || !Array.isArray(parsed.items) || parsed.items.length === 0) return null

		const items = parsed.items
			.map((raw) => {
				if (!raw || typeof raw !== 'object') return null
				const r = raw as Record<string, unknown>
				const name = typeof r.name === 'string' ? r.name.trim() : ''
				if (!name) return null
				// The model sometimes emits the literal string "null" rather than
				// JSON null, which would render as "— null" on the vendor list.
				const rawQty = typeof r.quantity === 'string' ? r.quantity.trim() : ''
				const quantity = rawQty && !/^(null|none|n\/a|-)$/i.test(rawQty) ? rawQty : null
				return { name: name.slice(0, 80), quantity }
			})
			.filter((i): i is { name: string; quantity: string | null } => i !== null)

		if (items.length === 0) return null

		return {
			items,
			correctedText: items
				.map((i, n) => `${n + 1}. ${i.name}${i.quantity ? ` — ${i.quantity}` : ''}`)
				.join('\n')
		}
	} catch {
		return null
	}
}
