use wasm_bindgen::prelude::*;

use crate::utils::{clamp, ms_to_samples, one_pole_coeff, pan_gains, sanitize_sample_rate};

#[derive(Clone, Copy)]
struct ErTap {
    delay_samples: usize,
    gain: f32,
    pan: f32,
    lpf_l: f32,
    lpf_r: f32,
}

#[wasm_bindgen]
pub struct EarlyReflections {
    taps: Vec<ErTap>,
    delay: Vec<f32>,
    write: usize,
    sample_rate: f32,
    pattern: i32,
    rsize: f32,
    sdelay_ms: f32,
    lpf_coeff: f32,
    max_delay_samples: usize,
}

#[wasm_bindgen]
impl EarlyReflections {
    #[wasm_bindgen(constructor)]
    pub fn new(sample_rate: f32) -> Self {
        let sample_rate = sanitize_sample_rate(sample_rate);
        let max_delay_samples = ms_to_samples(250.0, sample_rate).max(1);
        let mut er = Self {
            taps: Vec::new(),
            delay: vec![0.0; max_delay_samples],
            write: 0,
            sample_rate,
            pattern: 15,
            rsize: 75.0,
            sdelay_ms: 40.0,
            lpf_coeff: one_pole_coeff(6_500.0, sample_rate),
            max_delay_samples,
        };
        er.rebuild_taps();
        er
    }

    /// Process a block of stereo samples.
    ///
    /// `output_l` / `output_r` receive only the early-reflection contribution.
    pub fn process_block(
        &mut self,
        input_l: &[f32],
        input_r: &[f32],
        output_l: &mut [f32],
        output_r: &mut [f32],
    ) {
        let n = input_l
            .len()
            .min(input_r.len())
            .min(output_l.len())
            .min(output_r.len());

        for i in 0..n {
            let mono = (input_l[i] + input_r[i]) * 0.5;
            self.delay[self.write] = mono;

            let mut left = 0.0;
            let mut right = 0.0;
            for tap in &mut self.taps {
                let read = (self.write + self.max_delay_samples
                    - tap.delay_samples.min(self.max_delay_samples - 1))
                    % self.max_delay_samples;
                let sample = self.delay[read] * tap.gain;
                let (left_gain, right_gain) = pan_gains(tap.pan);
                let tap_l = sample * left_gain;
                let tap_r = sample * right_gain;

                tap.lpf_l += self.lpf_coeff * (tap_l - tap.lpf_l);
                tap.lpf_r += self.lpf_coeff * (tap_r - tap.lpf_r);
                left += tap.lpf_l;
                right += tap.lpf_r;
            }

            output_l[i] = left;
            output_r[i] = right;

            self.write += 1;
            if self.write >= self.max_delay_samples {
                self.write = 0;
            }
        }
    }

    /// Configure the early-reflection pattern.
    ///
    /// Known values: 15 = generic, 23 = room, 24 = bathroom.
    pub fn set_pattern(&mut self, pattern: i32, rsize: f32) {
        self.pattern = pattern;
        self.rsize = clamp(rsize, 10.0, 140.0);
        self.rebuild_taps();
    }

    /// Set the starting delay offset applied to all taps.
    pub fn set_sdelay(&mut self, sdelay_ms: f32) {
        self.sdelay_ms = clamp(sdelay_ms, 0.0, 160.0);
        self.rebuild_taps();
    }
}

impl EarlyReflections {
    fn rebuild_taps(&mut self) {
        let scale = clamp(self.rsize / 75.0, 0.35, 1.9);
        let specs: &[(f32, f32, f32)] = match self.pattern {
            23 => &[
                (1.5, 0.34, -0.74),
                (5.8, 0.31, 0.62),
                (11.4, 0.27, -0.38),
                (17.9, 0.24, 0.36),
                (26.2, 0.20, -0.92),
                (36.8, 0.17, 0.86),
                (49.3, 0.14, -0.18),
                (64.0, 0.12, 0.22),
            ],
            24 => &[
                (0.8, 0.62, -0.55),
                (6.7, 0.48, 0.50),
                (15.1, 0.34, -0.10),
                (28.6, 0.24, 0.72),
            ],
            _ => &[
                (2.0, 0.32, -0.72),
                (8.9, 0.28, 0.58),
                (18.6, 0.23, -0.35),
                (31.4, 0.19, 0.42),
                (47.0, 0.15, -0.85),
                (66.0, 0.11, 0.75),
            ],
        };

        self.taps = specs
            .iter()
            .map(|(delay_ms, gain, pan)| ErTap {
                delay_samples: ms_to_samples(self.sdelay_ms + delay_ms * scale, self.sample_rate)
                    .clamp(1, self.max_delay_samples - 1),
                gain: *gain,
                pan: *pan,
                lpf_l: 0.0,
                lpf_r: 0.0,
            })
            .collect();
    }
}
