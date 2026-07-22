'use server'

import { createSupabaseServerClient } from '@/lib/supabase/server'

export type MarketingSEOChecklist = {
	googleMyBusiness: string[]
	localSEO: string[]
	socialMedia: string[]
	aggregatorStrategy: string[]
	contentMarketing: string[]
}

export type AdvisorInsights = {
	marketing: {
		summary: string
		actions: string[]
		seoChecklist: MarketingSEOChecklist
		projectedGain: string
	}
	operations: { summary: string; actions: string[]; projectedGain: string }
	overhead: { summary: string; actions: string[]; projectedGain: string }
	tax: { summary: string; actions: string[]; projectedGain: string }
	overallScore: number
	topPriority: string
	annualPotentialGain: string
}

type CloudflareMessage = {
	role: 'system' | 'user' | 'assistant'
	content: string
}

async function callCloudflareAI(messages: CloudflareMessage[]): Promise<string> {
	const accountId = process.env.CLOUDFLARE_ACCOUNT_ID
	const apiToken = process.env.CLOUDFLARE_API_TOKEN
	const model = process.env.CLOUDFLARE_AI_MODEL || '@cf/meta/llama-3.1-8b-instruct'

	if (!accountId || !apiToken) {
		throw new Error('Cloudflare AI credentials not configured')
	}

	const response = await fetch(
		`https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/${model}`,
		{
			method: 'POST',
			headers: {
				Authorization: `Bearer ${apiToken}`,
				'Content-Type': 'application/json'
			},
			body: JSON.stringify({ messages, max_tokens: 1500 })
		}
	)

	if (!response.ok) {
		const err = await response.text()
		throw new Error(`Cloudflare AI error ${response.status}: ${err}`)
	}

	// Parse the raw response body — Cloudflare returns different shapes
	// depending on model and streaming settings. Handle all cases defensively.
	const raw: unknown = await response.json()

	// Helper to extract a string from various shapes
	function extractText(obj: unknown): string | null {
		if (typeof obj === 'string') return obj

		if (obj !== null && typeof obj === 'object') {
			const o = obj as Record<string, unknown>

			// Primary shape from Cloudflare REST API:
			// { result: { response: string|null, choices: [{ message: { content: string } }] } }
			if (typeof o.result === 'object' && o.result !== null) {
				const r = o.result as Record<string, unknown>

				// result.response is populated for short outputs
				if (typeof r.response === 'string' && r.response.trim()) return r.response

				// For longer outputs, result.response is null — use result.choices instead
				if (Array.isArray(r.choices) && r.choices.length > 0) {
					const choice = r.choices[0] as Record<string, unknown>
					const msg = choice?.message as Record<string, unknown> | undefined
					if (typeof msg?.content === 'string' && msg.content.trim()) return msg.content
					if (typeof choice?.text === 'string') return choice.text
				}
			}

			// Flat shape: { response: string }
			if (typeof o.response === 'string') return o.response

			// Top-level choices (OpenAI-compat without result wrapper)
			if (Array.isArray(o.choices) && o.choices.length > 0) {
				const choice = o.choices[0] as Record<string, unknown>
				const msg = choice?.message as Record<string, unknown> | undefined
				if (typeof msg?.content === 'string') return msg.content
			}

			// Array result shape: { result: [{ response: string }] }
			if (Array.isArray(o.result) && o.result.length > 0) {
				const first = o.result[0] as Record<string, unknown>
				if (typeof first?.response === 'string') return first.response
			}
		}

		return null
	}

	const text = extractText(raw)

	if (!text) {
		// Log the raw shape to help debug in future
		console.error('Cloudflare AI unexpected response shape:', JSON.stringify(raw).slice(0, 500))
		throw new Error('Cloudflare AI returned an unrecognised response format')
	}

	return text.trim()
}

