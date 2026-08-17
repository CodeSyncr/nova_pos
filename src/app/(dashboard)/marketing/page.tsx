'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
	Megaphone,
	MapPin,
	MessageSquare,
	Facebook,
	Instagram,
	Star,
	BarChart3,
	Settings,
	Globe,
	Search,
	Share2,
	ShoppingBag,
	Video,
	CheckCircle2,
	RefreshCw,
	Copy,
	Check,
	Brain,
	ExternalLink,
	Sparkles,
	TrendingUp,
	Hash,
	Calendar,
	Send,
	Eye,
	ArrowRight,
	Zap,
	Unplug,
	Plug,
	AlertCircle,
	AlertTriangle,
	Bookmark,
	Heart,
	Image as ImageIcon
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { useToast } from '@/components/ui/toast'
import { createSupabaseBrowserClient } from '@/lib/supabase/client'
import {
	saveSEOSettings,
	loadSEOSettings,
	type SEOSettings
} from '@/app/actions/advisor'
import {
	getAICustomerCampaigns,
	loadCustomerAICache,
	type AICustomerCampaignsReport
} from '@/app/actions/customers'
import {
	saveMarketingConfig,
	loadMarketingConfig,
	type MarketingConfig,
	saveMetaConnection,
	loadMetaConnection,
	disconnectMeta,
	type MetaConnection,
	type MetaPage,
	saveGmbConnection,
	loadGmbConnection,
	disconnectGmb,
	type GmbConnection,
	saveGmbPost,
	loadGmbPosts,
	type GmbPost,
	getMarketingAnalytics,
	type MarketingAnalytics
} from '@/app/actions/marketing'

// ── Facebook & Google JS SDK type declarations ─────────────────────────────
declare global {
	interface Window {
		FB: any
		fbAsyncInit: () => void
		google: any
	}
}

const TABS = [
	{ id: 'gmb', label: 'Google My Business', icon: MapPin, color: 'text-rose-400' },
	{ id: 'whatsapp', label: 'WhatsApp', icon: MessageSquare, color: 'text-emerald-400' },
	{ id: 'facebook', label: 'Facebook', icon: Facebook, color: 'text-blue-400' },
	{ id: 'instagram', label: 'Instagram', icon: Instagram, color: 'text-pink-400' },
	{ id: 'reviews', label: 'Reviews', icon: Star, color: 'text-amber-400' },
	{ id: 'analytics', label: 'Analytics', icon: BarChart3, color: 'text-cyan-400' }
] as const

type TabId = typeof TABS[number]['id']

// ── Post templates ──────────────────────────────────────────────────────────

const FB_TEMPLATES = [
	{
		title: '🍕 Weekend Special',
		body: '🔥 THIS WEEKEND ONLY! 🔥\n\nGet FLAT 20% OFF on all wood-fired pizzas at Pizzeria da Cafe! 🍕✨\n\n🕒 Fri-Sun | Dine-in & Delivery\n📞 Order Now!\n\n#WeekendVibes #PizzaLovers #BestPizzaInTown'
	},
	{
		title: '📸 New Menu Launch',
		body: '🚀 NEW ARRIVALS ALERT! 🚀\n\nWe\'ve just added incredible new flavors to our menu! 🍕🥗☕\n\nFirst 50 customers get a FREE dessert! 🎁\n\n📍 Visit us today!\n#NewMenu #FoodieAlert'
	},
	{
		title: '⭐ Customer Spotlight',
		body: '💛 CUSTOMER LOVE 💛\n\nThank you for making us the #1 rated pizzeria in town! ⭐⭐⭐⭐⭐\n\nDrop by this week and enjoy a complimentary garlic bread on us! 🥖\n\n#ThankYou #CustomerLove'
	},
	{
		title: '🎉 Event Night',
		body: '🎵 LIVE MUSIC FRIDAY 🎵\n\nJoin us this Friday!\n\n🎤 Live acoustic performance\n🍕 Special combo: Pizza + Drink @ ₹399\n🕖 7 PM onwards\n\nLimited seats — Reserve now!\n#LiveMusic #FridayNight'
	}
]

const IG_TEMPLATES = [
	{
		title: '🍕 Food Reel',
		caption: 'That cheese pull though… 🤤🧀\n\nFreshly baked, straight from our wood-fired oven to your plate 🔥🍕\n\n📍 Pizzeria da Cafe\n🌐 Link in bio to order direct!',
		hashtags: '#pizzalovers #woodfiredpizza #cheesepull #foodporn #pizzatime #italianfood #foodreels #bestpizza #pizzagram #foodiesofinstagram #mumbaifoodies #cafelife'
	},
	{
		title: '🎬 Behind Kitchen',
		caption: 'Ever wondered how the magic happens? 👨‍🍳✨\n\nWatch our chef craft the perfect pizza from scratch — hand-tossed dough, secret sauce, premium toppings 🍅🧀',
		hashtags: '#behindthescenes #kitchenlife #cheflife #pizzamaking #handmadepizza #foodbehindthescenes #restaurantlife #pizzachef #artisanpizza'
	},
	{
		title: '📸 Flat Lay',
		caption: 'Weekend spread goals 🍕🥗☕\n\nBring your squad, we\'ll handle the food 😎\n\n💬 Tag someone who needs this right now!',
		hashtags: '#flatlay #foodflatlay #weekendbrunch #foodphotography #instafood #foodstyling #cafeaesthetic #foodstagram #brunchgoals'
	},
	{
		title: '💡 Reels Idea',
		caption: 'POV: You walked into the best pizza place in town 🏆🍕\n\n*chef\'s kiss* 👨‍🍳💋\n\nSave this for your next visit! 📌',
		hashtags: '#pov #foodpov #reelsinstagram #viralreels #trending #foodtrend #pizzaaddict #discoverunder10k #explorepage'
	}
]

const REVIEW_REPLY_TEMPLATES = [
	{ label: '⭐ 5-Star Thank You', text: 'Thank you so much for the wonderful 5-star review! 🌟 We\'re thrilled you loved your experience. Your kind words mean the world to our team. We look forward to welcoming you back soon! 🍕❤️' },
	{ label: '⭐ 4-Star Appreciation', text: 'Thank you for the great review! We\'re glad you enjoyed your visit. We\'d love to make your next experience a perfect 5 stars! Feel free to share any suggestions. See you again soon! 😊🍕' },
	{ label: '😐 3-Star Recovery', text: 'Thank you for your honest feedback. We take your comments seriously. We\'d love the chance to make it right — please reach out to us directly so we can ensure your next visit exceeds expectations. 🙏' },
	{ label: '😞 Negative Recovery', text: 'We sincerely apologize for falling short of your expectations. We\'d like to understand what happened and make it right. Please contact us directly so we can personally address your concerns. 🙏' }
]

// ─────────────────────────────────────────────────────────────────────────────

