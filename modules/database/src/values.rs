use napi::{Env, Error, JsString, Result, Unknown, ValueType};
use rusqlite::types::{Value, ValueRef};

macro_rules! err_wrapper {
    ($exp: expr) => {
        $exp.map_err(|err| Error::from(err))?
    };
    (safe, $exp: expr) => {
        unsafe { err_wrapper!($exp) }
    };
}

pub fn js_to_rusqlite_value(val: Unknown) -> Result<Value> {
    let t = err_wrapper!(val.get_type());
    if t == ValueType::Null || t == ValueType::Undefined {
        return Ok(Value::Null);
    }
    if t == ValueType::String {
        return Ok(Value::Text(err_wrapper!(safe, val.cast())));
    }
    if t == ValueType::Number {
        let n: f64 = err_wrapper!(safe, val.cast());
        if n == (n as i64) as f64 && n.is_finite() {
            return Ok(Value::Integer(n as i64));
        }
        return Ok(Value::Real(n));
    }
    if t == ValueType::Boolean {
        return Ok(Value::Integer(if err_wrapper!(safe, val.cast()) {
            1
        } else {
            0
        }));
    }
    Ok(Value::Null)
}

pub fn value_ref_to_js_string<'a>(env: &'a Env, val: ValueRef<'a>) -> Result<JsString<'a>> {
    match val {
        ValueRef::Null => env.create_string(""),
        ValueRef::Integer(i) => env.create_string(i.to_string()),
        ValueRef::Real(f) => env.create_string(f.to_string()),
        ValueRef::Text(t) => env.create_string(std::str::from_utf8(t).unwrap()),
        ValueRef::Blob(b) => env.create_string(format!("{:?}", b)),
    }
}
