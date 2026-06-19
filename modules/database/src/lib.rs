#![deny(clippy::all)]

use std::{cmp::Ordering, time::Instant};

use napi::{
    bindgen_prelude::{Array, Object, ToNapiValue},
    Env, Error, Result, Unknown,
};
use napi_derive::napi;
use rusqlite::{fallible_iterator::FallibleIterator, types::Value, Batch, Connection};

use crate::values::{js_to_rusqlite_value, value_ref_to_js_string};

mod collation;
mod values;

#[napi]
pub struct Database {
    conn: Connection,
}

#[napi]
impl Database {
    #[napi(constructor)]
    pub fn new(path: String) -> Result<Self> {
        let conn = Connection::open(path).map_err(|err| Error::from_reason(err.to_string()))?;

        // Register custom collations so SQL referencing COLLATE pinyin_desc / pinyin_asc works.
        let _ = conn.create_collation("pinyin_desc", |a: &str, b: &str| -> Ordering {
            collation::compare_pinyin(a, b).reverse()
        });
        let _ = conn.create_collation("pinyin_asc", collation::compare_pinyin);

        Ok(Self { conn })
    }

    /// Execute a single SQL statement with named parameters.
    #[napi(ts_return_type = "[number, Record<string, string>[]]")]
    pub fn exec_named<'env>(
        &self,
        env: &'env Env,
        sql: String,
        #[napi(ts_arg_type = "Record<string, unknown>")] parameters: Object,
    ) -> Result<Array<'env>> {
        let keys = Object::keys(&parameters)?;
        let mut param_values: Vec<(String, Value)> = Vec::with_capacity(keys.len());

        for raw_key in keys {
            let val = parameters.get::<Unknown>(&raw_key)?.unwrap();
            let key =
                if raw_key.starts_with(':') || raw_key.starts_with('@') || raw_key.starts_with('$')
                {
                    raw_key
                } else {
                    format!(":{}", raw_key)
                };
            let rusqlite_val = js_to_rusqlite_value(val)?;
            param_values.push((key, rusqlite_val));
        }

        let param_refs: Vec<(&str, &dyn rusqlite::types::ToSql)> = param_values
            .iter()
            .map(|(k, v)| (k.as_str(), v as &dyn rusqlite::types::ToSql))
            .collect();

        let mut stmt = self
            .conn
            .prepare(&sql)
            .map_err(|err| Error::from_reason(err.to_string()))?;

        let column_count = stmt.column_count();
        let mut column_names = Vec::with_capacity(column_count);
        for i in 0..column_count {
            let name = stmt.column_name(i).map_err(|err| {
                Error::from_reason(format!("Failed to get column name for index{}: {}", i, err))
            })?;
            column_names.push(name.to_string());
        }

        let prev_changes = self.conn.total_changes();

        let mut rows = stmt.query(&param_refs[..]).map_err(|err| {
            Error::from_reason(format!("Failed to execute SQL: {} - {}", err, sql))
        })?;

        let mut results = Vec::new();
        while let Ok(Some(row)) = rows.next() {
            let mut row_obj = Object::new(env)?;
            for (i, col_name) in column_names.iter().enumerate() {
                let val = row.get_ref(i).unwrap();
                row_obj.set(col_name, value_ref_to_js_string(env, val))?;
            }
            results.push(row_obj);
        }

        let row_affected = self.conn.total_changes() - prev_changes;

        let mut result = env.create_array(2)?;
        result.set(0, row_affected as f64)?;

        let mut result_rows = env.create_array(results.len() as u32)?;
        for (i, row) in results.into_iter().enumerate() {
            result_rows.set(i as u32, row).unwrap();
        }
        result.set(1, result_rows).unwrap();

        Ok(result)
    }

    /// Execute a single SQL statement with positional (`?`) parameters.
    #[napi(ts_return_type = "[number, Record<string, string>[]]")]
    pub fn exec<'env>(
        &self,
        env: &'env Env,
        sql: String,
        parameters: Array,
    ) -> Result<Array<'env>> {
        let mut param_values: Vec<Value> = Vec::with_capacity(parameters.len() as usize);

        for i in 0..parameters.len() {
            let param: Unknown = parameters.get(i)?.unwrap();
            param_values.push(js_to_rusqlite_value(param)?);
        }

        let param_refs: Vec<&dyn rusqlite::types::ToSql> = param_values
            .iter()
            .map(|v| v as &dyn rusqlite::types::ToSql)
            .collect();

        let mut stmt = self
            .conn
            .prepare(&sql)
            .map_err(|err| Error::from_reason(err.to_string()))?;

        let column_count = stmt.column_count();
        let mut column_names = Vec::with_capacity(column_count);
        for i in 0..column_count {
            let name = stmt.column_name(i).map_err(|err| {
                Error::from_reason(format!("Failed to get column name for index{}: {}", i, err))
            })?;
            column_names.push(name.to_string());
        }

        let prev_changes = self.conn.total_changes();

        let mut rows = stmt.query(&param_refs[..]).map_err(|err| {
            Error::from_reason(format!("Failed to execute SQL: {} - {}", err, sql))
        })?;

        let mut results = Vec::new();
        while let Ok(Some(row)) = rows.next() {
            let mut row_obj = Object::new(env)?;
            for (i, col_name) in column_names.iter().enumerate() {
                let val = row.get_ref(i).unwrap();
                row_obj.set(col_name, value_ref_to_js_string(env, val))?;
            }
            results.push(row_obj);
        }

        let row_affected = self.conn.total_changes() - prev_changes;

        let mut result = env.create_array(3)?;
        result.set(0, row_affected as f64)?;

        let mut result_rows = env.create_array(results.len() as u32)?;
        for (i, row) in results.into_iter().enumerate() {
            result_rows.set(i as u32, row).unwrap();
        }
        result.set(1, result_rows).unwrap();

        Ok(result)
    }

    fn execute_sql_impl<'env>(
        env: &'env Env,
        conn: &Connection,
        sql: String,
    ) -> Result<Array<'env>> {
        let t0 = Instant::now();

        let mut batch = Batch::new(conn, &sql);
        let mut results = Vec::new();
        let prev_changes = conn.total_changes();

        let t1 = Instant::now();

        while let Ok(Some(mut stmt)) = batch.next() {
            let column_count = stmt.column_count();
            let mut column_names = Vec::with_capacity(column_count);
            for i in 0..column_count {
                let name = stmt.column_name(i).map_err(|err| {
                    Error::from_reason(format!("Failed to get column name for index{}: {}", i, err))
                })?;
                column_names.push(name.to_string());
            }
            let mut rows = stmt.query([]).map_err(|err| {
                Error::from_reason(format!("Failed to execute SQL: {} - {}", err, sql))
            })?;
            while let Ok(Some(row)) = rows.next() {
                let mut row_obj = Object::new(env)?;
                for (i, col_name) in column_names.iter().enumerate() {
                    let val = row.get_ref(i).unwrap();
                    row_obj.set(col_name, value_ref_to_js_string(env, val))?;
                }
                results.push(row_obj);
            }
        }

        let t2 = Instant::now();

        let row_affected = conn.total_changes() - prev_changes;

        let mut result = env.create_array(3)?;
        result.set(0, 0)?;

        if results.is_empty() {
            result.set(1, ())?; // Undefined
        } else {
            let mut result_rows = env.create_array(results.len() as u32)?;
            for (i, row) in results.into_iter().enumerate() {
                result_rows.set(i as u32, row)?;
            }
            result.set(1, result_rows)?;
        }

        let mut perf = env.create_array(3)?;
        perf.set(0, (t2 - t0).as_millis() as u32).unwrap();
        perf.set(1, (t1 - t0).as_millis() as u32).unwrap();
        perf.set(2, row_affected as f64).unwrap();
        result.set(2, perf).unwrap();

        Ok(result)
    }

    /// Execute SQL string, returns an array of objects representing rows,
    /// and an array of performance info (total time, execution time, rows affected).
    ///
    /// For NCM, not intended for Open Orpheus.
    #[napi(ts_return_type = "[number, Record<string, string>[], [number, number, number]]")]
    pub fn execute_sql<'env>(&self, env: &'env Env, sql: String) -> Result<Array<'env>> {
        Database::execute_sql_impl(env, &self.conn, sql)
    }

    /// Execute a SQL contains multiple statements as one transaction.
    ///
    /// For NCM, not intended for Open Orpheus.
    #[napi(ts_return_type = "[number, Record<string, string>[], [number, number, number]]")]
    pub fn execute_transaction<'env>(
        &mut self,
        env: &'env Env,
        sql: String,
    ) -> Result<Array<'env>> {
        let tx = self
            .conn
            .transaction()
            .map_err(|err| Error::from_reason(err.to_string()))?;
        let ret = Database::execute_sql_impl(env, &tx, sql)?;
        tx.commit()
            .map_err(|err| Error::from_reason(err.to_string()))?;
        Ok(ret)
    }

    /// Execute multiple SQL statements inside an array, returns values of the last statement as an array.
    ///
    /// ## Example return
    /// ```json
    /// {
    ///    "value": [
    ///        [
    ///            "a",
    ///            "b"
    ///        ]
    ///}
    /// ```
    ///
    /// For NCM, not intended for Open Orpheus.
    #[napi(ts_return_type = "{ value: unknown[][] }")]
    pub fn execute_sqls<'env>(
        &self,
        env: &'env Env,
        #[napi(ts_arg_type = "string[]")] sqls: Array,
    ) -> Result<Object<'env>> {
        let mut stmts = Vec::with_capacity(sqls.len() as usize);

        for i in 0..sqls.len() {
            let sql: String = sqls.get(i)?.unwrap();
            stmts.push(sql);
        }

        let mut value: Option<Unknown> = None;
        for (i, sql) in stmts.iter().enumerate() {
            let mut stmt = self.conn.prepare(sql).map_err(|err| {
                Error::from_reason(format!("Failed to execute SQL: {} - {}", err, sql))
            })?;
            if i != stmts.len() - 1 {
                // For all statements except the last one, we just execute them without fetching results
                let _ = stmt.query([]).map_err(|err| {
                    Error::from_reason(format!(
                        "Failed to execute SQL statement: {} - {}",
                        err, sql
                    ))
                })?;
            } else {
                // For the last statement, we execute it and fetch results
                let column_count = stmt.column_count();
                let mut rows = stmt.query([]).map_err(|err| {
                    Error::from_reason(format!(
                        "Failed to execute SQL statement: {} - {}",
                        err, sql
                    ))
                })?;
                let mut results = Vec::new();
                while let Ok(Some(row)) = rows.next() {
                    let mut row_arr = env.create_array(column_count as u32)?;
                    for i in 0..column_count {
                        let val = row.get_ref(i).unwrap();
                        let js_val = value_ref_to_js_string(env, val)?;
                        row_arr.set(i as u32, js_val)?;
                    }
                    results.push(row_arr);
                }
                if results.is_empty() {
                    value = Some(().into_unknown(env)?); // Undefined
                } else {
                    let mut result_array = env.create_array(results.len() as u32)?;
                    for (i, row) in results.into_iter().enumerate() {
                        result_array.set(i as u32, row).unwrap();
                    }
                    value = Some(result_array.into_unknown(env)?);
                }
            }
        }

        let mut result = Object::new(env)?;
        result.set("value", value.unwrap()).unwrap();
        Ok(result)
    }
}
