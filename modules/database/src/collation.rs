use std::cmp::Ordering;

use pinyin::ToPinyin;

/// Convert a string to its pinyin representation for comparison.
/// Chinese characters become their pinyin reading; non-Chinese characters pass through unchanged.
fn to_pinyin_for_cmp(s: &str) -> String {
    let mut result = String::with_capacity(s.len() * 6);
    for (ch, py) in s.chars().zip(s.to_pinyin()) {
        match py {
            Some(p) => result.push_str(p.plain()),
            None => result.push(ch),
        }
    }
    result
}

/// Compare two strings by their pinyin representation.
pub fn compare_pinyin(a: &str, b: &str) -> Ordering {
    to_pinyin_for_cmp(a).cmp(&to_pinyin_for_cmp(b))
}