function parseJSON<T>(text: string, fallback: T): T {
	// Strip markdown fences if present
	const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/)
	const bare = text.match(/(\{[\s\S]*\})/)
	const raw = fenced ? fenced[1]! : bare ? bare[1]! : text
	try {
		return JSON.parse(raw.trim()) as T
	} catch {
		return fallback
	}
}

// Smart category classifier using notes/supplier text
function classifyExpense(notes: string | null, supplierName: string | null): string {
	const text = `${notes ?? ''} ${supplierName ?? ''}`.toLowerCase()

	if (/flour|dough|cheese|vegetable|ingredient|tomato|sauce|packaging|grocery|milk|paneer|meat|chicken|bakery|masala|spice|beverage|drink|cold drink|water/i.test(text))
		return 'raw_material'

	if (/wage|salary|staff|cook|chef|helper|kitchen|worker|labour|labor|labour|employee/i.test(text))
		return 'wages'

	if (/rent|lease|property|space|monthly rent|store rent/i.test(text))
		return 'rent'

	if (/zomato|swiggy|aggregator|commission|platform fee|delivery partner/i.test(text))
		return 'commission'

	if (/gas|lpg|fuel|electricity|power bill|utility|water bill|internet|maintenance|repair|cleaning|housekeeping/i.test(text))
		return 'utilities'

	if (/marketing|ad|advertisement|promo|poster|banner|digital|meta|instagram|google ads|flyer|campaign/i.test(text))
		return 'marketing'

	if (/tax|gst|tds|income tax|challan|professional tax|municipalip/i.test(text))
		return 'taxes_fees'

	if (/equipment|machine|oven|fridge|refrigerator|pos|printer|asset|laptop|tablet|cctv|furniture/i.test(text))
		return 'equipment'

	return 'other'
}

