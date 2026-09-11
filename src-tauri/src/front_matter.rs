/*!
Splitting a note into its front matter and its body — a port of
`src/shared/frontMatter.ts`.

Deliberately handles only the flat `key: value` and `key: [a, b]` shapes Tova
writes. Anything more exotic is left in the body rather than guessed at, which
is a decision the TypeScript made and this one keeps: a note is a file someone
may have edited in another editor, and a parser that guesses is a parser that
silently rewrites their words.
*/

// Ported ahead of its caller, the way `vault.rs` was: this is the layer a
// note is read and written through, and it is worth having under a
// conformance fixture before the code that leans on it exists rather than
// after. Read by `notes.rs`, which is the slice after this one.
#![allow(dead_code)]

use std::collections::BTreeMap;

use crate::js;

const FENCE: &str = "---";

/// A front matter value is a string or a list of them, and nothing else.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Value {
    One(String),
    Many(Vec<String>),
}

impl Value {
    pub fn as_str(&self) -> Option<&str> {
        match self {
            Value::One(s) => Some(s),
            Value::Many(_) => None,
        }
    }
}

impl From<&str> for Value {
    fn from(value: &str) -> Self {
        Value::One(value.to_string())
    }
}

impl From<String> for Value {
    fn from(value: String) -> Self {
        Value::One(value)
    }
}

impl From<Vec<String>> for Value {
    fn from(value: Vec<String>) -> Self {
        Value::Many(value)
    }
}

/*
 * Insertion order, not sorted order: the TypeScript writes `Object.entries` of
 * an object it built in a fixed order, and a note whose front matter reshuffles
 * itself on every save is a note that is never the same file twice.
 */
#[derive(Debug, Default, Clone, PartialEq, Eq)]
pub struct Data {
    order: Vec<String>,
    values: BTreeMap<String, Value>,
}

impl Data {
    pub fn get(&self, key: &str) -> Option<&Value> {
        self.values.get(key)
    }

    pub fn str(&self, key: &str) -> Option<&str> {
        self.get(key)?.as_str()
    }

    pub fn set(&mut self, key: &str, value: impl Into<Value>) {
        if self.values.insert(key.to_string(), value.into()).is_none() {
            self.order.push(key.to_string());
        }
    }

    pub fn is_empty(&self) -> bool {
        self.values.is_empty()
    }

    fn entries(&self) -> impl Iterator<Item = (&String, &Value)> {
        self.order.iter().filter_map(|key| {
            let value = self.values.get(key)?;
            Some((key, value))
        })
    }
}

pub struct Parsed {
    pub data: Data,
    pub body: String,
}

fn unquote(value: &str) -> &str {
    let quoted = (value.starts_with('"') && value.ends_with('"'))
        || (value.starts_with('\'') && value.ends_with('\''));

    // `length >= 2`, so a lone quote is a value and not an empty one.
    if quoted && value.chars().count() >= 2 {
        &value[1..value.len() - 1]
    } else {
        value
    }
}

fn parse_value(raw: &str) -> Value {
    let value = js::trim(raw);

    if value.starts_with('[') && value.ends_with(']') && value.len() >= 2 {
        let inner = js::trim(&value[1..value.len() - 1]);
        if inner.is_empty() {
            return Value::Many(Vec::new());
        }
        return Value::Many(
            inner
                .split(',')
                .map(|item| unquote(js::trim(item)).to_string())
                .collect(),
        );
    }

    Value::One(unquote(value).to_string())
}

/*
 * A value that has to be quoted, by the TypeScript's rule:
 *
 *   value === "" || /^[[\]{}#&*!|>'"%@`]|:\s|\s$|^\s/.test(value)
 *
 * Note what is *not* in it. A quote in the middle of a value does not make it
 * quotable, so `he said "no"` is written bare and reads back as itself; only a
 * leading one counts. Faithful rather than improved — the rule decides what a
 * note on disk looks like, and changing it would make this backend write files
 * the other one did not.
 */
fn needs_quotes(value: &str) -> bool {
    const LEADING: [char; 13] = [
        '[', ']', '{', '}', '#', '&', '*', '!', '|', '>', '\'', '"', '%',
    ];

    if value.is_empty() {
        return true;
    }

    let first = value.chars().next();
    if first.is_some_and(|c| LEADING.contains(&c) || c == '@' || c == '`') {
        return true;
    }
    if first.is_some_and(js::is_whitespace) {
        return true;
    }
    if value.chars().next_back().is_some_and(js::is_whitespace) {
        return true;
    }

    // `:\s` — a colon with whitespace after it, anywhere in the value.
    let mut chars = value.chars().peekable();
    while let Some(c) = chars.next() {
        if c == ':' && chars.peek().copied().is_some_and(js::is_whitespace) {
            return true;
        }
    }

    false
}

fn serialize_value(value: &Value) -> String {
    let one = |item: &String| {
        if needs_quotes(item) {
            js::json_string(item)
        } else {
            item.clone()
        }
    };

    match value {
        Value::One(item) => one(item),
        Value::Many(items) => format!("[{}]", items.iter().map(one).collect::<Vec<_>>().join(", ")),
    }
}

pub fn parse(raw: &str) -> Parsed {
    let normalized = raw.replace("\r\n", "\n");

    let plain = |body: String| Parsed {
        data: Data::default(),
        body,
    };

    if !normalized.starts_with(&format!("{FENCE}\n")) {
        return plain(normalized);
    }

    let lines: Vec<&str> = normalized.split('\n').collect();
    let Some(closing) = lines.iter().skip(1).position(|line| *line == FENCE) else {
        return plain(normalized);
    };
    let closing = closing + 1;

    let mut data = Data::default();
    for line in &lines[1..closing] {
        if js::trim(line).is_empty() || js::trim_start(line).starts_with('#') {
            continue;
        }
        let Some(separator) = line.find(':') else {
            continue;
        };
        let key = js::trim(&line[..separator]);
        if key.is_empty() {
            continue;
        }
        data.set(key, parse_value(&line[separator + 1..]));
    }

    // One leading newline goes, and only one: the blank line `serialize` puts
    // between the fence and the prose. A second is the reader's.
    let body = lines[closing + 1..].join("\n");
    Parsed {
        data,
        body: body.strip_prefix('\n').unwrap_or(&body).to_string(),
    }
}

pub fn serialize(data: &Data, body: &str) -> String {
    if data.is_empty() {
        return body.to_string();
    }

    let lines: Vec<String> = data
        .entries()
        .map(|(key, value)| format!("{key}: {}", serialize_value(value)))
        .collect();

    format!("{FENCE}\n{}\n{FENCE}\n\n{body}", lines.join("\n"))
}
