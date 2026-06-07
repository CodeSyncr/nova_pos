export type DateRange = {
	startDate: string
	endDate: string
}

export function calculateDateRange(
	period:
		| 'weekly'
		| 'monthly'
		| 'quarterly'
		| 'halfyearly'
		| 'yearly'
		| 'custom',
	customStartDate?: string,
	customEndDate?: string,
	monthStartDay: number = 1,
	monthEndDay: number = 0
): DateRange {
	const now = new Date()
	let startDate: Date
	let endDate: Date

	if (period === 'custom' && customStartDate && customEndDate) {
		startDate = new Date(customStartDate)
		endDate = new Date(customEndDate)
		endDate.setHours(23, 59, 59, 999)
		return {
			startDate: startDate.toISOString(),
			endDate: endDate.toISOString()
		}
	}

	// Helper function to get the current period start date based on monthStartDay
	const getCurrentPeriodStart = (): Date => {
		const currentDate = new Date(now)
		const currentDay = currentDate.getDate()

		// If we're before the month start day, we're still in the previous period
		// For example, if monthStartDay is 5:
		// - Jan 1-4: period is Dec 5 - Jan 4 (previous period)
		// - Jan 5-31: period is Jan 5 - Feb 4 (current period)
		if (currentDay < monthStartDay) {
			currentDate.setMonth(currentDate.getMonth() - 1)
		}

		// Set to the month start day at 00:00:00 in local time
		// Then convert to UTC start of day to avoid timezone issues
		const periodStart = new Date(
			currentDate.getFullYear(),
			currentDate.getMonth(),
			monthStartDay,
			0,
			0,
			0,
			0
		)

		// Ensure we're using the start of the day in the local timezone
		// This prevents timezone conversion from including previous day's data
		return periodStart
	}

	// Helper function to get period end date
	const getPeriodEnd = (periodStart: Date, monthsToAdd: number): Date => {
		const periodEnd = new Date(periodStart)
		periodEnd.setMonth(periodEnd.getMonth() + monthsToAdd)

		if (monthEndDay > 0) {
			// Use custom month end day
			// If monthStartDay is 5 and monthEndDay is 4, we want the 4th of the month that's monthsToAdd ahead
			// For monthly: Jan 5 -> Feb 4 (1 month ahead, day 4)
			periodEnd.setDate(monthEndDay)
		} else {
			// Auto-calculate: one day before the next period starts
			// If monthStartDay is 5, period ends on 4th of next month
			const nextPeriodStart = new Date(
				periodEnd.getFullYear(),
				periodEnd.getMonth(),
				monthStartDay
			)
			nextPeriodStart.setDate(nextPeriodStart.getDate() - 1)
			periodEnd.setTime(nextPeriodStart.getTime())
		}

		periodEnd.setHours(23, 59, 59, 999)
		return periodEnd
	}

	switch (period) {
		case 'weekly': {
			// Get current week: Monday to Sunday
			const today = new Date(now)
			const dayOfWeek = today.getDay() // 0 = Sunday, 1 = Monday, ..., 6 = Saturday
			// Convert to Monday = 0, Sunday = 6
			const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek

			startDate = new Date(today)
			startDate.setDate(today.getDate() + mondayOffset)
			startDate.setHours(0, 0, 0, 0)

			endDate = new Date(startDate)
			endDate.setDate(startDate.getDate() + 6) // Sunday (6 days after Monday)
			endDate.setHours(23, 59, 59, 999)
			break
		}
		case 'monthly': {
			startDate = getCurrentPeriodStart()
			endDate = getPeriodEnd(startDate, 1)
			break
		}
		case 'quarterly': {
			const periodStart = getCurrentPeriodStart()
			// Find which quarter we're in (0-3) based on the month
			const month = periodStart.getMonth()
			const quarter = Math.floor(month / 3)
			// Calculate the start month of the quarter
			const quarterStartMonth = quarter * 3
			startDate = new Date(
				periodStart.getFullYear(),
				quarterStartMonth,
				monthStartDay
			)
			// Adjust if we're before the month start day in the quarter start month
			if (month === quarterStartMonth && now.getDate() < monthStartDay) {
				startDate.setMonth(startDate.getMonth() - 3)
			}
			endDate = getPeriodEnd(startDate, 3)
			break
		}
		case 'halfyearly': {
			const periodStart = getCurrentPeriodStart()
			// Find which half we're in (0 or 1) based on the month
			const month = periodStart.getMonth()
			const half = Math.floor(month / 6)
			// Calculate the start month of the half
			const halfStartMonth = half * 6
			startDate = new Date(
				periodStart.getFullYear(),
				halfStartMonth,
				monthStartDay
			)
			// Adjust if we're before the month start day in the half start month
			if (month === halfStartMonth && now.getDate() < monthStartDay) {
				startDate.setMonth(startDate.getMonth() - 6)
			}
			endDate = getPeriodEnd(startDate, 6)
			break
		}
		case 'yearly': {
			startDate = new Date(now.getFullYear(), 0, monthStartDay)
			// If we're before the year's month start day, use previous year
			if (now.getMonth() === 0 && now.getDate() < monthStartDay) {
				startDate.setFullYear(startDate.getFullYear() - 1)
			}
			endDate = getPeriodEnd(startDate, 12)
			break
		}
		default: {
			// Default to current month
			startDate = getCurrentPeriodStart()
			endDate = getPeriodEnd(startDate, 1)
		}
	}

	return {
		startDate: startDate.toISOString(),
		endDate: endDate.toISOString()
	}
}