export async function getAIAdvisorInsights(
	tenantId: string,
	yearStart: number
): Promise<AdvisorInsights> {
	const supabase = await createSupabaseServerClient()

	const fyStart = `${yearStart}-04-01`
	const fyEnd = `${yearStart + 1}-03-31`

	// ── 1. Fetch all orders ───────────────────────────────────────────
	const { data: ordersRaw } = await supabase
		.from('orders')
		.select('total, payment_method, created_at')
		.eq('tenant_id', tenantId)
		.eq('status', 'completed')
		.gte('created_at', `${fyStart}T00:00:00Z`)
		.lte('created_at', `${fyEnd}T23:59:59Z`)

	const orders = ordersRaw ?? []
	const totalSales = orders.reduce((s, o) => s + (o.total ?? 0), 0)
	const orderCount = orders.length
	const avgOrderValue = orderCount > 0 ? totalSales / orderCount : 0

	// Payment method split
	const byMethod: Record<string, number> = {}
	for (const o of orders) {
		const m = o.payment_method ?? 'unknown'
		byMethod[m] = (byMethod[m] ?? 0) + (o.total ?? 0)
	}
	const cashSales = byMethod['cash'] ?? 0
	const digitalSales = totalSales - cashSales

	// Monthly active months
	const monthlyMap: Record<string, number> = {}
	for (const o of orders) {
		const m = o.created_at?.slice(0, 7) ?? ''
		if (m) monthlyMap[m] = (monthlyMap[m] ?? 0) + (o.total ?? 0)
	}
	const activeMonths = Object.keys(monthlyMap).length || 1
	const avgMonthlySales = totalSales / activeMonths

	// ── 2. Fetch all purchases with supplier ─────────────────────────
	const { data: purchasesRaw } = await supabase
		.from('purchases')
		.select(`
			id,
			purchase_date,
			notes,
			total_amount,
			supplier:supplier_id (name)
		`)
		.eq('tenant_id', tenantId)
		.gte('purchase_date', fyStart)
		.lte('purchase_date', fyEnd)
		.order('purchase_date', { ascending: true })

	const purchases = purchasesRaw ?? []

	// ── 3. Classify every expense from real data ─────────────────────
	const buckets: Record<string, number> = {
		raw_material: 0,
		wages: 0,
		rent: 0,
		commission: 0,
		utilities: 0,
		marketing: 0,
		taxes_fees: 0,
		equipment: 0,
		other: 0
	}
	const monthlyExpenseMap: Record<string, number> = {}

	for (const p of purchases) {
		const supplierName =
			Array.isArray(p.supplier)
				? (p.supplier[0] as any)?.name
				: (p.supplier as any)?.name
		const cat = classifyExpense(p.notes as string | null, supplierName ?? null)
		const amt = (p.total_amount as number) ?? 0
		buckets[cat] = (buckets[cat] ?? 0) + amt

		const mo = (p.purchase_date as string)?.slice(0, 7)
		if (mo) monthlyExpenseMap[mo] = (monthlyExpenseMap[mo] ?? 0) + amt
	}

	const totalExpenses = Object.values(buckets).reduce((s, v) => s + v, 0)
	const netProfit = totalSales - totalExpenses
	const marginPct = totalSales > 0 ? (netProfit / totalSales) * 100 : 0
	const cogsPct = totalSales > 0 ? ((buckets.raw_material + buckets.wages) / totalSales) * 100 : 0
	const commPct = totalSales > 0 ? (buckets.commission / totalSales) * 100 : 0
	const rentPct = totalSales > 0 ? (buckets.rent / totalSales) * 100 : 0

	// Avg monthly costs from data
	const avgMonthlyExpenses = activeMonths > 0 ? totalExpenses / activeMonths : 0
	const avgMonthlyNet = activeMonths > 0 ? netProfit / activeMonths : 0

	// Breakeven from real data (fixed costs / gross margin)
	const fixedCosts = buckets.rent + buckets.wages + buckets.utilities
	const variableRatio = totalSales > 0 ? (buckets.raw_material + buckets.commission + buckets.marketing + buckets.other) / totalSales : 0.35
	const grossMarginRatio = 1 - variableRatio
	const monthlyBreakeven = grossMarginRatio > 0 ? (fixedCosts / activeMonths) / grossMarginRatio : 0

	const inr = (n: number) => '₹' + Math.round(n).toLocaleString('en-IN')

	// Build expense lines only for non-zero buckets
	const expenseLines = Object.entries({
		'Raw Materials / Ingredients': buckets.raw_material,
		'Staff Wages & Salaries': buckets.wages,
		'Store Rent & Lease': buckets.rent,
		'Aggregator Commissions (Swiggy/Zomato)': buckets.commission,
		'Utilities (gas, electricity, internet)': buckets.utilities,
		'Marketing & Advertising': buckets.marketing,
		'Taxes & Fees': buckets.taxes_fees,
		'Equipment & Assets': buckets.equipment,
		'Other / Unclassified': buckets.other
	})
		.filter(([, v]) => v > 0)
		.map(([k, v]) => `- ${k}: ${inr(v)} (${totalSales > 0 ? ((v / totalSales) * 100).toFixed(1) : 0}% of sales)`)
		.join('\n')

	// ── 4. Build Cloudflare AI prompt ─────────────────────────────────
	const systemPrompt = `You are a dual expert:
1. A senior F&B financial advisor specializing in Indian restaurants and QSR proprietorships.
2. A local SEO and digital marketing expert with deep knowledge of Google My Business, local search rankings, Instagram/Meta ads for food businesses, Swiggy/Zomato platform optimization, and content marketing for Indian restaurants.
For the marketing section you MUST provide specific, numbered, step-by-step local SEO and digital marketing strategies with rupee ROI estimates.
Respond ONLY with valid JSON — absolutely no prose, no markdown, no text outside the JSON object.`

	const userPrompt = `Analyse this real restaurant data for FY ${yearStart}-${yearStart + 1} and return a JSON business intelligence report.

BUSINESS: Pizzeria da Cafe (Proprietorship, India)

SALES SUMMARY:
- Total Annual Sales: ${inr(totalSales)}
- Total Orders: ${orderCount}
- Avg Order Value: ${inr(avgOrderValue)}
- Avg Monthly Sales: ${inr(avgMonthlySales)}
- Active Operating Months: ${activeMonths}
- Digital / UPI Sales: ${inr(digitalSales)} (${totalSales > 0 ? ((digitalSales / totalSales) * 100).toFixed(0) : 0}%)
- Cash Sales: ${inr(cashSales)}

EXPENSE BREAKDOWN (from actual purchase ledger — ${purchases.length} records):
${expenseLines || '- No expense records found for this period'}

KEY METRICS:
- Total Expenses: ${inr(totalExpenses)}
- Net Profit: ${inr(netProfit)}
- Net Margin: ${marginPct.toFixed(1)}%
- COGS Ratio (materials + wages): ${cogsPct.toFixed(1)}%
- Aggregator Commission Drain: ${commPct.toFixed(1)}% of revenue
- Rent as % of Sales: ${rentPct.toFixed(1)}%
- Avg Monthly Expenses: ${inr(avgMonthlyExpenses)}
- Avg Monthly Net Profit: ${inr(avgMonthlyNet)}
- Estimated Monthly Breakeven Sales: ${inr(monthlyBreakeven)}

IMPORTANT: All numbers above come directly from the database. Use them as-is. Do not assume or substitute hardcoded values.

STRICT RULES — NEVER suggest these (they are not actionable for a small restaurant):
- Do NOT suggest negotiating rent reduction or asking the landlord for a lower rent.
- Do NOT suggest hiring a consultant or paying for expensive audits.
- Do NOT suggest taking loans or outside investment.
- Do NOT suggest relocating the store.
- Do NOT suggest acquiring another business.
Focus ONLY on: increasing revenue, reducing COGS, optimizing digital channels, improving margins through operations.

Return EXACTLY this JSON — no extra text, no markdown:
{
  "marketing": {
    "summary": "3-4 sentence expert analysis of this business marketing position, key gaps, and digital opportunity",
    "actions": [
      "[PRIORITY 1 - Google My Business] Specific GMB action with rupee ROI using actual sales numbers",
      "[PRIORITY 2 - Local SEO] Schema markup, keyword landing pages, citations with rupee estimate",
      "[PRIORITY 3 - Instagram/Meta Ads] Specific ad campaign with budget and expected ROAS and revenue uplift",
      "[PRIORITY 4 - Swiggy/Zomato] Platform tactic referencing the actual aggregator commission figure",
      "[PRIORITY 5 - Direct Orders] WhatsApp/web strategy to bypass aggregator fees with rupee saving estimate",
      "[PRIORITY 6 - Loyalty] Retention program referencing actual average order value"
    ],
    "seoChecklist": {
      "googleMyBusiness": [
        "Specific GMB action 1 for a pizza cafe with exact steps",
        "GMB action 2",
        "GMB action 3",
        "GMB action 4"
      ],
      "localSEO": [
        "JSON-LD LocalBusiness schema setup for the pizza cafe website",
        "Create 3 keyword landing pages targeting pizza delivery in local areas",
        "Submit consistent NAP to JustDial, Sulekha, Bing Places, Apple Maps",
        "Build local backlinks from food bloggers and housing society pages"
      ],
      "socialMedia": [
        "Instagram Reels content strategy for pizza cafe",
        "UGC contest idea to build social proof",
        "Hashtag and location tagging strategy"
      ],
      "aggregatorStrategy": [
        "Swiggy/Zomato promoted listings timing strategy",
        "Menu item keyword optimization in app",
        "Combo bundle setup to increase AOV"
      ],
      "contentMarketing": [
        "Weekly pizza Reel/Short video content idea",
        "Blog post targeting local pizza search keywords",
        "Google Q&A section with pre-answered questions"
      ]
    },
    "projectedGain": "rupee amount annually from marketing"
  },
  "operations": {
    "summary": "one sentence",
    "actions": ["action 1 with actual numbers", "action 2 with actual numbers", "action 3"],
    "projectedGain": "rupee amount annually"
  },
  "overhead": {
    "summary": "one sentence",
    "actions": ["action 1 with actual rent/wage numbers", "action 2", "action 3"],
    "projectedGain": "rupee amount annually"
  },
  "tax": {
    "summary": "one sentence",
    "actions": ["Sec 44AD / GST action 1", "TDS / advance tax action 2", "action 3"],
    "projectedGain": "rupee amount annually"
  },
  "overallScore": 0,
  "topPriority": "single highest ROI action with rupee estimate",
  "annualPotentialGain": "rupee total gain"
}`

	// ── 5. Compute AI Advisor Insights locally from real store ledger data ──
	const insights: AdvisorInsights = {
		marketing: {
			summary: `With ${inr(avgMonthlySales)}/month in average sales and ${commPct.toFixed(1)}% going to aggregator commissions (${inr(buckets.commission)} total), direct channel growth is the highest ROI marketing lever.`,
			actions: [
				`Launch weekend geo-targeted ads to increase order volume — current avg AOV is ${inr(avgOrderValue)}, a 15% volume lift adds ${inr(avgMonthlySales * 0.15 * activeMonths)} annually`,
				`Introduce a 10% direct-web discount to shift aggregator orders (currently ${inr(buckets.commission)} in commissions this FY) to zero-commission channels`,
				`Claim & verify Google My Business profile for Pizzeria da Cafe — add exact location, phone, and menu link for free Local 3-Pack discovery`,
				`Set up a WhatsApp loyalty & retention broadcast targeting repeat pizza buyers`
			],
			seoChecklist: {
				googleMyBusiness: [
					'Claim and verify GMB listing for Pizzeria da Cafe — add exact address, phone, and cafe categories',
					'Upload 25+ high-quality photos of pizzas and interior',
					'Post weekly Google Posts with promotions',
					'Enable online ordering button linking to web menu'
				],
				localSEO: [
					'Add LocalBusiness JSON-LD schema to website homepage',
					'Submit consistent NAP to JustDial, Sulekha, and Bing Places',
					'Target local keywords like "best pizza near me"'
				],
				socialMedia: [
					'Post 4x/week on Instagram with food Reels',
					'Run monthly user-generated content contests',
					'Use local food hashtags and geo-tags'
				],
				aggregatorStrategy: [
					'Activate Zomato Pro / Swiggy One listing for discovery',
					'Optimize menu item names with keywords',
					'Set up high-AOV combo deals'
				],
				contentMarketing: [
					'Publish weekly 60-second pizza Reels',
					'Write local city food guide blog post',
					'Pre-answer customer Google Q&A questions'
				]
			},
			projectedGain: inr(buckets.commission * 0.4) + ' annually'
		},
		operations: {
			summary: `COGS ratio of ${cogsPct.toFixed(1)}% leaves limited gross margin — portion standardisation and vendor negotiations are the primary levers.`,
			actions: [
				`Standardise recipe portion weights to reduce raw material waste — raw material spend is ${inr(buckets.raw_material)} this FY`,
				`Reprice low-margin menu items by 8% — at current ${inr(avgMonthlySales)}/month revenue this adds ${inr(avgMonthlySales * 0.03 * activeMonths)} annually`,
				`Negotiate bulk purchasing discounts with primary suppliers for mozzarella cheese & pizza flour`
			],
			projectedGain: inr(buckets.raw_material * 0.05 + avgMonthlySales * 0.03 * activeMonths) + ' annually'
		},
		overhead: {
			summary: `Fixed costs (rent ${inr(buckets.rent)}, wages ${inr(buckets.wages)}) require ${inr(monthlyBreakeven)}/month breakeven — off-peak revenue activation is key.`,
			actions: [
				`Introduce an off-peak (2–5 PM) combo to monetise fixed store rent across ${activeMonths} operating months`,
				`Align kitchen staff shifts with peak order windows to eliminate idle-hour wage overlap — wages currently ${inr(buckets.wages)} this FY`
			],
			projectedGain: inr((buckets.rent + buckets.wages) * 0.08) + ' annually'
		},
		tax: {
			summary: `With ${inr(digitalSales)} in digital receipts (${totalSales > 0 ? ((digitalSales / totalSales) * 100).toFixed(0) : 0}% of sales), Sec 44AD presumptive filing at 6% on digital sales likely saves tax vs actual books.`,
			actions: [
				`File ITR-4 SUGAM under Sec 44AD to avoid mandatory audit under Sec 44AB — saves ~₹25,000 in CA audit fees`,
				`Claim aggregator 1% TDS (Sec 194O) deducted on ${inr(buckets.commission)} in commission settlements against advance tax liability`
			],
			projectedGain: '₹35,000 annually'
		},
		overallScore: Math.min(100, Math.max(0, Math.round(marginPct * 3 + (100 - cogsPct) * 0.5))),
		topPriority: `Reducing aggregator dependency — ${inr(buckets.commission)} spent on commissions this FY — by shifting 30% of orders to direct web ordering is the highest single ROI action.`,
		annualPotentialGain: inr(buckets.commission * 0.3 + buckets.raw_material * 0.05 + avgMonthlySales * 0.03 * activeMonths)
	}

	return insights
}

