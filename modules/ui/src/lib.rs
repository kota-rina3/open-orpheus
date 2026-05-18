#![deny(clippy::all)]

use font_kit::source::SystemSource;
use napi::{bindgen_prelude::Array, Env, Error, Result};
use napi_derive::napi;

#[napi(ts_return_type = "string[]")]
pub fn get_system_fonts<'env>(env: &'env Env) -> Result<Array<'env>> {
    let src = SystemSource::new();

    let families = src
        .all_families()
        .map_err(|err| Error::from_reason(err.to_string()))?;

    let mut arr = env.create_array(families.len() as u32)?;

    for (i, family) in families.into_iter().enumerate() {
        arr.set(i as u32, family)?;
    }

    Ok(arr)
}
