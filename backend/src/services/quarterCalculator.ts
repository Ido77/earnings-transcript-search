import { Quarter } from '@/types';

/**
 * Calculate the last N quarters from a given date
 * Handles year transitions correctly
 */
export function getLastFourQuarters(fromDate: Date = new Date()): Quarter[] {
  const quarters: Quarter[] = [];
  let year = fromDate.getFullYear();
  let quarter = Math.ceil((fromDate.getMonth() + 1) / 3);

  for (let i = 0; i < 4; i++) {
    quarters.push({ year, quarter });
    quarter--;
    if (quarter === 0) {
      quarter = 4;
      year--;
    }
  }

  return quarters;
}

/**
 * Calculate quarters within a date range
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
  return (
    year >= 2000 &&
    year <= new Date().getFullYear() + 1 &&
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