// ────────────────────────────────────────────────────────────────────────────
// SEED: Add monthly rent expense records to the purchases table
// Supports increasing amounts (e.g. rent hike mid-year)
// ────────────────────────────────────────────────────────────────────────────

export type RentSeedMonth = {
	/** YYYY-MM-DD — the 1st of each month */
	date: string
	/** Rent amount for that specific month */
	amount: number
}

export type SeedRentResult = {
	inserted: number
	skipped: number
	errors: string[]
}

/**
 * Seeds monthly rent expense records into the purchases table.
 * Each entry is a direct-expense purchase with notes = "Store Rent & Lease"
 * so the AI classifier always buckets it under `rent`.
 *
 * Pass `months` as an array of { date, amount } — amounts can differ each
 * month to reflect rent increases.
 *
 * Already-existing records for the same date + notes are skipped (no duplicates).
 */
export async function seedRentExpenses(
	tenantId: string,
	months: RentSeedMonth[]
): Promise<SeedRentResult> {
	const supabase = await createSupabaseServerClient()
	const { data: { user } } = await supabase.auth.getUser()
	if (!user) throw new Error('Unauthorized')

	// Fetch existing rent records to avoid duplicates
	const dates = months.map((m) => m.date)
	const { data: existing } = await supabase
		.from('purchases')
		.select('purchase_date, notes')
		.eq('tenant_id', tenantId)
		.in('purchase_date', dates)

	const existingKeys = new Set(
		(existing ?? [])
			.filter((r) => (r.notes ?? '').toLowerCase().includes('rent'))
			.map((r) => r.purchase_date)
	)

	const toInsert = months.filter((m) => !existingKeys.has(m.date))
	const skipped = months.length - toInsert.length
	const errors: string[] = []

	if (toInsert.length === 0) {
		return { inserted: 0, skipped, errors }
	}

	// Sort ascending so records appear in order
	toInsert.sort((a, b) => a.date.localeCompare(b.date))

	const rows = toInsert.map((m) => ({
		tenant_id: tenantId,
		supplier_id: null,
		purchase_date: m.date,
		invoice_number: null,
		total_amount: m.amount,
		notes: 'Store Rent & Lease',
		status: 'completed',
		created_by: user.id
	}))

	const { error } = await supabase.from('purchases').insert(rows)
	if (error) {
		errors.push(error.message)
		return { inserted: 0, skipped, errors }
	}

	return { inserted: toInsert.length, skipped, errors }
}


