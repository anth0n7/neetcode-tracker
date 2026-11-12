// What "today" means for the app: the calendar date on this computer, in its
// local time zone, as "YYYY-MM-DD". It rolls over at local midnight.
//
// Every API route calls this one function, so there is a single definition of
// "today". The scheduler never calls it: it is always handed the date instead.

// `now` can be passed in so tests can pretend it is any moment they like.
export function todayLocal(now: Date = new Date()): string {
  // getFullYear/getMonth/getDate read the LOCAL date. (toISOString() would use
  // UTC and give tomorrow's date for an evening session in the Americas.)
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0"); // getMonth() counts from 0
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}
