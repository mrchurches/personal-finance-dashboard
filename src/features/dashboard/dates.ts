import dayjs from "dayjs";

/**
 * Turns the keys the data is stored under into dates a person can diarise.
 *
 * The whole application keys cycles as "YYYY-MM" because that sorts and compares
 * correctly, and then showed the reader the key. "2027-01" is not a date anybody puts
 * in a calendar; "enero de 2027" is. So the key stays the key and only the label
 * changes - nothing here is ever used for sorting or comparison.
 *
 * dayjs is already bound to the interface language, so month names follow the language
 * switch with no table of translations here.
 *
 * The shapes are checked against explicit patterns rather than by passing a format to
 * dayjs. Format parsing needs the `customParseFormat` plugin, which this project does
 * not load, so dayjs quietly ignores both the format and the strict flag - a date would
 * validate against a month pattern and the check would be decoration. ISO parsing needs
 * no plugin and both shapes here are ISO.
 */
const CYCLE_PATTERN = /^\d{4}-(?:0[1-9]|1[0-2])$/;
const DAY_PATTERN = /^\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])$/;

/** Short enough for a table cell: "ene 2027". Returns the key unchanged if it is not one. */
export function formatCycle(period: string): string {
  return CYCLE_PATTERN.test(period) ? dayjs(period).format("MMM YYYY") : period;
}

/** Long enough for a sentence: "enero de 2027". */
export function formatCycleLong(period: string): string {
  return CYCLE_PATTERN.test(period) ? dayjs(period).format("MMMM [de] YYYY") : period;
}

/** A day inside a sentence: "4 de septiembre". */
export function formatDay(date: string): string {
  return DAY_PATTERN.test(date) ? dayjs(date).format("D [de] MMMM") : date;
}

/**
 * Whole days from today to a target, negative once it has passed.
 *
 * Both ends are truncated to calendar days, so a deadline is not "tomorrow" for part of
 * the day and "today" for the rest.
 */
export function daysUntil(target: string, today: string): number | null {
  if (!DAY_PATTERN.test(target) || !DAY_PATTERN.test(today)) {
    return null;
  }

  return dayjs(target).startOf("day").diff(dayjs(today).startOf("day"), "day");
}

/** How far through a cycle today is, as whole percent, clamped to its ends. */
export function cycleProgressPercent(
  openedOn: string,
  closedOn: string,
  today: string,
): number | null {
  if (!DAY_PATTERN.test(openedOn) || !DAY_PATTERN.test(closedOn) || !DAY_PATTERN.test(today)) {
    return null;
  }

  const from = dayjs(openedOn).startOf("day");
  const span = dayjs(closedOn).startOf("day").diff(from, "day");
  if (span <= 0) {
    return null;
  }

  const elapsed = dayjs(today).startOf("day").diff(from, "day");
  return Math.min(Math.max(Math.round((elapsed / span) * 100), 0), 100);
}