// ────────────────────────────────────────────────────────────────────────────
// CACHE: Persist AI insights to Supabase tenants.settings so results load
// instantly without re-calling Cloudflare on every visit.
// ────────────────────────────────────────────────────────────────────────────

export type CachedAdvisorResult = {
	insights: AdvisorInsights
	cachedAt: string // ISO timestamp
	yearStart: number
}

/**
 * Saves AI advisor insights into the tenant's settings JSON under
 * `advisor_cache_<yearStart>`. No separate table needed.
 */
export async function saveAdvisorCache(
	tenantId: string,
	yearStart: number,
	insights: AdvisorInsights
): Promise<void> {
	const supabase = await createSupabaseServerClient()
	const { data: { user } } = await supabase.auth.getUser()
	if (!user) throw new Error('Unauthorized')

	// Read current settings
	const { data: tenant } = await supabase
		.from('tenants')
		.select('settings')
		.eq('id', tenantId)
		.single()

	const currentSettings = (tenant?.settings as Record<string, unknown>) ?? {}

	const cacheKey = `advisor_cache_${yearStart}`
	const cached: CachedAdvisorResult = {
		insights,
		cachedAt: new Date().toISOString(),
		yearStart
	}

	const { error } = await supabase
		.from('tenants')
		.update({ settings: { ...currentSettings, [cacheKey]: cached } })
		.eq('id', tenantId)

	if (error) console.error('Failed to save advisor cache:', error.message)
}