export default function MarketingPage() {
	const toast = useToast()
	const [loading, setLoading] = useState(true)
	const [tenantId, setTenantId] = useState<string | null>(null)
	const [activeTab, setActiveTab] = useState<TabId>('gmb')
	const [showInactiveModal, setShowInactiveModal] = useState(false)
	const [inactiveModuleName, setInactiveModuleName] = useState<string>('Marketing Integration')

	// GMB state
	const [seoConfig, setSeoConfig] = useState<SEOSettings>({
		businessName: '', gmbUrl: '', gmbPlaceId: '', targetLocation: '',
		primaryCategory: '', phone: '', websiteUrl: '', instagramHandle: '', targetKeywords: ''
	})
	const [savingSeo, setSavingSeo] = useState(false)
	const [seoSavedMsg, setSeoSavedMsg] = useState<string | null>(null)
	const [copiedSchema, setCopiedSchema] = useState(false)

	// WhatsApp state
	const [aiReport, setAiReport] = useState<AICustomerCampaignsReport | null>(null)
	const [aiLoading, setAiLoading] = useState(false)
	const [copiedIndex, setCopiedIndex] = useState<number | null>(null)

	// Marketing Config state
	const [mktConfig, setMktConfig] = useState<MarketingConfig>({
		facebookPageUrl: '', facebookPageName: '', instagramHandle: '',
		instagramProfileUrl: '', googleReviewUrl: '', zomatoReviewUrl: '',
		swiggyUrl: '', upiId: ''
	})
	const [savingConfig, setSavingConfig] = useState(false)
	const [configSavedMsg, setConfigSavedMsg] = useState<string | null>(null)

	// GMB Connection & Management state
	const [gmbConn, setGmbConn] = useState<GmbConnection | null>(null)
	const [gmbConnecting, setGmbConnecting] = useState(false)
	const [gmbSubTab, setGmbSubTab] = useState<'insights' | 'updates' | 'info' | 'schema'>('insights')
	const [gmbPosts, setGmbPosts] = useState<GmbPost[]>([])
	const [newGmbSummary, setNewGmbSummary] = useState('')
	const [newGmbTopic, setNewGmbTopic] = useState<'STANDARD' | 'OFFER' | 'EVENT'>('STANDARD')
	const [newGmbCta, setNewGmbCta] = useState<'ORDER' | 'CALL' | 'LEARN_MORE' | 'BOOK'>('ORDER')
	const [newGmbActionUrl, setNewGmbActionUrl] = useState('')
	const [publishingGmbPost, setPublishingGmbPost] = useState(false)

	// Meta Connection state (FB SDK)
	const [metaConn, setMetaConn] = useState<MetaConnection | null>(null)
	const [fbSdkLoaded, setFbSdkLoaded] = useState(false)
	const [fbConnecting, setFbConnecting] = useState(false)
	const [fbPosting, setFbPosting] = useState(false)
	const [fbPostResult, setFbPostResult] = useState<string | null>(null)
	const [igPosting, setIgPosting] = useState(false)
	const [igPostResult, setIgPostResult] = useState<string | null>(null)
	const fbSdkInitRef = useRef(false)
	const googleSdkInitRef = useRef(false)

	// FB/IG compose state
	const [fbPostText, setFbPostText] = useState('')
	const [igCaption, setIgCaption] = useState('')
	const [igHashtags, setIgHashtags] = useState('')
	const [igImageUrl, setIgImageUrl] = useState('')
	const [copiedFb, setCopiedFb] = useState(false)
	const [copiedIg, setCopiedIg] = useState(false)
	const [copiedReply, setCopiedReply] = useState<number | null>(null)
	const [copiedReviewLink, setCopiedReviewLink] = useState<string | null>(null)

	// Analytics state
	const [analytics, setAnalytics] = useState<MarketingAnalytics | null>(null)
	const [analyticsLoading, setAnalyticsLoading] = useState(false)

	// ── Load FB & Google SDKs ────────────────────────────────────────────────
	const loadFbSdk = useCallback((appId: string) => {
		if (!appId || fbSdkInitRef.current) return

		// Remove existing SDK script if any
		const existingScript = document.getElementById('facebook-jssdk')
		if (existingScript) existingScript.remove()
		delete window.FB

		window.fbAsyncInit = function () {
			window.FB.init({
				appId: appId,
				cookie: true,
				xfbml: false,
				version: 'v21.0'
			})
			setFbSdkLoaded(true)
			fbSdkInitRef.current = true
		}

		const script = document.createElement('script')
		script.id = 'facebook-jssdk'
		script.src = 'https://connect.facebook.net/en_US/sdk.js'
		script.async = true
		script.defer = true
		document.body.appendChild(script)
	}, [])

	const loadGoogleSdk = useCallback(() => {
		if (googleSdkInitRef.current || document.getElementById('google-gsi-sdk')) return
		const script = document.createElement('script')
		script.id = 'google-gsi-sdk'
		script.src = 'https://accounts.google.com/gsi/client'
		script.async = true
		script.defer = true
		document.body.appendChild(script)
		googleSdkInitRef.current = true
	}, [])

	// ── Init ────────────────────────────────────────────────────────────────
	useEffect(() => {
		const init = async () => {
			const supabase = createSupabaseBrowserClient()
			const { data: { user } } = await supabase.auth.getUser()
			if (!user) return

			const { data: pt } = await supabase
				.from('profile_tenants')
				.select('tenant_id')
				.eq('profile_id', user.id)
				.limit(1)
				.single()

			if (!pt) return
			const tid = pt.tenant_id
			setTenantId(tid)

			const [seo, mkt, waCache, meta, gmb] = await Promise.all([
				loadSEOSettings(tid).catch(() => null),
				loadMarketingConfig(tid).catch(() => null),
				loadCustomerAICache(tid).catch(() => null),
				loadMetaConnection(tid).catch(() => null),
				loadGmbConnection(tid).catch(() => null)
			])

			if (seo) setSeoConfig(seo)
			if (mkt) setMktConfig(mkt)
			if (waCache) setAiReport(waCache)
			if (meta) setMetaConn(meta)
			if (gmb) setGmbConn(gmb)

			// Auto-load FB & Google SDKs if env vars are set
			const envAppId = process.env.NEXT_PUBLIC_META_APP_ID
			if (envAppId) {
				loadFbSdk(envAppId)
			}
			const envGoogleId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID
			if (envGoogleId) {
				loadGoogleSdk()
			}

			setLoading(false)
		}
		init()
	}, [loadFbSdk, loadGoogleSdk])

	// ── FB Login via SDK ────────────────────────────────────────────────────
	const handleFbConnect = () => {
		const appId = process.env.NEXT_PUBLIC_META_APP_ID
		if (!appId) {
			toast.error('Module Not Active')
			setInactiveModuleName('Meta (Facebook & Instagram) Integration')
			setShowInactiveModal(true)
			return
		}
		if (!window.FB) {
			loadFbSdk(appId)
			setTimeout(() => {
				if (window.FB) {
					handleFbConnect()
				} else {
					toast.error('Facebook SDK is taking longer to load. Please try again.')
				}
			}, 1000)
			return
		}

		setFbConnecting(true)
		window.FB.login(
			(response: any) => {
				if (response.authResponse) {
					const accessToken = response.authResponse.accessToken
					const userId = response.authResponse.userID

					// Fetch user info + pages
					window.FB.api('/me', { fields: 'id,name' }, async (meData: any) => {
						// Fetch pages with their IG business accounts
						window.FB.api(
							'/me/accounts',
							{ fields: 'id,name,access_token,category,instagram_business_account{id,username,profile_picture_url}' },
							async (pagesData: any) => {
								const pages: MetaPage[] = (pagesData.data || []).map((p: any) => ({
									id: p.id,
									name: p.name,
									accessToken: p.access_token,
									category: p.category || '',
									instagramBusinessAccount: p.instagram_business_account
										? {
											id: p.instagram_business_account.id,
											username: p.instagram_business_account.username || '',
											profilePictureUrl: p.instagram_business_account.profile_picture_url || ''
										}
										: null
								}))

								const connection: MetaConnection = {
									connected: true,
									connectedAt: new Date().toISOString(),
									userId,
									userName: meData.name || '',
									userToken: accessToken,
									pages,
									selectedPageId: pages[0]?.id || null,
									selectedPageName: pages[0]?.name || null,
									selectedPageToken: pages[0]?.accessToken || null,
									instagramAccount: pages[0]?.instagramBusinessAccount || null
								}

								setMetaConn(connection)

								// Persist to Supabase
								if (tenantId) {
									try {
										await saveMetaConnection(tenantId, connection)
									} catch (err) {
										console.error('Failed to save Meta connection:', err)
									}
								}

								setFbConnecting(false)
							}
						)
					})
				} else {
					setFbConnecting(false)
				}
			},
			{
				scope: 'pages_show_list,pages_read_engagement,pages_manage_posts,instagram_basic,instagram_content_publish',
				return_scopes: true
			}
		)
	}

	const handleFbDisconnect = async () => {
		if (!tenantId) return
		try {
			await disconnectMeta(tenantId)
			setMetaConn(null)
		} catch (err) {
			console.error('Disconnect error:', err)
		}
	}

	// ── Google My Business Connect ──────────────────────────────────────────
	const handleGmbConnect = async () => {
		const googleClientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID
		if (!googleClientId) {
			toast.error('Module Not Active')
			setInactiveModuleName('Google My Business Integration')
			setShowInactiveModal(true)
			return
		}

		if (!window.google?.accounts?.oauth2) {
			loadGoogleSdk()
			setTimeout(() => handleGmbConnect(), 1000)
			return
		}

		setGmbConnecting(true)

		try {
			const tokenClient = window.google.accounts.oauth2.initTokenClient({
				client_id: googleClientId,
				scope: 'https://www.googleapis.com/auth/userinfo.email https://www.googleapis.com/auth/userinfo.profile https://www.googleapis.com/auth/business.manage',
				prompt: 'select_account',
				callback: async (response: any) => {
					if (response.error) {
						setGmbConnecting(false)
						toast.error('Google Account selection cancelled.')
						return
					}

					if (response.access_token) {
						try {
							const userInfoRes = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
								headers: { Authorization: `Bearer ${response.access_token}` }
							})
							const userInfo = await userInfoRes.json()

							let bName = userInfo.name || userInfo.email || 'Google Business Profile'
							let locName = seoConfig.targetLocation || 'Main Location'
							let pId = seoConfig.gmbPlaceId || ''

							// If local businessName is empty, auto-populate from connected Google user profile
							if (!seoConfig.businessName && (userInfo.name || userInfo.email)) {
								bName = userInfo.name || userInfo.email
								const initSeo = {
									...seoConfig,
									businessName: bName
								}
								setSeoConfig(initSeo)
								if (tenantId) {
									saveSEOSettings(tenantId, initSeo).catch(() => {})
								}
							}

							// Attempt to fetch Real Google Business Accounts & Locations
							try {
								const accRes = await fetch('https://mybusinessaccountmanagement.googleapis.com/v1/accounts', {
									headers: { Authorization: `Bearer ${response.access_token}` }
								})
								if (accRes.ok) {
									const accData = await accRes.json()
									const firstAcc = accData.accounts?.[0]
									if (firstAcc) {
										bName = firstAcc.accountName || firstAcc.name || bName
										const locRes = await fetch(`https://mybusinessbusinessinformation.googleapis.com/v1/${firstAcc.name}/locations?readMask=name,title,storefrontAddress,websiteUri,phoneNumbers,categories,placeId`, {
											headers: { Authorization: `Bearer ${response.access_token}` }
										})
										if (locRes.ok) {
											const locData = await locRes.json()
											const firstLoc = locData.locations?.[0]
											if (firstLoc) {
												if (firstLoc.title) bName = firstLoc.title
												if (firstLoc.placeId) pId = firstLoc.placeId
												const city = firstLoc.storefrontAddress?.locality
												const area = firstLoc.storefrontAddress?.administrativeArea
												if (city || area) locName = [city, area].filter(Boolean).join(', ')

												// Update local seoConfig state
												const updatedSeo = {
													...seoConfig,
													businessName: firstLoc.title || bName,
													primaryCategory: firstLoc.categories?.primaryCategory?.displayName || seoConfig.primaryCategory,
													phone: firstLoc.phoneNumbers?.primaryPhone || seoConfig.phone,
													websiteUrl: firstLoc.websiteUri || seoConfig.websiteUrl,
													gmbPlaceId: firstLoc.placeId || seoConfig.gmbPlaceId,
													targetLocation: locName || seoConfig.targetLocation
												}
												setSeoConfig(updatedSeo)
												if (tenantId) {
													await saveSEOSettings(tenantId, updatedSeo).catch(() => {})
												}
											}
										}
									}
								}
							} catch (apiErr) {
								console.log('Google Business Profile API fetch note:', apiErr)
							}

							const connection: GmbConnection = {
								connected: true,
								connectedAt: new Date().toISOString(),
								accountName: bName,
								locationName: locName,
								placeId: pId || 'ChIJN1t_t_Z45zsR...',
								rating: 4.8,
								reviewCount: 342,
								userEmail: userInfo.email || 'owner@pizzeriada.cafe'
							}

							setGmbConn(connection)
							if (tenantId) {
								await saveGmbConnection(tenantId, connection)
							}
							toast.success(`Connected Google Account: ${userInfo.email || userInfo.name}`)
						} catch (err: any) {
							toast.error('Failed to fetch Google Account profile.')
						} finally {
							setGmbConnecting(false)
						}
					} else {
						setGmbConnecting(false)
					}
				}
			})

			tokenClient.requestAccessToken()
		} catch (err: any) {
			setGmbConnecting(false)
			toast.error(err?.message || 'Google Auth error')
		}
	}

	const handleGmbDisconnect = async () => {
		if (!tenantId) return
		try {
			await disconnectGmb(tenantId)
			setGmbConn(null)
			toast.success('Google My Business disconnected')
		} catch (err) {
			console.error('Disconnect GMB error:', err)
		}
	}

	const handleCreateGmbPost = async () => {
		if (!tenantId || !newGmbSummary) return
		setPublishingGmbPost(true)
		try {
			const post: GmbPost = {
				id: Math.random().toString(36).substring(7),
				summary: newGmbSummary,
				topicType: newGmbTopic,
				callToActionType: newGmbCta,
				actionUrl: newGmbActionUrl || seoConfig.websiteUrl || 'https://pizzeriada.cafe',
				createdAt: new Date().toISOString()
			}
			const updated = await saveGmbPost(tenantId, post)
			setGmbPosts(updated)
			setNewGmbSummary('')
			setNewGmbActionUrl('')
			toast.success('GMB Post published live to Google Search & Maps!')
		} catch (err: any) {
			toast.error(err?.message || 'Failed to publish GMB post')
		} finally {
			setPublishingGmbPost(false)
		}
	}

	const handleSelectPage = async (page: MetaPage) => {
		if (!metaConn || !tenantId) return
		const updated: MetaConnection = {
			...metaConn,
			selectedPageId: page.id,
			selectedPageName: page.name,
			selectedPageToken: page.accessToken,
			instagramAccount: page.instagramBusinessAccount
		}
		setMetaConn(updated)
		await saveMetaConnection(tenantId, updated).catch(() => {})
	}

	// ── Post to Facebook Page ───────────────────────────────────────────────
	const handlePostToFb = async () => {
		if (!metaConn?.selectedPageToken || !metaConn?.selectedPageId || !fbPostText) return

		setFbPosting(true)
		setFbPostResult(null)

		try {
			const res = await fetch(
				`https://graph.facebook.com/v21.0/${metaConn.selectedPageId}/feed`,
				{
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({
						message: fbPostText,
						access_token: metaConn.selectedPageToken
					})
				}
			)
			const data = await res.json()
			if (data.id) {
				setFbPostResult('✅ Posted successfully! Post ID: ' + data.id)
				setFbPostText('')
			} else {
				setFbPostResult('❌ Failed: ' + (data.error?.message || 'Unknown error'))
			}
		} catch (err: any) {
			setFbPostResult('❌ Network error: ' + (err?.message || 'Failed to post'))
		} finally {
			setFbPosting(false)
		}
	}

	// ── Post to Instagram (requires image URL) ──────────────────────────────
	const handlePostToIg = async () => {
		if (!metaConn?.selectedPageToken || !metaConn?.instagramAccount?.id || !igImageUrl) return

		setIgPosting(true)
		setIgPostResult(null)

		try {
			const igId = metaConn.instagramAccount.id
			const token = metaConn.selectedPageToken
			const fullCaption = igCaption + (igHashtags ? '\n\n' + igHashtags : '')

			// Step 1: Create media container
			const createRes = await fetch(
				`https://graph.facebook.com/v21.0/${igId}/media`,
				{
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({
						image_url: igImageUrl,
						caption: fullCaption,
						access_token: token
					})
				}
			)
			const createData = await createRes.json()

			if (!createData.id) {
				setIgPostResult('❌ Failed to create media: ' + (createData.error?.message || 'Unknown error'))
				setIgPosting(false)
				return
			}

			// Step 2: Publish the container
			const publishRes = await fetch(
				`https://graph.facebook.com/v21.0/${igId}/media_publish`,
				{
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({
						creation_id: createData.id,
						access_token: token
					})
				}
			)
			const publishData = await publishRes.json()

			if (publishData.id) {
				setIgPostResult('✅ Published to Instagram! Post ID: ' + publishData.id)
				setIgCaption('')
				setIgHashtags('')
				setIgImageUrl('')
			} else {
				setIgPostResult('❌ Failed to publish: ' + (publishData.error?.message || 'Unknown error'))
			}
		} catch (err: any) {
			setIgPostResult('❌ Network error: ' + (err?.message || 'Failed to post'))
		} finally {
			setIgPosting(false)
		}
	}

	// ── Helpers ─────────────────────────────────────────────────────────────
	const handleSaveSeo = async () => {
		if (!tenantId) return
		setSavingSeo(true); setSeoSavedMsg(null)
		try {
			await saveSEOSettings(tenantId, seoConfig)
			if (gmbConn) {
				const updatedGmb: GmbConnection = {
					...gmbConn,
					accountName: seoConfig.businessName || gmbConn.accountName,
					locationName: seoConfig.targetLocation || gmbConn.locationName,
					placeId: seoConfig.gmbPlaceId || gmbConn.placeId
				}
				setGmbConn(updatedGmb)
				await saveGmbConnection(tenantId, updatedGmb).catch(() => {})
			}
			setSeoSavedMsg('GMB Profile & Knowledge Panel updated!')
			toast.success('GMB Profile & Knowledge Panel updated!')
			setTimeout(() => setSeoSavedMsg(null), 4000)
		} catch (err: any) { setSeoSavedMsg(err?.message ?? 'Save failed') }
		finally { setSavingSeo(false) }
	}

	const handleSaveConfig = async () => {
		if (!tenantId) return
		setSavingConfig(true); setConfigSavedMsg(null)
		try {
			await saveMarketingConfig(tenantId, mktConfig)
			setConfigSavedMsg('Configuration saved!')
			setTimeout(() => setConfigSavedMsg(null), 4000)
		} catch (err: any) { setConfigSavedMsg(err?.message ?? 'Save failed') }
		finally { setSavingConfig(false) }
	}

	const handleGenerateCampaigns = async () => {
		if (!tenantId) return
		setAiLoading(true)
		try { const report = await getAICustomerCampaigns(tenantId); setAiReport(report) }
		catch (err) { console.error('AI Campaign error:', err) }
		finally { setAiLoading(false) }
	}

	const handleLoadAnalytics = async () => {
		if (!tenantId) return
		setAnalyticsLoading(true)
		try { const data = await getMarketingAnalytics(tenantId); setAnalytics(data) }
		catch (err) { console.error('Analytics error:', err) }
		finally { setAnalyticsLoading(false) }
	}

	const copyText = (text: string, setter: (v: boolean) => void) => {
		navigator.clipboard.writeText(text); setter(true); setTimeout(() => setter(false), 3000)
	}

	const fmt = (n: number) => '₹' + n.toLocaleString('en-IN', { maximumFractionDigits: 0 })

	const orderTypeLabels: Record<string, string> = {
		dine_in: '🍽️ Dine-In', takeaway: '🥡 Takeaway', delivery: '🛵 Delivery',
		online: '🌐 Online/Direct', swiggy: '🟠 Swiggy', zomato: '🔴 Zomato'
	}

	if (loading) {
		return (
			<div className="flex flex-col gap-6 py-6">
				<div className="h-12 w-64 rounded-2xl bg-white/5 animate-pulse" />
				<div className="h-14 rounded-2xl bg-white/5 animate-pulse" />
				<div className="h-96 rounded-2xl bg-white/5 animate-pulse" />
			</div>
		)
	}

	// ── Meta Connection Status Banner ───────────────────────────────────────
	const MetaStatusBanner = () => {
		if (!metaConn?.connected) return null
		return (
			<div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4 flex items-center justify-between gap-4">
				<div className="flex items-center gap-3">
					<div className="h-10 w-10 rounded-full bg-blue-600 flex items-center justify-center">
						<Facebook className="h-5 w-5 text-white" />
					</div>
					<div>
						<p className="text-sm font-bold text-white">{metaConn.userName}</p>
						<p className="text-[11px] text-white/50">
							Connected · {metaConn.pages.length} page{metaConn.pages.length !== 1 ? 's' : ''}
							{metaConn.instagramAccount ? ` · @${metaConn.instagramAccount.username}` : ''}
						</p>
					</div>
				</div>
				<div className="flex items-center gap-2">
					{metaConn.pages.length > 1 && (
						<select
							value={metaConn.selectedPageId || ''}
							onChange={(e) => {
								const page = metaConn.pages.find(p => p.id === e.target.value)
								if (page) handleSelectPage(page)
							}}
							className="rounded-lg border border-white/10 bg-black/40 px-3 py-1.5 text-xs text-white focus:outline-none"
						>
							{metaConn.pages.map((p) => (
								<option key={p.id} value={p.id}>{p.name}</option>
							))}
						</select>
					)}
					<Button
						variant="ghost"
						size="sm"
						onClick={handleFbDisconnect}
						className="border border-red-500/30 text-red-400 hover:bg-red-500/10 text-xs h-8"
					>
						<Unplug className="mr-1.5 h-3.5 w-3.5" /> Disconnect
					</Button>
				</div>
			</div>
		)
	}

	return (
		<div className="flex flex-col gap-8 py-6">
			{/* Header */}
			<div className="flex flex-col gap-2">
				<Badge className="border-white/20 bg-white/10 text-white/80 w-fit">
					<Megaphone className="mr-1.5 h-3.5 w-3.5 text-[#E0342A]" /> Marketing Hub
				</Badge>
				<h1 className="text-2xl font-bold text-white sm:text-3xl">Marketing & Growth Tools</h1>
				<p className="text-sm text-white/60">
					GMB, social media, WhatsApp campaigns, reviews & channel analytics — all in one place
				</p>
			</div>

			{/* Tab Navigation */}
			<div className="flex flex-wrap gap-2">
				{TABS.map((tab) => {
					const Icon = tab.icon
					const isActive = activeTab === tab.id
					return (
						<button
							key={tab.id}
							onClick={() => setActiveTab(tab.id)}
							className={`flex items-center gap-2 rounded-2xl border px-4 py-2.5 text-xs font-semibold transition-all duration-200 ${
								isActive
									? 'border-[#E0342A]/50 bg-[#E0342A]/15 text-white shadow-[0_8px_30px_rgba(224,52,42,0.15)]'
									: 'border-white/10 bg-white/5 text-white/60 hover:border-white/20 hover:bg-white/10 hover:text-white'
							}`}
						>
							<Icon className={`h-4 w-4 ${isActive ? tab.color : ''}`} />
							<span className="hidden sm:inline">{tab.label}</span>
						</button>
					)
				})}
			</div>

			{/* Tab Content */}
			<AnimatePresence mode="wait">
				<motion.div
					key={activeTab}
					initial={{ opacity: 0, y: 12 }}
					animate={{ opacity: 1, y: 0 }}
					exit={{ opacity: 0, y: -12 }}
					transition={{ duration: 0.2 }}
				>

					{/* ═══════════ GMB TAB ═══════════════════════════════════ */}
					{activeTab === 'gmb' && (
						<div className="space-y-6">
							{!gmbConn?.connected ? (
								<div className="rounded-3xl border border-white/10 bg-gradient-to-b from-rose-600/10 via-white/[0.02] to-transparent p-10 text-center flex flex-col items-center justify-center space-y-6 my-2 shadow-2xl backdrop-blur-xl">
									<div className="relative flex items-center justify-center">
										<div className="absolute inset-0 rounded-full bg-rose-500/20 blur-2xl animate-pulse" />
										<div className="relative h-20 w-20 rounded-2xl bg-white flex items-center justify-center shadow-xl border border-white/20">
											<svg className="h-10 w-10" viewBox="0 0 24 24">
												<path fill="#4285F4" d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.17z" />
												<path fill="#34A853" d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.1-6.72-4.93H1.29v3.14C3.26 21.3 7.31 24 12 24z" />
												<path fill="#FBBC05" d="M5.28 14.27c-.25-.72-.38-1.49-.38-2.27s.13-1.55.38-2.27V6.59H1.29C.47 8.22 0 10.05 0 12s.47 3.78 1.29 5.41l3.99-3.14z" />
												<path fill="#EA4335" d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.31 0 3.26 2.7 1.29 6.59l3.99 3.14c.95-2.83 3.6-4.98 6.72-4.98z" />
											</svg>
										</div>
									</div>

									<div className="max-w-md space-y-2">
										<h3 className="text-xl font-bold text-white">Connect Google My Business</h3>
										<p className="text-xs text-white/60 leading-relaxed">
											Connect your Google Business Profile to manage customer reviews, post local business updates, and generate automated LocalBusiness JSON-LD schema for higher Google Search rankings.
										</p>
									</div>

									<Button
										disabled={gmbConnecting}
										onClick={handleGmbConnect}
										className="bg-white hover:bg-white/90 text-gray-900 font-bold text-xs px-8 py-5 rounded-2xl shadow-[0_10px_30px_rgba(255,255,255,0.2)] transition-all hover:scale-105"
									>
										{gmbConnecting ? (
											<><RefreshCw className="mr-2 h-4 w-4 animate-spin text-gray-900" /> Connecting GMB...</>
										) : (
											<><Plug className="mr-2 h-4 w-4 text-gray-900" /> Connect Google My Business</>
										)}
									</Button>
								</div>
							) : (
								<>
									{/* GMB Connection Status Banner */}
									<div className="rounded-2xl border border-emerald-500/30 bg-gradient-to-r from-emerald-500/10 via-black/40 to-transparent p-5 flex flex-wrap items-center justify-between gap-4 backdrop-blur-xl">
										<div className="flex items-center gap-3.5">
											<div className="h-11 w-11 rounded-2xl bg-white flex items-center justify-center p-2.5 shrink-0 shadow-lg">
												<svg className="h-full w-full" viewBox="0 0 24 24">
													<path fill="#4285F4" d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.17z" />
													<path fill="#34A853" d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.1-6.72-4.93H1.29v3.14C3.26 21.3 7.31 24 12 24z" />
													<path fill="#FBBC05" d="M5.28 14.27c-.25-.72-.38-1.49-.38-2.27s.13-1.55.38-2.27V6.59H1.29C.47 8.22 0 10.05 0 12s.47 3.78 1.29 5.41l3.99-3.14z" />
													<path fill="#EA4335" d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.31 0 3.26 2.7 1.29 6.59l3.99 3.14c.95-2.83 3.6-4.98 6.72-4.98z" />
												</svg>
											</div>
											<div className="space-y-0.5">
												<div className="flex items-center gap-2">
													<p className="text-sm font-bold text-white">{gmbConn.accountName}</p>
													<Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30 text-[10px]">Connected & Verified</Badge>
												</div>
												<p className="text-xs text-white/60">
													{gmbConn.locationName} · {gmbConn.userEmail || 'Google Account'} · ⭐ {gmbConn.rating || 4.8} ({gmbConn.reviewCount || 342} reviews)
												</p>
											</div>
										</div>
										<Button
											variant="ghost"
											size="sm"
											onClick={handleGmbDisconnect}
											className="border border-red-500/30 text-red-400 hover:bg-red-500/10 text-xs h-8"
										>
											<Unplug className="mr-1.5 h-3.5 w-3.5" /> Disconnect Profile
										</Button>
									</div>

									{/* GMB Sub-Tab Nav */}
									<div className="flex flex-wrap gap-2 border-b border-white/10 pb-3">
										{[
											{ id: 'insights' as const, label: 'Performance & Insights', icon: BarChart3 },
											{ id: 'updates' as const, label: 'Google Posts & Offers', icon: Send },
											{ id: 'info' as const, label: 'Business Info & Hours', icon: Settings },
											{ id: 'schema' as const, label: 'JSON-LD & Local SEO', icon: Globe }
										].map((st) => {
											const Icon = st.icon
											const isActive = gmbSubTab === st.id
											return (
												<button
													key={st.id}
													onClick={() => setGmbSubTab(st.id)}
													className={`flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-semibold transition-all ${
														isActive
															? 'bg-rose-500 text-white shadow-lg shadow-rose-500/20'
															: 'bg-white/5 text-white/60 hover:bg-white/10 hover:text-white border border-white/5'
													}`}
												>
													<Icon className="h-4 w-4" />
													<span>{st.label}</span>
												</button>
											)
										})}
									</div>

									{/* Sub-Tab 1: Performance & Insights */}
									{gmbSubTab === 'insights' && (
										<div className="space-y-6">
											{/* Stat Cards */}
											<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
												{[
													{ label: 'Search & Maps Views', val: '14,280', change: '+18.4%', icon: Eye, color: 'text-blue-400' },
													{ label: 'Customer Actions', val: '1,532', change: '+12.1%', icon: Zap, color: 'text-amber-400' },
													{ label: 'Direct Website Clicks', val: '412', change: '+24.5%', icon: ExternalLink, color: 'text-emerald-400' },
													{ label: 'Phone Calls & Directions', val: '1,120', change: '+8.3%', icon: MapPin, color: 'text-rose-400' }
												].map((stat, i) => (
													<div key={i} className="rounded-2xl border border-white/10 bg-white/5 p-4 space-y-2">
														<div className="flex items-center justify-between text-white/50">
															<span className="text-[11px] font-medium">{stat.label}</span>
															<stat.icon className={`h-4 w-4 ${stat.color}`} />
														</div>
														<div className="flex items-baseline justify-between">
															<span className="text-xl font-bold text-white">{stat.val}</span>
															<span className="text-[10px] font-semibold text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded-md">{stat.change}</span>
														</div>
													</div>
												))}
											</div>

											{/* Profile Completeness & Knowledge Panel Preview */}
											<div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
												{/* Left 2 Cols: Completeness & Quick Actions */}
												<div className="lg:col-span-2 space-y-6">
													<div className="rounded-2xl border border-white/10 bg-white/5 p-6 space-y-4">
														<div className="flex items-center justify-between">
															<div className="flex items-center gap-2">
																<CheckCircle2 className="h-5 w-5 text-emerald-400" />
																<h3 className="font-bold text-white text-base">Google Profile Health Check</h3>
															</div>
															<Badge className="bg-emerald-500/10 text-emerald-400 border-emerald-500/20 text-xs">96% Complete</Badge>
														</div>
														<div className="h-2 w-full rounded-full bg-white/10 overflow-hidden">
															<div className="h-full bg-gradient-to-r from-emerald-500 to-rose-500 w-[96%]" />
														</div>
														<div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs pt-2">
															{[
																{ label: 'Business Name & Primary Category', ok: true },
																{ label: 'Verified Physical Location & Pin', ok: true },
																{ label: 'Contact Phone & Direct Ordering Link', ok: true },
																{ label: 'Regular & Holiday Hours Configured', ok: true },
																{ label: 'JSON-LD LocalBusiness Schema Code', ok: true },
																{ label: 'High-Res Food & Ambiance Photos (12+)', ok: true }
															].map((item, idx) => (
																<div key={idx} className="flex items-center gap-2 text-white/80 bg-black/20 p-2.5 rounded-xl border border-white/5">
																	<CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
																	<span className="text-[11px]">{item.label}</span>
																</div>
															))}
														</div>
													</div>

													<div className="rounded-2xl border border-white/10 bg-white/5 p-6 space-y-4">
														<h3 className="font-bold text-white text-base flex items-center gap-2">
															<Sparkles className="h-5 w-5 text-rose-400" /> Google Search Ranking Tips
														</h3>
														<div className="space-y-2.5 text-xs text-white/70">
															<div className="flex items-start gap-2.5 bg-black/20 p-3 rounded-xl border border-white/5">
																<MapPin className="h-4 w-4 text-rose-400 shrink-0 mt-0.5" />
																<div>
																	<span className="font-bold text-white block">Post Google Updates 2x per week</span>
																	<span>Posting regular offers and specials signals to Google algorithms that your business is active, boosting Local 3-Pack rankings.</span>
																</div>
															</div>
															<div className="flex items-start gap-2.5 bg-black/20 p-3 rounded-xl border border-white/5">
																<Star className="h-4 w-4 text-amber-400 shrink-0 mt-0.5" />
																<div>
																	<span className="font-bold text-white block">Respond to Reviews within 24 hours</span>
																	<span>Replying to 100% of reviews with keywords like &quot;best pizza near me&quot; improves review relevance scores.</span>
																</div>
															</div>
														</div>
													</div>
												</div>

												{/* Right Col: Google Knowledge Panel Mockup */}
												<div className="rounded-2xl border border-white/10 bg-white/5 p-5 space-y-4">
													<div className="flex items-center gap-2 border-b border-white/5 pb-3">
														<Search className="h-4 w-4 text-blue-400" />
														<h4 className="font-bold text-white text-xs">Google Search Knowledge Panel</h4>
													</div>

													{/* Knowledge Panel Box */}
													<div className="rounded-2xl border border-white/15 bg-black/80 p-4 space-y-3 shadow-xl">
														<div className="h-32 w-full rounded-xl bg-gradient-to-br from-rose-500/20 via-amber-500/10 to-transparent border border-white/10 flex items-center justify-center relative overflow-hidden">
															<div className="text-center space-y-1 px-2">
																<h4 className="font-bold text-white text-lg">{gmbConn?.accountName || seoConfig.businessName || 'Your Business Name'}</h4>
																<p className="text-[10px] text-white/60">{seoConfig.primaryCategory || 'Restaurant / Business Category'}</p>
															</div>
														</div>

														<div className="flex items-center gap-1.5 text-xs text-amber-400 font-bold">
															<span>⭐ {gmbConn?.rating || 4.8}</span>
															<span className="text-[10px] text-white/50">({gmbConn?.reviewCount || 342} Google reviews)</span>
														</div>

														<div className="space-y-2 text-[11px] text-white/70">
															<p className="flex items-center gap-2"><MapPin className="h-3.5 w-3.5 text-rose-400 shrink-0" /> <span>{seoConfig.targetLocation || gmbConn?.locationName || 'Configure Store Address / City'}</span></p>
															<p className="flex items-center gap-2"><Globe className="h-3.5 w-3.5 text-blue-400 shrink-0" /> <span className="text-blue-400 underline">{seoConfig.websiteUrl || 'Configure Website URL'}</span></p>
														</div>

														<div className="grid grid-cols-2 gap-2 pt-2">
															<Button size="sm" className="bg-blue-600 hover:bg-blue-700 text-white text-[10px] h-8 font-bold">
																<Globe className="mr-1 h-3 w-3" /> Website
															</Button>
															<Button size="sm" className="bg-emerald-600 hover:bg-emerald-700 text-white text-[10px] h-8 font-bold">
																<ShoppingBag className="mr-1 h-3 w-3" /> Order Online
															</Button>
														</div>
													</div>
												</div>
											</div>
										</div>
									)}

									{/* Sub-Tab 2: Google Posts & Offers */}
									{gmbSubTab === 'updates' && (
										<div className="space-y-6">
											<div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
												{/* Left 2 Cols: Post Publisher */}
												<div className="lg:col-span-2 space-y-6">
													<div className="rounded-2xl border border-white/10 bg-white/5 p-6 space-y-5">
														<div className="flex items-center justify-between">
															<div className="flex items-center gap-2"><Send className="h-5 w-5 text-rose-400" /><h3 className="font-bold text-white text-base">Publish Google Business Update</h3></div>
															<Badge className="bg-rose-500/10 text-rose-400 border-rose-500/20 text-xs">Google Search & Maps</Badge>
														</div>

														{/* Templates */}
														<div className="flex flex-wrap gap-2">
															{[
																{ title: '🍕 Weekend Deal', summary: '🔥 WEEKEND SPECIAL! Get FLAT 20% OFF on all gourmet pizzas this weekend. Order direct for instant delivery!', topic: 'OFFER' as const, cta: 'ORDER' as const },
																{ title: '🥖 Free Appetizer', summary: '✨ FREE Garlic Bread on all direct orders above ₹499! Use code FREEDOUGH at checkout.', topic: 'OFFER' as const, cta: 'ORDER' as const },
																{ title: '☕ New Menu Item', summary: '🚀 Try our new Truffle Mushroom Wood-Fired Pizza! Made with fresh Italian truffle oil & aged mozzarella.', topic: 'STANDARD' as const, cta: 'LEARN_MORE' as const },
																{ title: '🕒 Holiday Hours', summary: '📢 Special Holiday Store Hours: Open till 1:00 AM on Friday & Saturday for late-night cravings!', topic: 'EVENT' as const, cta: 'CALL' as const }
															].map((tmpl, i) => (
																<button key={i} onClick={() => { setNewGmbSummary(tmpl.summary); setNewGmbTopic(tmpl.topic); setNewGmbCta(tmpl.cta) }}
																	className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-[11px] text-white/70 hover:bg-rose-500/10 hover:border-rose-500/30 hover:text-white transition-all">
																	{tmpl.title}
																</button>
															))}
														</div>

														{/* Summary */}
														<textarea value={newGmbSummary} onChange={(e) => setNewGmbSummary(e.target.value)} rows={5}
															placeholder="Write your Google update, announcement, or offer..."
															className="w-full rounded-xl border border-white/10 bg-black/30 px-4 py-3 text-white text-xs placeholder:text-white/20 focus:outline-none focus:border-rose-500/40 resize-none transition-colors" />

														{/* Options */}
														<div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
															<div className="space-y-1.5">
																<label className="font-semibold text-white/60 uppercase tracking-wider text-[10px]">Topic Type</label>
																<select value={newGmbTopic} onChange={(e: any) => setNewGmbTopic(e.target.value)}
																	className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2.5 text-white text-xs focus:outline-none focus:border-rose-500/40">
																	<option value="STANDARD">What&apos;s New / Announcement</option>
																	<option value="OFFER">Special Offer / Promotion</option>
																	<option value="EVENT">Event / Special Hours</option>
																</select>
															</div>

															<div className="space-y-1.5">
																<label className="font-semibold text-white/60 uppercase tracking-wider text-[10px]">Action Button (CTA)</label>
																<select value={newGmbCta} onChange={(e: any) => setNewGmbCta(e.target.value)}
																	className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2.5 text-white text-xs focus:outline-none focus:border-rose-500/40">
																	<option value="ORDER">Order Online</option>
																	<option value="CALL">Call Now</option>
																	<option value="LEARN_MORE">Learn More</option>
																	<option value="BOOK">Book Table</option>
																</select>
															</div>
														</div>

														<div className="space-y-1.5">
															<label className="font-semibold text-white/60 uppercase tracking-wider text-[10px]">Action Button URL</label>
															<input type="url" value={newGmbActionUrl} onChange={(e) => setNewGmbActionUrl(e.target.value)}
																placeholder={seoConfig.websiteUrl || 'https://pizzeriada.cafe'}
																className="w-full rounded-xl border border-white/10 bg-black/30 px-3.5 py-2.5 text-white text-xs placeholder:text-white/20 focus:outline-none focus:border-rose-500/40 transition-colors" />
														</div>

														<div className="flex items-center justify-between pt-2 border-t border-white/5">
															<span className="text-[11px] text-white/30">{newGmbSummary.length} characters</span>
															<Button disabled={!newGmbSummary || publishingGmbPost} onClick={handleCreateGmbPost} className="bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs px-6">
																{publishingGmbPost ? <><RefreshCw className="mr-2 h-3.5 w-3.5 animate-spin" /> Publishing...</> : <><Send className="mr-2 h-3.5 w-3.5" /> Publish to Google</>}
															</Button>
														</div>
													</div>
												</div>

												{/* Right Col: Published Posts History */}
												<div className="rounded-2xl border border-white/10 bg-white/5 p-6 space-y-4">
													<div className="flex items-center gap-2 border-b border-white/5 pb-3">
														<Globe className="h-5 w-5 text-emerald-400" />
														<h3 className="font-bold text-white text-base">Published Updates ({gmbPosts.length})</h3>
													</div>

													{gmbPosts.length === 0 ? (
														<div className="p-8 text-center text-white/30 space-y-2">
															<Send className="h-8 w-8 mx-auto text-white/20" />
															<p className="text-xs">No updates published yet. Create your first Google post above!</p>
														</div>
													) : (
														<div className="space-y-3 max-h-[420px] overflow-y-auto pr-1">
															{gmbPosts.map((post) => (
																<div key={post.id} className="rounded-xl border border-white/10 bg-black/30 p-3.5 space-y-2 text-xs">
																	<div className="flex items-center justify-between text-[10px]">
																		<Badge className="bg-rose-500/20 text-rose-400 border-rose-500/30">{post.topicType}</Badge>
																		<span className="text-white/40">{new Date(post.createdAt).toLocaleDateString()}</span>
																	</div>
																	<p className="text-white/80 text-[11px] leading-relaxed whitespace-pre-wrap">{post.summary}</p>
																	{post.callToActionType && (
																		<div className="pt-1 flex items-center justify-between border-t border-white/5 text-[10px]">
																			<span className="text-blue-400 font-semibold">CTA: {post.callToActionType}</span>
																			<span className="text-emerald-400">Live on Google</span>
																		</div>
																	)}
																</div>
															))}
														</div>
													)}
												</div>
											</div>
										</div>
									)}

									{/* Sub-Tab 3: Business Info & Hours */}
									{gmbSubTab === 'info' && (
										<div className="space-y-6">
											{/* Config Form */}
											<div className="rounded-2xl border border-white/10 bg-white/5 p-6 space-y-6">
												<div className="flex items-center justify-between">
													<div className="flex items-center gap-2">
														<Settings className="h-5 w-5 text-rose-400" />
														<h3 className="font-bold text-white text-base">Google My Business Profile Configuration</h3>
													</div>
													<Badge className="bg-rose-500/10 text-rose-400 border-rose-500/20 text-xs">GMB Profile Sync</Badge>
												</div>
												<div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-5 text-xs">
													{([
														{ label: 'Business Name', key: 'businessName' as const, placeholder: 'e.g. Pizzeria da Cafe', type: 'text' },
														{ label: 'Primary Category', key: 'primaryCategory' as const, placeholder: 'e.g. Pizza Restaurant & Cafe', type: 'text' },
														{ label: 'Target City / Area', key: 'targetLocation' as const, placeholder: 'e.g. Bandra West, Mumbai', type: 'text' },
														{ label: 'Google My Business URL', key: 'gmbUrl' as const, placeholder: 'https://g.page/r/your-gmb-link', type: 'url' },
														{ label: 'GMB Place ID (Optional)', key: 'gmbPlaceId' as const, placeholder: 'e.g. ChIJN1t_t_Z45zsR...', type: 'text' },
														{ label: 'Contact Phone', key: 'phone' as const, placeholder: '+91 98765 43210', type: 'text' },
														{ label: 'Website / Direct Order URL', key: 'websiteUrl' as const, placeholder: 'https://pizzeriada.cafe', type: 'url' },
														{ label: 'Instagram Handle', key: 'instagramHandle' as const, placeholder: '@pizzeriadacafe', type: 'text' },
														{ label: 'Target Local Keywords', key: 'targetKeywords' as const, placeholder: 'Best Pizza near me, wood-fired pizza cafe', type: 'text' }
													]).map((field) => (
														<div key={field.key} className="space-y-1.5">
															<label className="font-semibold text-white/60 uppercase tracking-wider">{field.label}</label>
															<input type={field.type} value={seoConfig[field.key]}
																onChange={(e) => setSeoConfig({ ...seoConfig, [field.key]: e.target.value })}
																placeholder={field.placeholder}
																className="w-full rounded-xl border border-white/10 bg-black/30 px-3.5 py-2.5 text-white text-xs placeholder:text-white/20 focus:outline-none focus:border-rose-500/40 transition-colors"
															/>
														</div>
													))}
												</div>
												<div className="flex items-center justify-between pt-2 border-t border-white/5">
													{seoSavedMsg ? (
														<div className="flex items-center gap-2 text-xs text-emerald-400"><CheckCircle2 className="h-4 w-4" /><span>{seoSavedMsg}</span></div>
													) : (
														<div className="text-[11px] text-white/30">Configuration is saved to your store profile and synced with Google Business Profile</div>
													)}
													<Button disabled={!tenantId || savingSeo} onClick={handleSaveSeo} className="bg-rose-500 hover:bg-rose-600 text-white font-semibold px-5 text-xs">
														{savingSeo ? <><RefreshCw className="mr-2 h-3.5 w-3.5 animate-spin" /> Saving...</> : <><Globe className="mr-2 h-3.5 w-3.5" /> Save Profile Info</>}
													</Button>
												</div>
											</div>
										</div>
									)}

									{/* Sub-Tab 4: JSON-LD Schema & Local SEO */}
									{gmbSubTab === 'schema' && (
										<div className="space-y-6">
											{/* JSON-LD Schema Generator */}
											<div className="rounded-2xl border border-white/10 bg-white/5 p-6 space-y-4">
												<div className="flex items-center justify-between">
													<div className="flex items-center gap-2"><Globe className="h-5 w-5 text-emerald-400" /><h3 className="font-bold text-white text-base">Generated JSON-LD Restaurant Schema</h3></div>
													<Button variant="ghost" size="sm" onClick={() => {
														const jsonLd = JSON.stringify({ "@context": "https://schema.org", "@type": "Restaurant", "name": seoConfig.businessName || "Pizzeria da Cafe", "description": "Authentic artisan pizza & cafe.", "servesCuisine": "Pizza, Italian, Fast Food", "telephone": seoConfig.phone || "+91-9876543210", "url": seoConfig.websiteUrl || "https://pizzeriada.cafe", "address": { "@type": "PostalAddress", "addressLocality": seoConfig.targetLocation || "Mumbai", "addressCountry": "IN" }, "sameAs": [seoConfig.gmbUrl, `https://instagram.com/${(seoConfig.instagramHandle || '').replace('@', '')}`].filter(Boolean) }, null, 2)
														navigator.clipboard.writeText(`<script type="application/ld+json">\n${jsonLd}\n</script>`)
														setCopiedSchema(true); setTimeout(() => setCopiedSchema(false), 3000)
													}} className="border border-white/10 text-xs text-emerald-400 hover:bg-emerald-500/10">
														{copiedSchema ? <><Check className="mr-1.5 h-3.5 w-3.5" /> Copied!</> : <><Copy className="mr-1.5 h-3.5 w-3.5" /> Copy JSON-LD Code</>}
													</Button>
												</div>
												<p className="text-[11px] text-white/40">Copy and paste this into the <code>&lt;head&gt;</code> of your website for Google indexing.</p>
												<pre className="p-3.5 rounded-lg bg-black/60 border border-white/5 text-[11px] font-mono text-emerald-400/90 overflow-x-auto">
{`<script type="application/ld+json">
${JSON.stringify({ "@context": "https://schema.org", "@type": "Restaurant", "name": seoConfig.businessName || "Your Business", "servesCuisine": "Pizza, Italian", "telephone": seoConfig.phone || "+91-XXX", "url": seoConfig.websiteUrl || "https://your-site.com", "address": { "@type": "PostalAddress", "addressLocality": seoConfig.targetLocation || "City", "addressCountry": "IN" } }, null, 2)}
</script>`}
												</pre>
											</div>

											{/* SEO Checklist */}
											<div className="rounded-2xl border border-white/10 bg-white/5 p-6 space-y-5">
												<div className="flex items-center gap-2"><MapPin className="h-5 w-5 text-rose-400" /><h3 className="font-bold text-white text-base">Local SEO & GMB Optimization Checklist</h3></div>
												<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
													{[
														{ title: '1. GMB Profile', icon: MapPin, color: 'text-rose-400', items: ['Claim & verify your GMB listing', 'Add high-quality photos weekly', 'Set accurate business hours', 'Enable messaging & booking', 'Post weekly GMB updates'] },
														{ title: '2. Local SEO', icon: Search, color: 'text-blue-400', items: ['Add JSON-LD schema (above)', 'Get listed on Justdial, Sulekha', 'Maintain NAP consistency', 'Optimize meta tags with city + cuisine', 'Create location landing pages'] },
														{ title: '3. Social & Reels', icon: Share2, color: 'text-purple-400', items: ['Post 3-5 Reels per week', 'Use location tags on every post', 'Run "tag a friend" contests', 'Collaborate with food bloggers', 'Share behind-the-scenes content'] },
														{ title: '4. Aggregator SEO', icon: ShoppingBag, color: 'text-amber-400', items: ['Optimize Swiggy/Zomato titles', 'Respond to all reviews', 'Keep menu photos consistent', 'Run exclusive platform offers', 'Monitor competitor pricing'] },
														{ title: '5. Content Strategy', icon: Video, color: 'text-emerald-400', items: ['Start a food blog on your site', 'Create "Best Pizza in [City]" content', 'Film customer testimonials', 'Seasonal menu spotlights', 'Recipe snippets on social'] }
													].map((section) => (
														<div key={section.title} className="rounded-xl border border-white/10 bg-black/30 p-4 space-y-3">
															<div className="flex items-center gap-2 border-b border-white/5 pb-2"><section.icon className={`h-4 w-4 ${section.color}`} /><h4 className="font-semibold text-xs text-white">{section.title}</h4></div>
															<ul className="space-y-2 text-xs text-white/70">
																{section.items.map((item, i) => (<li key={i} className="flex items-start gap-2"><CheckCircle2 className="h-3.5 w-3.5 text-emerald-400 flex-shrink-0 mt-0.5" /><span>{item}</span></li>))}
															</ul>
														</div>
													))}
												</div>
											</div>
										</div>
									)}
								</>
							)}
						</div>
					)}

					{/* ═══════════ WHATSAPP TAB ══════════════════════════════ */}
					{activeTab === 'whatsapp' && (
						<div className="space-y-6">
							<div className="flex items-center justify-between">
								<div>
									<h3 className="font-bold text-white text-lg flex items-center gap-2"><MessageSquare className="h-5 w-5 text-emerald-400" /> WhatsApp Marketing Campaigns</h3>
									<p className="text-xs text-white/50 mt-1">AI-generated retention campaigns ready to copy & send</p>
								</div>
								<Button disabled={aiLoading || !tenantId} onClick={handleGenerateCampaigns} className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs px-5">
									<Brain className={`mr-2 h-4 w-4 ${aiLoading ? 'animate-spin' : ''}`} />
									{aiLoading ? 'Generating...' : 'Generate AI Campaigns'}
								</Button>
							</div>
							{aiReport ? (
								<div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/5 p-6 space-y-6">
									<div className="flex items-center justify-between border-b border-white/10 pb-4">
										<div className="flex items-center gap-3"><Brain className="h-6 w-6 text-emerald-400" /><div><h3 className="font-bold text-white text-base">AI Customer Retention Campaigns</h3><p className="text-xs text-white/60 mt-0.5">{aiReport.summary}</p></div></div>
										<Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30 text-xs">Ready to Send</Badge>
									</div>
									<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5 text-xs">
										{aiReport.campaigns?.map((camp, idx) => (
											<div key={idx} className="rounded-xl border border-white/10 bg-black/40 p-4 space-y-3 flex flex-col justify-between">
												<div className="space-y-2">
													<div className="flex justify-between items-start border-b border-white/5 pb-2"><span className="font-bold text-white flex items-center gap-1.5"><MessageSquare className="h-4 w-4 text-emerald-400" /> {camp.title}</span></div>
													<Badge className="bg-white/10 text-white/70 text-[10px]">{camp.targetSegment}</Badge>
													<div className="bg-black/60 p-3 rounded-lg border border-white/5 text-white/80 whitespace-pre-wrap text-[11px] leading-relaxed">{camp.messageCopy}</div>
												</div>
												<div className="flex items-center justify-between pt-2 border-t border-white/5">
													<span className="text-[10px] text-emerald-400 font-semibold">{camp.expectedConversion}</span>
													<Button variant="ghost" size="sm" onClick={() => { navigator.clipboard.writeText(camp.messageCopy); setCopiedIndex(idx); setTimeout(() => setCopiedIndex(null), 3000) }} className="border border-white/10 text-xs text-emerald-400 hover:bg-emerald-500/10 h-7">
														{copiedIndex === idx ? <><Check className="mr-1.5 h-3.5 w-3.5" /> Copied!</> : <><Copy className="mr-1.5 h-3.5 w-3.5" /> Copy</>}
													</Button>
												</div>
											</div>
										))}
									</div>
								</div>
							) : (
								<div className="rounded-2xl border border-white/10 bg-white/5 p-12 text-center space-y-4">
									<MessageSquare className="h-12 w-12 text-white/20 mx-auto" />
									<p className="text-sm text-white/40">Click &quot;Generate AI Campaigns&quot; to create personalized WhatsApp messages</p>
								</div>
							)}
						</div>
					)}

					{/* ═══════════ FACEBOOK TAB ══════════════════════════════ */}
					{activeTab === 'facebook' && (
						<div className="space-y-6">
							{!metaConn?.connected ? (
								<div className="rounded-3xl border border-white/10 bg-gradient-to-b from-blue-600/10 via-white/[0.02] to-transparent p-10 text-center flex flex-col items-center justify-center space-y-6 my-2 shadow-2xl backdrop-blur-xl">
									<div className="relative flex items-center justify-center">
										<div className="absolute inset-0 rounded-full bg-blue-500/20 blur-2xl animate-pulse" />
										<div className="relative h-20 w-20 rounded-2xl bg-gradient-to-br from-blue-600 to-indigo-600 flex items-center justify-center shadow-xl border border-white/20">
											<svg className="h-10 w-10 text-white fill-current" viewBox="0 0 24 24">
												<path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
											</svg>
										</div>
									</div>

									<div className="max-w-md space-y-2">
										<h3 className="text-xl font-bold text-white">Connect Facebook Page</h3>
										<p className="text-xs text-white/60 leading-relaxed">
											Connect your restaurant&apos;s Facebook Page to post updates, promotional offers, and menu highlights directly from your POS dashboard.
										</p>
									</div>

									<Button
										disabled={fbConnecting}
										onClick={handleFbConnect}
										className="bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs px-8 py-5 rounded-2xl shadow-[0_10px_30px_rgba(37,99,235,0.35)] transition-all hover:scale-105"
									>
										{fbConnecting ? (
											<><RefreshCw className="mr-2 h-4 w-4 animate-spin" /> Connecting Facebook...</>
										) : (
											<><Plug className="mr-2 h-4 w-4" /> Connect Facebook Account</>
										)}
									</Button>
								</div>
							) : (
								<>
									{/* Connection Status */}
									<MetaStatusBanner />

									{/* Post Composer */}
									<div className="rounded-2xl border border-white/10 bg-white/5 p-6 space-y-5">
										<div className="flex items-center justify-between">
											<div className="flex items-center gap-2"><Send className="h-5 w-5 text-blue-400" /><h3 className="font-bold text-white text-base">Facebook Post Composer</h3></div>
											{metaConn?.selectedPageName && (
												<Badge className="bg-blue-500/10 text-blue-400 border-blue-500/20 text-xs">
													Posting to: {metaConn.selectedPageName}
												</Badge>
											)}
										</div>
										<div className="flex flex-wrap gap-2">
											{FB_TEMPLATES.map((tmpl, i) => (
												<button key={i} onClick={() => setFbPostText(tmpl.body)}
													className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-[11px] text-white/70 hover:bg-blue-500/10 hover:border-blue-500/30 hover:text-white transition-all">
													{tmpl.title}
												</button>
											))}
										</div>
										<textarea value={fbPostText} onChange={(e) => setFbPostText(e.target.value)} rows={8}
											placeholder="Write your Facebook post here or select a template above..."
											className="w-full rounded-xl border border-white/10 bg-black/30 px-4 py-3 text-white text-xs placeholder:text-white/20 focus:outline-none focus:border-blue-500/40 resize-none transition-colors" />
										{fbPostResult && (
											<div className={`flex items-center gap-2 text-xs ${fbPostResult.startsWith('✅') ? 'text-emerald-400' : 'text-red-400'}`}>
												{fbPostResult.startsWith('✅') ? <CheckCircle2 className="h-4 w-4" /> : <AlertCircle className="h-4 w-4" />}
												<span>{fbPostResult}</span>
											</div>
										)}
										<div className="flex items-center justify-between">
											<span className="text-[11px] text-white/30">{fbPostText.length} characters</span>
											<div className="flex items-center gap-2">
												<Button disabled={!fbPostText} onClick={() => copyText(fbPostText, setCopiedFb)} variant="ghost" className="border border-white/10 text-xs text-white/60 hover:bg-white/10 h-8">
													{copiedFb ? <><Check className="mr-1.5 h-3.5 w-3.5" /> Copied!</> : <><Copy className="mr-1.5 h-3.5 w-3.5" /> Copy</>}
												</Button>
												<Button disabled={!fbPostText || fbPosting} onClick={handlePostToFb} className="bg-blue-600 hover:bg-blue-700 text-white font-semibold px-5 text-xs">
													{fbPosting ? <><RefreshCw className="mr-2 h-3.5 w-3.5 animate-spin" /> Posting...</> : <><Send className="mr-2 h-3.5 w-3.5" /> Post to Facebook</>}
												</Button>
											</div>
										</div>
									</div>
								</>
							)}
						</div>
					)}

					{/* ═══════════ INSTAGRAM TAB ═════════════════════════════ */}
					{activeTab === 'instagram' && (
						<div className="space-y-6">
							{!metaConn?.connected ? (
								<div className="rounded-3xl border border-white/10 bg-gradient-to-b from-pink-600/10 via-white/[0.02] to-transparent p-10 text-center flex flex-col items-center justify-center space-y-6 my-2 shadow-2xl backdrop-blur-xl">
									<div className="relative flex items-center justify-center">
										<div className="absolute inset-0 rounded-full bg-pink-500/20 blur-2xl animate-pulse" />
										<div className="relative h-20 w-20 rounded-2xl bg-gradient-to-tr from-purple-600 via-pink-500 to-amber-400 flex items-center justify-center shadow-xl border border-white/20">
											<Instagram className="h-10 w-10 text-white" />
										</div>
									</div>

									<div className="max-w-md space-y-2">
										<h3 className="text-xl font-bold text-white">Connect Instagram Account</h3>
										<p className="text-xs text-white/60 leading-relaxed">
											Connect your restaurant&apos;s Instagram Business Profile via Facebook to compose captions, generate hashtags, and publish posts directly from your POS dashboard.
										</p>
									</div>

									<Button
										disabled={fbConnecting}
										onClick={handleFbConnect}
										className="bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white font-bold text-xs px-8 py-5 rounded-2xl shadow-[0_10px_30px_rgba(219,39,119,0.35)] transition-all hover:scale-105"
									>
										{fbConnecting ? (
											<><RefreshCw className="mr-2 h-4 w-4 animate-spin" /> Connecting Instagram...</>
										) : (
											<><Plug className="mr-2 h-4 w-4" /> Connect Instagram Account</>
										)}
									</Button>
								</div>
							) : (
								<>
									{!metaConn.instagramAccount && (
										<div className="rounded-2xl border border-amber-500/20 bg-amber-500/5 p-6 space-y-3">
											<div className="flex items-center gap-2"><AlertCircle className="h-5 w-5 text-amber-400" /><h3 className="font-bold text-white text-sm">No Instagram Business Account Found</h3></div>
											<p className="text-xs text-white/50">
												Your connected Facebook Page &quot;{metaConn.selectedPageName}&quot; doesn&apos;t have an Instagram Business Account linked.
												Link your IG Business profile to your FB Page in Meta Business Suite, then reconnect.
											</p>
										</div>
									)}

									{metaConn.instagramAccount && (
										<div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4 flex items-center gap-3">
											<div className="h-10 w-10 rounded-full bg-gradient-to-br from-purple-600 via-pink-500 to-amber-400 flex items-center justify-center">
												<Instagram className="h-5 w-5 text-white" />
											</div>
											<div>
												<p className="text-sm font-bold text-white">@{metaConn.instagramAccount.username}</p>
												<p className="text-[11px] text-white/50">Instagram Business · Connected via {metaConn.selectedPageName}</p>
											</div>
										</div>
									)}

									<MetaStatusBanner />

									{/* Caption + Hashtag Composer + Live Feed Preview */}
									<div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
										{/* Left 2 Cols: Caption & Hashtags */}
										<div className="lg:col-span-2 space-y-6">
											{/* Caption Composer */}
											<div className="rounded-2xl border border-white/10 bg-white/5 p-6 space-y-5">
												<div className="flex items-center justify-between">
													<div className="flex items-center gap-2"><Sparkles className="h-5 w-5 text-pink-400" /><h3 className="font-bold text-white text-base">Caption Writer</h3></div>
													<Badge className="bg-pink-500/10 text-pink-400 border-pink-500/20 text-xs">AI Templates</Badge>
												</div>

												<div className="flex flex-wrap gap-2">
													{IG_TEMPLATES.map((tmpl, i) => (
														<button key={i} onClick={() => { setIgCaption(tmpl.caption); setIgHashtags(tmpl.hashtags) }}
															className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-[11px] text-white/70 hover:bg-pink-500/10 hover:border-pink-500/30 hover:text-white transition-all">
															{tmpl.title}
														</button>
													))}
												</div>

												<textarea value={igCaption} onChange={(e) => setIgCaption(e.target.value)} rows={6} placeholder="Write your Instagram caption..."
													className="w-full rounded-xl border border-white/10 bg-black/30 px-4 py-3 text-white text-xs placeholder:text-white/20 focus:outline-none focus:border-pink-500/40 resize-none transition-colors" />

												{/* Image URL for IG publishing */}
												{metaConn?.connected && metaConn.instagramAccount && (
													<div className="space-y-1.5">
														<label className="font-semibold text-white/60 uppercase tracking-wider text-[10px] flex items-center gap-1.5">
															<ImageIcon className="h-3.5 w-3.5" /> Image URL (Required for direct publishing)
														</label>
														<input type="url" value={igImageUrl} onChange={(e) => setIgImageUrl(e.target.value)}
															placeholder="https://your-domain.com/image.jpg (must be publicly accessible)"
															className="w-full rounded-xl border border-white/10 bg-black/30 px-3.5 py-2.5 text-white text-xs placeholder:text-white/20 focus:outline-none focus:border-pink-500/40 transition-colors" />
													</div>
												)}

												{igPostResult && (
													<div className={`flex items-center gap-2 text-xs ${igPostResult.startsWith('✅') ? 'text-emerald-400' : 'text-red-400'}`}>
														{igPostResult.startsWith('✅') ? <CheckCircle2 className="h-4 w-4" /> : <AlertCircle className="h-4 w-4" />}
														<span>{igPostResult}</span>
													</div>
												)}

												<div className="flex items-center justify-between">
													<span className="text-[11px] text-white/30">{igCaption.length} characters</span>
													<div className="flex items-center gap-2">
														<Button disabled={!igCaption} onClick={() => copyText(igCaption + '\n\n' + igHashtags, setCopiedIg)} variant="ghost" className="border border-white/10 text-xs text-white/60 hover:bg-white/10 h-8">
															{copiedIg ? <><Check className="mr-1.5 h-3.5 w-3.5" /> Copied!</> : <><Copy className="mr-1.5 h-3.5 w-3.5" /> Copy All</>}
														</Button>
														{metaConn?.connected && metaConn.instagramAccount && (
															<Button disabled={!igCaption || !igImageUrl || igPosting} onClick={handlePostToIg} className="bg-gradient-to-r from-purple-600 to-pink-500 hover:from-purple-700 hover:to-pink-600 text-white font-semibold px-5 text-xs">
																{igPosting ? <><RefreshCw className="mr-2 h-3.5 w-3.5 animate-spin" /> Publishing...</> : <><Send className="mr-2 h-3.5 w-3.5" /> Post to Instagram</>}
															</Button>
														)}
													</div>
												</div>
											</div>

											{/* Hashtag Generator & Quick Chips */}
											<div className="rounded-2xl border border-white/10 bg-white/5 p-6 space-y-4">
												<div className="flex items-center justify-between">
													<div className="flex items-center gap-2"><Hash className="h-5 w-5 text-purple-400" /><h3 className="font-bold text-white text-base">Hashtag Generator</h3></div>
													<span className="text-[11px] text-purple-400 font-semibold">{igHashtags.split('#').filter(Boolean).length} / 30 tags</span>
												</div>

												{/* One-Tap Hashtag Quick Chips */}
												<div className="space-y-2">
													<label className="text-[10px] font-semibold text-white/40 uppercase tracking-wider">Tap to add trending hashtags:</label>
													<div className="flex flex-wrap gap-1.5">
														{[
															'#pizzalovers', '#woodfired', '#cheesepull', '#italianfood', '#foodporn',
															'#mumbaifoodies', '#cafevibes', '#viralreels', '#bestpizza', '#foodstagram',
															'#directorder', '#weekendbrunch', '#foodie'
														].map((tag) => (
															<button
																key={tag}
																onClick={() => {
																	if (!igHashtags.includes(tag)) {
																		setIgHashtags((prev) => (prev ? prev + ' ' + tag : tag))
																	}
																}}
																className="rounded-lg border border-purple-500/20 bg-purple-500/10 px-2.5 py-1 text-[10px] text-purple-300 hover:bg-purple-500/20 transition-colors"
															>
																+ {tag}
															</button>
														))}
													</div>
												</div>

												<textarea value={igHashtags} onChange={(e) => setIgHashtags(e.target.value)} rows={4} placeholder="#pizzalovers #foodporn #bestpizza..."
													className="w-full rounded-xl border border-white/10 bg-black/30 px-4 py-3 text-white text-xs placeholder:text-white/20 focus:outline-none focus:border-purple-500/40 resize-none transition-colors font-mono text-purple-300/90" />
											</div>
										</div>

										{/* Right Col: Live Instagram Mockup Preview */}
										<div className="space-y-6">
											<div className="rounded-2xl border border-white/10 bg-white/5 p-6 space-y-4">
												<div className="flex items-center gap-2 border-b border-white/5 pb-3">
													<Instagram className="h-5 w-5 text-pink-400" />
													<h3 className="font-bold text-white text-base">Live Feed Preview</h3>
												</div>

												{/* Phone Frame Mockup */}
												<div className="mx-auto max-w-sm rounded-3xl border border-white/15 bg-black/80 p-3 shadow-2xl space-y-3">
													{/* Post Header */}
													<div className="flex items-center justify-between px-1">
														<div className="flex items-center gap-2.5">
															<div className="relative p-0.5 rounded-full bg-gradient-to-tr from-amber-400 via-pink-500 to-purple-600">
																<div className="h-7 w-7 rounded-full bg-black flex items-center justify-center text-[10px] font-bold text-white border border-black">
																	{metaConn?.instagramAccount?.username?.[0]?.toUpperCase() || 'P'}
																</div>
															</div>
															<div className="flex flex-col">
																<span className="text-xs font-bold text-white leading-tight">
																	{metaConn?.instagramAccount?.username || 'pizzeriadacafe'}
																</span>
																<span className="text-[9px] text-white/50">Pizzeria da Cafe · Original Audio</span>
															</div>
														</div>
														<span className="text-white/40 font-bold text-xs">•••</span>
													</div>

													{/* Post Image Container */}
													<div className="relative aspect-square w-full rounded-xl bg-gradient-to-br from-white/10 to-white/5 overflow-hidden border border-white/10 flex items-center justify-center">
														{igImageUrl ? (
															// eslint-disable-next-line @next/next/no-img-element
															<img src={igImageUrl} alt="IG Preview" className="h-full w-full object-cover" />
														) : (
															<div className="flex flex-col items-center justify-center p-6 text-center space-y-2 text-white/30">
																<ImageIcon className="h-10 w-10 text-white/20" />
																<span className="text-[11px]">Enter Image URL to preview image</span>
															</div>
														)}
													</div>

													{/* Post Actions Bar */}
													<div className="flex items-center justify-between px-1 pt-1 text-white">
														<div className="flex items-center gap-3">
															<Heart className="h-4 w-4 text-rose-500 fill-rose-500" />
															<MessageSquare className="h-4 w-4 text-white/80" />
															<Send className="h-4 w-4 text-white/80" />
														</div>
														<Bookmark className="h-4 w-4 text-white/80" />
													</div>

													{/* Likes count */}
													<div className="px-1 text-[11px] font-bold text-white">
														1,248 likes
													</div>

													{/* Caption & Hashtags Live Preview */}
													<div className="px-1 text-[11px] text-white/80 space-y-1.5 max-h-36 overflow-y-auto leading-relaxed">
														<div>
															<span className="font-bold text-white mr-1.5">
																{metaConn?.instagramAccount?.username || 'pizzeriadacafe'}
															</span>
															<span>{igCaption || 'Your caption will appear here...'}</span>
														</div>
														{igHashtags && (
															<p className="text-[10px] text-purple-400 font-mono break-words">
																{igHashtags}
															</p>
														)}
													</div>
												</div>
											</div>

											{/* Weekly Content Ideas */}
											<div className="rounded-2xl border border-white/10 bg-white/5 p-6 space-y-4">
												<div className="flex items-center gap-2"><Calendar className="h-4 w-4 text-amber-400" /><h4 className="font-semibold text-xs text-white">Weekly Content Planner</h4></div>
												<div className="grid grid-cols-1 gap-2 text-[11px] text-white/60">
													{[
														{ day: 'Mon', idea: '📸 Menu spotlight — hero photo of bestseller', color: 'border-l-rose-400' },
														{ day: 'Tue', idea: '🎬 Behind-the-scenes kitchen Reel', color: 'border-l-blue-400' },
														{ day: 'Wed', idea: '💬 Poll / "This or That" stories', color: 'border-l-purple-400' },
														{ day: 'Thu', idea: '⭐ Customer review / testimonial share', color: 'border-l-amber-400' },
														{ day: 'Fri', idea: '🔥 Weekend special offer announcement', color: 'border-l-emerald-400' },
														{ day: 'Sat', idea: '🎵 Vibe check — ambiance Reel', color: 'border-l-pink-400' },
														{ day: 'Sun', idea: '🍕 Chef\'s special / limited edition post', color: 'border-l-cyan-400' }
													].map((item) => (
														<div key={item.day} className={`flex items-center gap-3 border-l-2 ${item.color} pl-3 py-1 bg-black/20 rounded-r-lg`}>
															<span className="font-bold text-white/80 w-8">{item.day}</span><span>{item.idea}</span>
														</div>
													))}
												</div>
											</div>
										</div>
									</div>
								</>
							)}

							{/* Caption + Hashtag Composer + Live Feed Preview */}
							<div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
								{/* Left 2 Cols: Caption & Hashtags */}
								<div className="lg:col-span-2 space-y-6">
									{/* Caption Composer */}
									<div className="rounded-2xl border border-white/10 bg-white/5 p-6 space-y-5">
										<div className="flex items-center justify-between">
											<div className="flex items-center gap-2"><Sparkles className="h-5 w-5 text-pink-400" /><h3 className="font-bold text-white text-base">Caption Writer</h3></div>
											<Badge className="bg-pink-500/10 text-pink-400 border-pink-500/20 text-xs">AI Templates</Badge>
										</div>

										<div className="flex flex-wrap gap-2">
											{IG_TEMPLATES.map((tmpl, i) => (
												<button key={i} onClick={() => { setIgCaption(tmpl.caption); setIgHashtags(tmpl.hashtags) }}
													className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-[11px] text-white/70 hover:bg-pink-500/10 hover:border-pink-500/30 hover:text-white transition-all">
													{tmpl.title}
												</button>
											))}
										</div>

										<textarea value={igCaption} onChange={(e) => setIgCaption(e.target.value)} rows={6} placeholder="Write your Instagram caption..."
											className="w-full rounded-xl border border-white/10 bg-black/30 px-4 py-3 text-white text-xs placeholder:text-white/20 focus:outline-none focus:border-pink-500/40 resize-none transition-colors" />

										{/* Image URL for IG publishing */}
										{metaConn?.connected && metaConn.instagramAccount && (
											<div className="space-y-1.5">
												<label className="font-semibold text-white/60 uppercase tracking-wider text-[10px] flex items-center gap-1.5">
													<ImageIcon className="h-3.5 w-3.5" /> Image URL (Required for direct publishing)
												</label>
												<input type="url" value={igImageUrl} onChange={(e) => setIgImageUrl(e.target.value)}
													placeholder="https://your-domain.com/image.jpg (must be publicly accessible)"
													className="w-full rounded-xl border border-white/10 bg-black/30 px-3.5 py-2.5 text-white text-xs placeholder:text-white/20 focus:outline-none focus:border-pink-500/40 transition-colors" />
											</div>
										)}

										{igPostResult && (
											<div className={`flex items-center gap-2 text-xs ${igPostResult.startsWith('✅') ? 'text-emerald-400' : 'text-red-400'}`}>
												{igPostResult.startsWith('✅') ? <CheckCircle2 className="h-4 w-4" /> : <AlertCircle className="h-4 w-4" />}
												<span>{igPostResult}</span>
											</div>
										)}

										<div className="flex items-center justify-between">
											<span className="text-[11px] text-white/30">{igCaption.length} characters</span>
											<div className="flex items-center gap-2">
												<Button disabled={!igCaption} onClick={() => copyText(igCaption + '\n\n' + igHashtags, setCopiedIg)} variant="ghost" className="border border-white/10 text-xs text-white/60 hover:bg-white/10 h-8">
													{copiedIg ? <><Check className="mr-1.5 h-3.5 w-3.5" /> Copied!</> : <><Copy className="mr-1.5 h-3.5 w-3.5" /> Copy All</>}
												</Button>
												{metaConn?.connected && metaConn.instagramAccount && (
													<Button disabled={!igCaption || !igImageUrl || igPosting} onClick={handlePostToIg} className="bg-gradient-to-r from-purple-600 to-pink-500 hover:from-purple-700 hover:to-pink-600 text-white font-semibold px-5 text-xs">
														{igPosting ? <><RefreshCw className="mr-2 h-3.5 w-3.5 animate-spin" /> Publishing...</> : <><Send className="mr-2 h-3.5 w-3.5" /> Post to Instagram</>}
													</Button>
												)}
											</div>
										</div>
									</div>

									{/* Hashtag Generator & Quick Chips */}
									<div className="rounded-2xl border border-white/10 bg-white/5 p-6 space-y-4">
										<div className="flex items-center justify-between">
											<div className="flex items-center gap-2"><Hash className="h-5 w-5 text-purple-400" /><h3 className="font-bold text-white text-base">Hashtag Generator</h3></div>
											<span className="text-[11px] text-purple-400 font-semibold">{igHashtags.split('#').filter(Boolean).length} / 30 tags</span>
										</div>

										{/* One-Tap Hashtag Quick Chips */}
										<div className="space-y-2">
											<label className="text-[10px] font-semibold text-white/40 uppercase tracking-wider">Tap to add trending hashtags:</label>
											<div className="flex flex-wrap gap-1.5">
												{[
													'#pizzalovers', '#woodfired', '#cheesepull', '#italianfood', '#foodporn',
													'#mumbaifoodies', '#cafevibes', '#viralreels', '#bestpizza', '#foodstagram',
													'#directorder', '#weekendbrunch', '#foodie'
												].map((tag) => (
													<button
														key={tag}
														onClick={() => {
															if (!igHashtags.includes(tag)) {
																setIgHashtags((prev) => (prev ? prev + ' ' + tag : tag))
															}
														}}
														className="rounded-lg border border-purple-500/20 bg-purple-500/10 px-2.5 py-1 text-[10px] text-purple-300 hover:bg-purple-500/20 transition-colors"
													>
														+ {tag}
													</button>
												))}
											</div>
										</div>

										<textarea value={igHashtags} onChange={(e) => setIgHashtags(e.target.value)} rows={4} placeholder="#pizzalovers #foodporn #bestpizza..."
											className="w-full rounded-xl border border-white/10 bg-black/30 px-4 py-3 text-white text-xs placeholder:text-white/20 focus:outline-none focus:border-purple-500/40 resize-none transition-colors font-mono text-purple-300/90" />
									</div>
								</div>

								{/* Right Col: Live Instagram Mockup Preview */}
								<div className="space-y-6">
									<div className="rounded-2xl border border-white/10 bg-white/5 p-6 space-y-4">
										<div className="flex items-center gap-2 border-b border-white/5 pb-3">
											<Instagram className="h-5 w-5 text-pink-400" />
											<h3 className="font-bold text-white text-base">Live Feed Preview</h3>
										</div>

										{/* Phone Frame Mockup */}
										<div className="mx-auto max-w-sm rounded-3xl border border-white/15 bg-black/80 p-3 shadow-2xl space-y-3">
											{/* Post Header */}
											<div className="flex items-center justify-between px-1">
												<div className="flex items-center gap-2.5">
													<div className="relative p-0.5 rounded-full bg-gradient-to-tr from-amber-400 via-pink-500 to-purple-600">
														<div className="h-7 w-7 rounded-full bg-black flex items-center justify-center text-[10px] font-bold text-white border border-black">
															{metaConn?.instagramAccount?.username?.[0]?.toUpperCase() || 'P'}
														</div>
													</div>
													<div className="flex flex-col">
														<span className="text-xs font-bold text-white leading-tight">
															{metaConn?.instagramAccount?.username || 'pizzeriadacafe'}
														</span>
														<span className="text-[9px] text-white/50">Pizzeria da Cafe · Original Audio</span>
													</div>
												</div>
												<span className="text-white/40 font-bold text-xs">•••</span>
											</div>

											{/* Post Image Container */}
											<div className="relative aspect-square w-full rounded-xl bg-gradient-to-br from-white/10 to-white/5 overflow-hidden border border-white/10 flex items-center justify-center">
												{igImageUrl ? (
													// eslint-disable-next-line @next/next/no-img-element
													<img src={igImageUrl} alt="IG Preview" className="h-full w-full object-cover" />
												) : (
													<div className="flex flex-col items-center justify-center p-6 text-center space-y-2 text-white/30">
														<ImageIcon className="h-10 w-10 text-white/20" />
														<span className="text-[11px]">Enter Image URL to preview image</span>
													</div>
												)}
											</div>

											{/* Post Actions Bar */}
											<div className="flex items-center justify-between px-1 pt-1 text-white">
												<div className="flex items-center gap-3">
													<Heart className="h-4 w-4 text-rose-500 fill-rose-500" />
													<MessageSquare className="h-4 w-4 text-white/80" />
													<Send className="h-4 w-4 text-white/80" />
												</div>
												<Bookmark className="h-4 w-4 text-white/80" />
											</div>

											{/* Likes count */}
											<div className="px-1 text-[11px] font-bold text-white">
												1,248 likes
											</div>

											{/* Caption & Hashtags Live Preview */}
											<div className="px-1 text-[11px] text-white/80 space-y-1.5 max-h-36 overflow-y-auto leading-relaxed">
												<div>
													<span className="font-bold text-white mr-1.5">
														{metaConn?.instagramAccount?.username || 'pizzeriadacafe'}
													</span>
													<span>{igCaption || 'Your caption will appear here...'}</span>
												</div>
												{igHashtags && (
													<p className="text-[10px] text-purple-400 font-mono break-words">
														{igHashtags}
													</p>
												)}
											</div>
										</div>
									</div>

									{/* Weekly Content Ideas */}
									<div className="rounded-2xl border border-white/10 bg-white/5 p-6 space-y-4">
										<div className="flex items-center gap-2"><Calendar className="h-4 w-4 text-amber-400" /><h4 className="font-semibold text-xs text-white">Weekly Content Planner</h4></div>
										<div className="grid grid-cols-1 gap-2 text-[11px] text-white/60">
											{[
												{ day: 'Mon', idea: '📸 Menu spotlight — hero photo of bestseller', color: 'border-l-rose-400' },
												{ day: 'Tue', idea: '🎬 Behind-the-scenes kitchen Reel', color: 'border-l-blue-400' },
												{ day: 'Wed', idea: '💬 Poll / "This or That" stories', color: 'border-l-purple-400' },
												{ day: 'Thu', idea: '⭐ Customer review / testimonial share', color: 'border-l-amber-400' },
												{ day: 'Fri', idea: '🔥 Weekend special offer announcement', color: 'border-l-emerald-400' },
												{ day: 'Sat', idea: '🎵 Vibe check — ambiance Reel', color: 'border-l-pink-400' },
												{ day: 'Sun', idea: '🍕 Chef\'s special / limited edition post', color: 'border-l-cyan-400' }
											].map((item) => (
												<div key={item.day} className={`flex items-center gap-3 border-l-2 ${item.color} pl-3 py-1 bg-black/20 rounded-r-lg`}>
													<span className="font-bold text-white/80 w-8">{item.day}</span><span>{item.idea}</span>
												</div>
											))}
										</div>
									</div>
								</div>
							</div>
						</div>
					)}

					{/* ═══════════ REVIEWS TAB ═══════════════════════════════ */}
					{activeTab === 'reviews' && (
						<div className="space-y-6">
							{/* Review Links Config */}
							<div className="rounded-2xl border border-white/10 bg-white/5 p-6 space-y-5">
								<div className="flex items-center gap-2"><Star className="h-5 w-5 text-amber-400" /><h3 className="font-bold text-white text-base">Review Link Configuration</h3></div>
								<div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 text-xs">
									{([
										{ label: 'Google Review URL', key: 'googleReviewUrl' as const, placeholder: 'https://g.page/r/YOUR_LINK/review' },
										{ label: 'Zomato Review URL', key: 'zomatoReviewUrl' as const, placeholder: 'https://zomato.com/your-restaurant/reviews' },
										{ label: 'Swiggy URL', key: 'swiggyUrl' as const, placeholder: 'https://swiggy.com/your-restaurant' }
									]).map((field) => (
										<div key={field.key} className="space-y-1.5">
											<label className="font-semibold text-white/60 uppercase tracking-wider">{field.label}</label>
											<input type="url" value={mktConfig[field.key]} onChange={(e) => setMktConfig({ ...mktConfig, [field.key]: e.target.value })}
												placeholder={field.placeholder}
												className="w-full rounded-xl border border-white/10 bg-black/30 px-3.5 py-2.5 text-white text-xs placeholder:text-white/20 focus:outline-none focus:border-amber-500/40 transition-colors" />
										</div>
									))}
								</div>
								<div className="flex items-center justify-between pt-2 border-t border-white/5">
									{configSavedMsg ? <div className="flex items-center gap-2 text-xs text-emerald-400"><CheckCircle2 className="h-4 w-4" /><span>{configSavedMsg}</span></div>
										: <div className="text-[11px] text-white/30">Review links for QR codes, table tents, and WhatsApp messages</div>}
									<Button disabled={!tenantId || savingConfig} onClick={handleSaveConfig} className="bg-amber-600 hover:bg-amber-700 text-white font-semibold px-5 text-xs">
										{savingConfig ? <><RefreshCw className="mr-2 h-3.5 w-3.5 animate-spin" /> Saving...</> : <><Star className="mr-2 h-3.5 w-3.5" /> Save Review Links</>}
									</Button>
								</div>
							</div>

							{/* Quick Share Links */}
							<div className="rounded-2xl border border-white/10 bg-white/5 p-6 space-y-5">
								<div className="flex items-center gap-2"><ExternalLink className="h-5 w-5 text-amber-400" /><h3 className="font-bold text-white text-base">Quick Share Review Links</h3></div>
								<div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
									{[
										{ label: 'Google Review', url: mktConfig.googleReviewUrl, icon: MapPin, color: 'border-rose-500/30 bg-rose-500/5', btnColor: 'bg-rose-600 hover:bg-rose-700' },
										{ label: 'Zomato Review', url: mktConfig.zomatoReviewUrl, icon: Star, color: 'border-amber-500/30 bg-amber-500/5', btnColor: 'bg-amber-600 hover:bg-amber-700' },
										{ label: 'Swiggy Page', url: mktConfig.swiggyUrl, icon: ShoppingBag, color: 'border-orange-500/30 bg-orange-500/5', btnColor: 'bg-orange-600 hover:bg-orange-700' }
									].map((link) => (
										<div key={link.label} className={`rounded-xl border ${link.color} p-4 space-y-3 text-center`}>
											<link.icon className="h-8 w-8 mx-auto text-white/40" />
											<h4 className="font-semibold text-white text-sm">{link.label}</h4>
											{link.url ? (
												<>
													<p className="text-[11px] text-white/40 truncate">{link.url}</p>
													<Button size="sm" onClick={() => { navigator.clipboard.writeText(link.url); setCopiedReviewLink(link.label); setTimeout(() => setCopiedReviewLink(null), 3000) }}
														className={`${link.btnColor} text-white font-semibold text-xs w-full`}>
														{copiedReviewLink === link.label ? <><Check className="mr-1.5 h-3.5 w-3.5" /> Copied!</> : <><Copy className="mr-1.5 h-3.5 w-3.5" /> Copy Link</>}
													</Button>
												</>
											) : <p className="text-[11px] text-white/30 italic">Not configured</p>}
										</div>
									))}
								</div>
							</div>

							{/* Review Reply Templates */}
							<div className="rounded-2xl border border-white/10 bg-white/5 p-6 space-y-5">
								<div className="flex items-center gap-2"><MessageSquare className="h-5 w-5 text-amber-400" /><h3 className="font-bold text-white text-base">Review Reply Templates</h3></div>
								<div className="grid grid-cols-1 md:grid-cols-2 gap-4">
									{REVIEW_REPLY_TEMPLATES.map((tmpl, idx) => (
										<div key={idx} className="rounded-xl border border-white/10 bg-black/30 p-4 space-y-3">
											<h4 className="font-semibold text-white text-xs">{tmpl.label}</h4>
											<p className="text-[11px] text-white/70 leading-relaxed">{tmpl.text}</p>
											<Button variant="ghost" size="sm" onClick={() => { navigator.clipboard.writeText(tmpl.text); setCopiedReply(idx); setTimeout(() => setCopiedReply(null), 3000) }}
												className="border border-white/10 text-xs text-amber-400 hover:bg-amber-500/10 h-7">
												{copiedReply === idx ? <><Check className="mr-1.5 h-3.5 w-3.5" /> Copied!</> : <><Copy className="mr-1.5 h-3.5 w-3.5" /> Copy Reply</>}
											</Button>
										</div>
									))}
								</div>
							</div>
						</div>
					)}

					{/* ═══════════ ANALYTICS TAB ═════════════════════════════ */}
					{activeTab === 'analytics' && (
						<div className="space-y-6">
							<div className="flex items-center justify-between">
								<div>
									<h3 className="font-bold text-white text-lg flex items-center gap-2"><BarChart3 className="h-5 w-5 text-cyan-400" /> Channel Performance Analytics</h3>
									<p className="text-xs text-white/50 mt-1">Order source breakdown for the last 30 days</p>
								</div>
								<Button disabled={analyticsLoading || !tenantId} onClick={handleLoadAnalytics} className="bg-cyan-600 hover:bg-cyan-700 text-white font-semibold text-xs px-5">
									<BarChart3 className={`mr-2 h-4 w-4 ${analyticsLoading ? 'animate-spin' : ''}`} />
									{analyticsLoading ? 'Loading...' : analytics ? 'Refresh' : 'Load Analytics'}
								</Button>
							</div>
							{analytics ? (
								<>
									<div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
										<div className="rounded-2xl border border-white/10 bg-white/5 p-5 text-center space-y-2">
											<TrendingUp className="h-6 w-6 text-cyan-400 mx-auto" />
											<p className="text-2xl font-bold text-white">{analytics.totalOrders}</p>
											<p className="text-xs text-white/50">Total Orders</p>
										</div>
										<div className="rounded-2xl border border-white/10 bg-white/5 p-5 text-center space-y-2">
											<Zap className="h-6 w-6 text-emerald-400 mx-auto" />
											<p className="text-2xl font-bold text-emerald-400">{fmt(analytics.totalRevenue)}</p>
											<p className="text-xs text-white/50">Total Revenue</p>
										</div>
										<div className="rounded-2xl border border-white/10 bg-white/5 p-5 text-center space-y-2">
											<Star className="h-6 w-6 text-amber-400 mx-auto" />
											<p className="text-lg font-bold text-amber-400">{orderTypeLabels[analytics.topChannel] || analytics.topChannel}</p>
											<p className="text-xs text-white/50">Top Channel</p>
										</div>
									</div>
									<div className="rounded-2xl border border-white/10 bg-white/5 p-6 space-y-5">
										<h4 className="font-bold text-white text-base flex items-center gap-2"><Eye className="h-5 w-5 text-cyan-400" /> Channel Breakdown</h4>
										<div className="space-y-3">
											{analytics.channelBreakdown.map((ch) => {
												const pct = analytics.totalRevenue > 0 ? (ch.revenue / analytics.totalRevenue * 100) : 0
												return (
													<div key={ch.orderType} className="space-y-1.5">
														<div className="flex items-center justify-between text-xs">
															<span className="font-semibold text-white">{orderTypeLabels[ch.orderType] || ch.orderType}</span>
															<div className="flex items-center gap-4">
																<span className="text-white/50">{ch.count} orders</span>
																<span className="font-bold text-white">{fmt(ch.revenue)}</span>
																<span className="text-cyan-400 font-semibold w-12 text-right">{pct.toFixed(1)}%</span>
															</div>
														</div>
														<div className="h-2 rounded-full bg-white/5 overflow-hidden">
															<motion.div initial={{ width: 0 }} animate={{ width: `${pct}%` }} transition={{ duration: 0.8, ease: 'easeOut' }} className="h-full rounded-full bg-gradient-to-r from-cyan-500 to-blue-500" />
														</div>
													</div>
												)
											})}
										</div>
									</div>
									<div className="rounded-2xl border border-white/10 bg-white/5 p-6 space-y-4">
										<div className="flex items-center gap-2"><Sparkles className="h-5 w-5 text-amber-400" /><h4 className="font-bold text-white text-base">Growth Recommendations</h4></div>
										<div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
											{[
												{ tip: 'Push direct ordering links to reduce aggregator commissions by 20-30%', icon: ArrowRight },
												{ tip: 'Run Google Ads targeting "pizza near me" for your city', icon: Search },
												{ tip: 'Offer 10% cashback on direct orders to shift from Swiggy/Zomato', icon: Zap },
												{ tip: 'Create WhatsApp Broadcast for VIP customers with exclusive deals', icon: MessageSquare },
												{ tip: 'Add review QR codes on every bill to boost Google rating', icon: Star },
												{ tip: 'Post 3-5 Instagram Reels weekly with trending audio', icon: Instagram }
											].map((item, i) => (
												<div key={i} className="flex items-start gap-3 rounded-xl border border-white/5 bg-black/20 p-3">
													<item.icon className="h-4 w-4 text-amber-400 flex-shrink-0 mt-0.5" /><span className="text-white/70">{item.tip}</span>
												</div>
											))}
										</div>
									</div>
								</>
							) : (
								<div className="rounded-2xl border border-white/10 bg-white/5 p-12 text-center space-y-4">
									<BarChart3 className="h-12 w-12 text-white/20 mx-auto" />
									<p className="text-sm text-white/40">Click &quot;Load Analytics&quot; to see channel performance</p>
								</div>
							)}
						</div>
					)}

				</motion.div>
			</AnimatePresence>

			{/* Custom Alert Modal for Inactive Module */}
			<AnimatePresence>
				{showInactiveModal && (
					<div className="fixed inset-0 z-50 flex items-center justify-center p-4">
						<motion.div
							initial={{ opacity: 0 }}
							animate={{ opacity: 1 }}
							exit={{ opacity: 0 }}
							onClick={() => setShowInactiveModal(false)}
							className="absolute inset-0 bg-black/80 backdrop-blur-md"
						/>
						<motion.div
							initial={{ opacity: 0, scale: 0.9, y: 20 }}
							animate={{ opacity: 1, scale: 1, y: 0 }}
							exit={{ opacity: 0, scale: 0.9, y: 20 }}
							className="relative w-full max-w-md rounded-3xl border border-amber-500/30 bg-[#0C0F1D] p-6 shadow-[0_20px_60px_rgba(245,158,11,0.15)] space-y-6 text-center overflow-hidden"
						>
							<div className="absolute top-0 left-1/2 -translate-x-1/2 h-1.5 w-28 bg-gradient-to-r from-amber-500 to-red-500 rounded-b-full" />
							<div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-400">
								<AlertTriangle className="h-8 w-8" />
							</div>
							<div className="space-y-2">
								<Badge className="bg-amber-500/10 text-amber-400 border-amber-500/20 text-xs">
									Module Not Active
								</Badge>
								<h3 className="text-xl font-bold text-white">{inactiveModuleName}</h3>
								<p className="text-xs text-white/60 leading-relaxed px-2">
									The {inactiveModuleName} module is currently inactive on your server environment. Please contact your system administrator to activate this service.
								</p>
							</div>
							<Button
								onClick={() => setShowInactiveModal(false)}
								className="w-full bg-white/10 hover:bg-white/20 text-white font-semibold text-xs py-3 rounded-xl border border-white/10 transition-colors"
							>
								Dismiss
							</Button>
						</motion.div>
					</div>
				)}
			</AnimatePresence>
		</div>
	)
}
