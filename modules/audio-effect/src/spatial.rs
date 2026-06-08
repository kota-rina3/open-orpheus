use wasm_bindgen::prelude::*;

use crate::utils::{clamp, ms_to_samples, sanitize_sample_rate};

#[wasm_bindgen]
pub struct SpatialEnhancer {
    sample_rate: f32,
    presence_norm: f32,
    stereoizer_norm: f32,
    width_gain: f32,
    mid_gain: f32,
    ambience_gain: f32,
    sshaper: bool,
    haas_delay: Vec<f32>,
    haas_write: usize,
    haas_delay_samples: usize,
    haas_gain: f32,
}

#[wasm_bindgen]
impl SpatialEnhancer {
    #[wasm_bindgen(constructor)]
    pub fn new(sample_rate: f32) -> Self {
        let sample_rate = sanitize_sample_rate(sample_rate);
        let max_haas = ms_to_samples(24.0, sample_rate).max(1);
        Self {
            sample_rate,
            presence_norm: 0.0,
            stereoizer_norm: 0.0,
            width_gain: 1.0,
            mid_gain: 1.0,
            ambience_gain: 1.0,
            sshaper: false,
            haas_delay: vec![0.0; max_haas],
            haas_write: 0,
            haas_delay_samples: ms_to_samples(12.0, sample_rate).clamp(1, max_haas),
            haas_gain: 0.22,
        }
    }

    /// Process a block of stereo samples in place.
    pub fn process_block(&mut self, input_l: &mut [f32], input_r: &mut [f32]) {
        let n = input_l.len().min(input_r.len());
        for i in 0..n {
            let left = input_l[i];
            let right = input_r[i];
            let mut mid = (left + right) * 0.5 * self.mid_gain;
            let mut side = (left - right) * 0.5 * self.width_gain * self.ambience_gain;

            if self.sshaper {
                let read = (self.haas_write + self.haas_delay.len() - self.haas_delay_samples)
                    % self.haas_delay.len();
                let delayed_side = self.haas_delay[read];
                self.haas_delay[self.haas_write] = side;
                self.haas_write += 1;
                if self.haas_write >= self.haas_delay.len() {
                    self.haas_write = 0;
                }

                side += delayed_side * self.haas_gain;
                mid *= 0.98;
            }

            let trim = 1.0 / (1.0 + (self.width_gain - 1.0).max(0.0) * 0.18);
            input_l[i] = (mid + side) * trim;
            input_r[i] = (mid - side) * trim;
        }
    }

    /// Set presence (surround depth, 0-10). Controls mid/side balance.
    pub fn set_presence(&mut self, presence: f32) {
        self.presence_norm = clamp(presence / 10.0, 0.0, 1.0);
        self.update_width();
    }

    /// Set stereoizer (width expansion, 0-10). Controls side gain boost.
    pub fn set_stereoizer(&mut self, stereoizer: f32) {
        self.stereoizer_norm = clamp(stereoizer / 10.0, 0.0, 1.0);
        self.update_width();
    }

    /// Enable/disable stereo shaping (Haas delay).
    pub fn set_sshaper(&mut self, on: bool, sample_rate: f32) {
        let sample_rate = sanitize_sample_rate(sample_rate);
        if (sample_rate - self.sample_rate).abs() > f32::EPSILON {
            self.sample_rate = sample_rate;
            let max_haas = ms_to_samples(24.0, sample_rate).max(1);
            self.haas_delay = vec![0.0; max_haas];
            self.haas_delay_samples = ms_to_samples(12.0, sample_rate).clamp(1, max_haas);
            self.haas_write = 0;
        }
        self.sshaper = on;
    }

    /// Set ambience coefficient.
    pub fn set_ambience(&mut self, ambience: f32) {
        self.ambience_gain = 1.0 + (clamp(ambience, 0.0, 4.0) - 1.0) * 0.06;
    }
}

impl SpatialEnhancer {
    fn update_width(&mut self) {
        self.mid_gain = 1.0 - self.presence_norm * 0.08;
        self.width_gain = 1.0 + self.stereoizer_norm * 0.85 + self.presence_norm * 0.22;
    }
}