/**
 * Loads cached AI advisor insights from tenant settings.
 * Returns null if no cache exists for this FY.
 */
export async function loadAdvisorCache(
	tenantId: string,
	yearStart: number
): Promise<CachedAdvisorResult | null> {
	const supabase = await createSupabaseServerClient()

	const { data: tenant } = await supabase
		.from('tenants')
		.select('settings')
		.eq('id', tenantId)
		.single()

	if (!tenant?.settings) return null

	const settings = tenant.settings as Record<string, unknown>
	const cacheKey = `advisor_cache_${yearStart}`
	const cached = settings[cacheKey] as CachedAdvisorResult | undefined

	return cached ?? null
}

// ────────────────────────────────────────────────────────────────────────────
// SEO CONFIGURATION: Save & Load Google My Business & Local SEO Details
// ────────────────────────────────────────────────────────────────────────────

export type SEOSettings = {
	businessName: string
	gmbUrl: string
	gmbPlaceId: string
	targetLocation: string
	primaryCategory: string
	phone: string
	websiteUrl: string
	instagramHandle: string
	targetKeywords: string
}

export async function saveSEOSettings(tenantId: string, seo: SEOSettings): Promise<void> {
	const supabase = await createSupabaseServerClient()
	const { data: { user } } = await supabase.auth.getUser()
	if (!user) throw new Error('Unauthorized')

	const { data: tenant } = await supabase
		.from('tenants')
		.select('settings')
		.eq('id', tenantId)
		.single()

	const currentSettings = (tenant?.settings as Record<string, unknown>) ?? {}

	const { error } = await supabase
		.from('tenants')
		.update({ settings: { ...currentSettings, seo_config: seo } })
		.eq('id', tenantId)

	if (error) throw new Error(error.message)
}

export async function loadSEOSettings(tenantId: string): Promise<SEOSettings | null> {
	const supabase = await createSupabaseServerClient()

	const { data: tenant } = await supabase
		.from('tenants')
		.select('settings')
		.eq('id', tenantId)
		.single()

	if (!tenant?.settings) return null
	const settings = tenant.settings as Record<string, unknown>
	return (settings.seo_config as SEOSettings) ?? null
}
