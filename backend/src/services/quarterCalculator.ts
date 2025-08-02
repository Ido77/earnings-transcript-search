import { Quarter } from '@/types';

/**
 * Generalized quarter calculation approach
 * Instead of trying to calculate fiscal years, we try quarters in order of recency
 * This works for any company regardless of their fiscal year structure
 */

/**
 * Get quarters to try in order of recency (most recent first)
 * This is the generalized approach that works for any company
 */
export function getQuartersToTry(count: number = 4): Quarter[] {
  const quarters: Quarter[] = [];
  const currentDate = new Date();
  const currentYear = currentDate.getFullYear();
  const currentMonth = currentDate.getMonth();
  
  // Start from current year and go backwards
  for (let yearOffset = 0; yearOffset <= 3; yearOffset++) {
    const year = currentYear - yearOffset;
    
    // For each year, try quarters in reverse order (4, 3, 2, 1)
    for (let quarter = 4; quarter >= 1; quarter--) {
      quarters.push({ year, quarter });
      
      // Stop when we have enough quarters
      if (quarters.length >= count * 2) { // Get extra quarters to ensure we have enough
        break;
      }
    }
    
    if (quarters.length >= count * 2) {
      break;
    }
  }
  
  return quarters;
}

/**
 * Get quarters to try for a specific ticker (generalized approach)
 * This tries quarters in order of recency and works for any company
 */
export function getQuartersToTryForTicker(ticker: string, count: number = 4): Quarter[] {
  // For now, use the same approach for all tickers
  // In the future, we could add ticker-specific optimizations
  return getQuartersToTry(count);
}

/**
 * Calculate the last N quarters from a given date (generalized approach)
 */
export function getLastFourQuarters(fromDate: Date = new Date()): Quarter[] {
  return getQuartersToTry(4);
}

/**
 * Calculate quarters within a date range (generalized approach)
 */
export function getQuartersInRange(startDate: Date, endDate: Date): Quarter[] {
  const quarters: Quarter[] = [];
  const startYear = startDate.getFullYear();
  const startQuarter = Math.ceil((startDate.getMonth() + 1) / 3);
  const endYear = endDate.getFullYear();
  const endQuarter = Math.ceil((endDate.getMonth() + 1) / 3);

  let currentYear = startYear;
  let currentQuarter = startQuarter;

  while (
    currentYear < endYear ||
    (currentYear === endYear && currentQuarter <= endQuarter)
  ) {
    quarters.push({ year: currentYear, quarter: currentQuarter });

    currentQuarter++;
    if (currentQuarter > 4) {
      currentQuarter = 1;
      currentYear++;
    }
  }

  return quarters;
}

/**
 * Get the date range for a specific quarter
 */
export function getQuarterDateRange(year: number, quarter: number): {
  start: Date;
  end: Date;
} {
  const startMonth = (quarter - 1) * 3;
  const endMonth = startMonth + 2;

  const start = new Date(year, startMonth, 1);
  const end = new Date(year, endMonth + 1, 0); // Last day of the quarter

  return { start, end };
}

/**
 * Check if a quarter is valid
 */
export function isValidQuarter(year: number, quarter: number): boolean {
  const currentYear = new Date().getFullYear();
  
  return (
    year >= 2000 &&
    year <= currentYear + 1 && // Allow one year ahead
    quarter >= 1 &&
    quarter <= 4
  );
}

/**
 * Format quarter for display
 */
export function formatQuarter(year: number, quarter: number): string {
  return `Q${quarter} ${year}`;
}

/**
 * Compare two quarters
 */
export function compareQuarters(a: Quarter, b: Quarter): number {
  if (a.year !== b.year) {
    return a.year - b.year;
  }
  return a.quarter - b.quarter;
}

/**
 * Get the next quarter
 */
export function getNextQuarter(quarter: Quarter): Quarter {
  if (quarter.quarter === 4) {
    return { year: quarter.year + 1, quarter: 1 };
  }
  return { year: quarter.year, quarter: quarter.quarter + 1 };
}

/**
 * Get the previous quarter
 */
export function getPreviousQuarter(quarter: Quarter): Quarter {
  if (quarter.quarter === 1) {
    return { year: quarter.year - 1, quarter: 4 };
  }
  return { year: quarter.year, quarter: quarter.quarter - 1 };
}

/**
 * Get fiscal year info (simplified for generalized approach)
 */
export function getGeneralizedFiscalYearInfo(): {
  description: string;
  example: string;
} {
  return {
    description: 'Generalized approach - tries quarters in order of recency',
    example: 'Q4 2025, Q3 2025, Q2 2025, Q1 2025, Q4 2024, etc.'
  };
}

