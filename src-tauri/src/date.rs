/*!
Dates, as a daily note means them — a port of the part of `src/shared/date.ts`
the backend uses.

`formatDisplayDate` and `formatEditedAgo` are not here. They are how the
sidebar phrases a date, and the sidebar is the renderer's.
*/

use chrono::{Datelike, Duration, Local, NaiveDate, TimeZone};

/// `YYYY-MM-DD` from the *local* calendar date, not UTC — something written at
/// 11pm belongs to that evening, whatever the offset from UTC happens to be.
pub fn to_daily_note_name(date: &NaiveDate) -> String {
    format!("{:04}-{:02}-{:02}", date.year(), date.month(), date.day())
}

/// Accepts `2026-09-03` or `2026-09-03.md`. Nothing else.
pub fn parse_daily_note_name(name: &str) -> Option<NaiveDate> {
    let stem = name.strip_suffix(".md").unwrap_or(name);
    let parts: Vec<&str> = stem.split('-').collect();
    if parts.len() != 3 || parts[0].len() != 4 || parts[1].len() != 2 || parts[2].len() != 2 {
        return None;
    }

    let year: i32 = parts[0].parse().ok()?;
    let month: u32 = parts[1].parse().ok()?;
    let day: u32 = parts[2].parse().ok()?;

    /*
     * Two digits mean the twentieth century to JavaScript's Date constructor:
     * `new Date(1, 0, 1)` is the first of January 1901, not of the year 1.
     * Reproduced rather than special-cased, because the round trip below is
     * then the same check on both sides — a name whose year was rewritten no
     * longer matches itself, and `0001-01-01` is not a daily note under either
     * backend.
     */
    let year = if (0..100).contains(&year) {
        1900 + year
    } else {
        year
    };

    // The same round trip rejects impossible dates like 2026-02-31, which
    // JavaScript silently rolls over into March.
    let date = NaiveDate::from_ymd_opt(year, month, day)?;
    (to_daily_note_name(&date) == stem).then_some(date)
}

/// The auto-generated title of a daily note, e.g. `9/3/26`.
pub fn format_daily_title(date: &NaiveDate) -> String {
    format!(
        "{}/{}/{:02}",
        date.month(),
        date.day(),
        date.year().rem_euclid(100)
    )
}

/// A daily note counts as untouched when nothing was written into it. The
/// auto-generated title alone does not count as content, whether it lives in
/// front matter or was echoed into the body as a heading.
pub fn is_blank_daily_body(body: &str, title: &str) -> bool {
    !body
        .split('\n')
        .map(crate::js::trim)
        .any(|line| !line.is_empty() && line != format!("# {title}") && line != title)
}

pub fn today() -> NaiveDate {
    Local::now().date_naive()
}

/// Milliseconds until one second past the next local midnight — when the daily
/// note for the following day gets created. The one-second cushion keeps a
/// timer that fires marginally early from landing back on today's date.
#[allow(dead_code)]
pub fn ms_until_next_midnight(now: &chrono::DateTime<Local>) -> i64 {
    let tomorrow = now.date_naive() + Duration::days(1);
    let target = tomorrow
        .and_hms_opt(0, 0, 1)
        .expect("one second past midnight");

    // An hour that does not exist because the clocks went forward is not one
    // to wait for; the next real instant is.
    Local
        .from_local_datetime(&target)
        .earliest()
        .map(|at| at.timestamp_millis() - now.timestamp_millis())
        .unwrap_or(0)
}