// Legacy functions for backward compatibility (keeping the old approach as fallback)
const FISCAL_YEAR_OFFSETS: Record<string, number> = {
  'NVDA': 1,  // NVIDIA: Fiscal year ends in January, so FY2026 = CY2025
  'AAPL': 0,  // Apple: Fiscal year ends in September, but we'll use calendar year for simplicity
  'MSFT': 0,  // Microsoft: Fiscal year ends in June, but we'll map Q4 2025 to July 2025 correctly
  'GOOGL': 0, // Alphabet: Fiscal year ends in December (calendar year)
  'TSLA': 0,  // Tesla: Fiscal year ends in December (calendar year)
  'AMZN': 0,  // Amazon: Fiscal year ends in December (calendar year)
  'META': 0,  // Meta: Fiscal year ends in December (calendar year)
  'NFLX': 0,  // Netflix: Fiscal year ends in December (calendar year)
  'DIS': 0,   // Disney: Fiscal year ends in September, but we'll use calendar year for simplicity
  'JPM': 0,   // JPMorgan: Fiscal year ends in December (calendar year)
  'JNJ': 0,   // Johnson & Johnson: Fiscal year ends in December (calendar year)
  'PG': 0,    // Procter & Gamble: Fiscal year ends in June, but we'll use calendar year for simplicity
  'HD': 0,    // Home Depot: Fiscal year ends in January, but we'll use calendar year for simplicity
  'V': 0,     // Visa: Fiscal year ends in September, but we'll use calendar year for simplicity
  'MA': 0,    // Mastercard: Fiscal year ends in December (calendar year)
  'UNH': 0,   // UnitedHealth: Fiscal year ends in December (calendar year)
  'BRK-B': 0, // Berkshire Hathaway: Fiscal year ends in December (calendar year)
  'CRM': 0,   // Salesforce: Fiscal year ends in January, but we'll use calendar year for simplicity
  'ADBE': 0,  // Adobe: Fiscal year ends in November, but we'll use calendar year for simplicity
  'PYPL': 0,  // PayPal: Fiscal year ends in December (calendar year)
  'CMCSA': 0, // Comcast: Fiscal year ends in December (calendar year)
  'PEP': 0,   // PepsiCo: Fiscal year ends in December (calendar year)
  'TMO': 0,   // Thermo Fisher: Fiscal year ends in December (calendar year)
  'ABT': 0,   // Abbott: Fiscal year ends in December (calendar year)
  'COST': 0,  // Costco: Fiscal year ends in August, but we'll use calendar year for simplicity
  'ACN': 0,   // Accenture: Fiscal year ends in August, but we'll use calendar year for simplicity
  'MRK': 0,   // Merck: Fiscal year ends in December (calendar year)
  'DHR': 0,   // Danaher: Fiscal year ends in December (calendar year)
  'VZ': 0,    // Verizon: Fiscal year ends in December (calendar year)
  'NKE': 0,   // Nike: Fiscal year ends in May, but we'll use calendar year for simplicity
};

/**
 * Get fiscal year offset for a ticker (legacy function for backward compatibility)
 */
export function getFiscalYearOffset(ticker: string): number {
  return FISCAL_YEAR_OFFSETS[ticker.toUpperCase()] || 0;
}

/**
 * Convert calendar year/quarter to fiscal year/quarter for a specific ticker (legacy function)
 */
export function toFiscalYear(ticker: string, calendarYear: number, calendarQuarter: number): Quarter {
  const offset = getFiscalYearOffset(ticker);
  const fiscalYear = calendarYear + offset;
  
  return {
    year: fiscalYear,
    quarter: calendarQuarter
  };
}

/**
 * Convert fiscal year/quarter to calendar year/quarter for a specific ticker (legacy function)
 */
export function toCalendarYear(ticker: string, fiscalYear: number, fiscalQuarter: number): Quarter {
  const offset = getFiscalYearOffset(ticker);
  const calendarYear = fiscalYear - offset;
  
  return {
    year: calendarYear,
    quarter: fiscalQuarter
  };
}

/**
 * Get fiscal year info for a ticker (legacy function)
 */
export function getFiscalYearInfo(ticker: string): {
  offset: number;
  description: string;
  example: string;
} {
  const offset = getFiscalYearOffset(ticker);
  
  if (offset === 0) {
    return {
      offset: 0,
      description: 'Calendar year (fiscal year ends in December)',
      example: 'Q1 2025 = January-March 2025'
    };
  } else if (offset > 0) {
    return {
      offset,
      description: `Fiscal year ${offset} year(s) ahead of calendar year`,
      example: `Q1 ${2025 + offset} = ${offset === 1 ? 'February-April 2025' : 'Calendar year calculation'}`
    };
  } else {
    return {
      offset,
      description: `Fiscal year ${Math.abs(offset)} year(s) behind calendar year`,
      example: `Q1 ${2025 + offset} = ${Math.abs(offset) === 1 ? 'October-December 2024' : 'Calendar year calculation'}`
    };
  }
} 