use wasm_bindgen::prelude::*;

use crate::utils::{clamp, ms_to_samples, one_pole_coeff, pan_gains, sanitize_sample_rate};

const FDN_CHANNELS: usize = 8;
const MAX_DELAY_SECONDS: f32 = 2.0;

const HADAMARD_8: [[f32; FDN_CHANNELS]; FDN_CHANNELS] = [
    [1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0],
    [1.0, -1.0, 1.0, -1.0, 1.0, -1.0, 1.0, -1.0],
    [1.0, 1.0, -1.0, -1.0, 1.0, 1.0, -1.0, -1.0],
    [1.0, -1.0, -1.0, 1.0, 1.0, -1.0, -1.0, 1.0],
    [1.0, 1.0, 1.0, 1.0, -1.0, -1.0, -1.0, -1.0],
    [1.0, -1.0, 1.0, -1.0, -1.0, 1.0, -1.0, 1.0],
    [1.0, 1.0, -1.0, -1.0, -1.0, -1.0, 1.0, 1.0],
    [1.0, -1.0, -1.0, 1.0, -1.0, 1.0, 1.0, -1.0],
];

const FDN_BASE_DELAYS_MS: [f32; FDN_CHANNELS] = [37.1, 43.7, 53.3, 61.1, 71.9, 83.9, 97.3, 113.0];
const FDN_PANS: [f32; FDN_CHANNELS] = [-0.88, 0.82, -0.35, 0.48, -0.68, 0.28, 0.94, -0.12];

#[derive(Clone)]
struct Allpass {
    buffer: Vec<f32>,
    write: usize,
    coeff: f32,
}

impl Allpass {
    fn new(delay_samples: usize, coeff: f32) -> Self {
        Self {
            buffer: vec![0.0; delay_samples.max(1)],
            write: 0,
            coeff,
        }
    }

    fn set_coeff(&mut self, coeff: f32) {
        self.coeff = clamp(coeff, 0.0, 0.85);
    }

    fn process(&mut self, input: f32) -> f32 {
        let delayed = self.buffer[self.write];
        let output = delayed - self.coeff * input;
        self.buffer[self.write] = input + self.coeff * output;
        self.write += 1;
        if self.write >= self.buffer.len() {
            self.write = 0;
        }
        output
    }
}

#[wasm_bindgen]
pub struct FdnReverb {
    delay_lines: [Vec<f32>; FDN_CHANNELS],
    delay_lengths: [usize; FDN_CHANNELS],
    write_ptrs: [usize; FDN_CHANNELS],
    lpf_state: [f32; FDN_CHANNELS],
    lpf_coeff: f32,
    feedback_gains: [f32; FDN_CHANNELS],
    pre_delay: Vec<f32>,
    pre_delay_len: usize,
    pre_delay_ptr: usize,
    diffusers: [Allpass; 4],
    diffusion_mix: f32,
    output_width: f32,
    density: f32,
    quality: f32,
    decay: f32,
    rshape: f32,
    sample_rate: f32,
    max_delay_samples: usize,
}

#[wasm_bindgen]
impl FdnReverb {
    #[wasm_bindgen(constructor)]
    pub fn new(sample_rate: f32) -> Self {
        let sample_rate = sanitize_sample_rate(sample_rate);
        let max_delay_samples = (sample_rate * MAX_DELAY_SECONDS).ceil() as usize + 1;
        let delay_lines = std::array::from_fn(|_| vec![0.0; max_delay_samples]);
        let mut rvb = Self {
            delay_lines,
            delay_lengths: [1; FDN_CHANNELS],
            write_ptrs: [0; FDN_CHANNELS],
            lpf_state: [0.0; FDN_CHANNELS],
            lpf_coeff: one_pole_coeff(8_000.0, sample_rate),
            feedback_gains: [0.72; FDN_CHANNELS],
            pre_delay: vec![0.0; max_delay_samples],
            pre_delay_len: ms_to_samples(25.0, sample_rate).min(max_delay_samples - 1),
            pre_delay_ptr: 0,
            diffusers: [
                Allpass::new(ms_to_samples(4.7, sample_rate), 0.55),
                Allpass::new(ms_to_samples(8.3, sample_rate), 0.55),
                Allpass::new(ms_to_samples(12.9, sample_rate), 0.55),
                Allpass::new(ms_to_samples(17.1, sample_rate), 0.55),
            ],
            diffusion_mix: 1.0,
            output_width: 1.8,
            density: 80.0,
            quality: 8.0,
            decay: 1.2,
            rshape: 100.0,
            sample_rate,
            max_delay_samples,
        };
        rvb.set_hf_damping(2.25);
        rvb.update_delay_lengths();
        rvb.update_feedback_gains();
        rvb
    }

    /// Process a block of stereo samples.
    ///
    /// `input_l` / `input_r`: input frames.
    /// `output_l` / `output_r`: wet output only, without dry signal.
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
            let (left, right) = self.process_frame(input_l[i], input_r[i]);
            output_l[i] = left;
            output_r[i] = right;
        }
    }

    pub fn set_decay(&mut self, dtime: f32) {
        self.decay = clamp(dtime, 0.15, 12.0);
        self.update_feedback_gains();
    }

    pub fn set_hf_damping(&mut self, damping: f32) {
        let norm = clamp((damping - 2.0) / 1.5, 0.0, 1.0);
        let cutoff = 12_000.0 * (1.0 - norm) + 1_700.0 * norm;
        self.lpf_coeff = one_pole_coeff(cutoff, self.sample_rate);
    }

    pub fn set_density(&mut self, density: f32) {
        self.density = clamp(density, 0.0, 100.0);
        self.update_delay_lengths();
        self.update_feedback_gains();
    }

    pub fn set_diffusion(&mut self, diffusion: f32) {
        let norm = clamp(diffusion / 100.0, 0.0, 1.0);
        self.diffusion_mix = norm;
        let coeff = 0.18 + norm * 0.55;
        for diffuser in &mut self.diffusers {
            diffuser.set_coeff(coeff);
        }
    }

    pub fn set_rshape(&mut self, rshape: f32) {
        self.rshape = clamp(rshape, 0.0, 120.0);
        self.update_delay_lengths();
        self.update_feedback_gains();
    }

    pub fn set_swidth(&mut self, swidth: f32) {
        self.output_width = clamp(swidth / 100.0, 0.35, 2.2);
    }

    pub fn set_pre_delay(&mut self, pdelay_ms: f32) {
        let len = ms_to_samples(pdelay_ms, self.sample_rate);
        self.pre_delay_len = len.min(self.max_delay_samples - 1);
        if self.pre_delay_ptr >= self.pre_delay_len.max(1) {
            self.pre_delay_ptr = 0;
        }
    }

    pub fn set_q(&mut self, q: f32) {
        self.quality = clamp(q, 6.0, 8.0);
        self.update_delay_lengths();
        self.update_feedback_gains();
    }
}

impl FdnReverb {
    fn process_frame(&mut self, left: f32, right: f32) -> (f32, f32) {
        let active_channels = self.active_channels();
        let mono = (left + right) * 0.5;
        let delayed_input = self.process_pre_delay(mono);
        let diffused_input = self.process_diffusion(delayed_input);

        let mut delayed = [0.0; FDN_CHANNELS];
        for (ch, out) in delayed.iter_mut().enumerate().take(active_channels) {
            let ptr = self.write_ptrs[ch];
            let raw = self.delay_lines[ch][ptr];
            let filtered = self.lpf_state[ch] + self.lpf_coeff * (raw - self.lpf_state[ch]);
            self.lpf_state[ch] = filtered;
            *out = filtered;
        }

        let matrix_scale = 1.0 / (active_channels as f32).sqrt();
        for (ch, row) in HADAMARD_8.iter().enumerate().take(active_channels) {
            let mut feedback = 0.0;
            for (coeff, delayed_sample) in row.iter().zip(delayed.iter()).take(active_channels) {
                feedback += *coeff * *delayed_sample;
            }
            let input_gain = if ch & 1 == 0 { 0.18 } else { -0.18 };
            let sample =
                diffused_input * input_gain + feedback * matrix_scale * self.feedback_gains[ch];
            let ptr = self.write_ptrs[ch];
            self.delay_lines[ch][ptr] = clamp(sample, -8.0, 8.0);
        }

        for ch in 0..active_channels {
            self.write_ptrs[ch] += 1;
            if self.write_ptrs[ch] >= self.delay_lengths[ch] {
                self.write_ptrs[ch] = 0;
            }
        }

        let mut out_l = 0.0;
        let mut out_r = 0.0;
        for ch in 0..active_channels {
            let pan = FDN_PANS[ch] * self.output_width;
            let (left_gain, right_gain) = pan_gains(pan);
            out_l += delayed[ch] * left_gain;
            out_r += delayed[ch] * right_gain;
        }

        let active_trim = (active_channels as f32 / FDN_CHANNELS as f32).sqrt();
        let trim = 0.27 * active_trim / (1.0 + (self.output_width - 1.0).max(0.0) * 0.2);
        (out_l * trim, out_r * trim)
    }

    fn process_pre_delay(&mut self, input: f32) -> f32 {
        if self.pre_delay_len == 0 {
            return input;
        }

        let output = self.pre_delay[self.pre_delay_ptr];
        self.pre_delay[self.pre_delay_ptr] = input;
        self.pre_delay_ptr += 1;
        if self.pre_delay_ptr >= self.pre_delay_len {
            self.pre_delay_ptr = 0;
        }
        output
    }

    fn process_diffusion(&mut self, input: f32) -> f32 {
        if self.diffusion_mix <= 0.001 {
            return input;
        }

        let mut wet = input;
        for diffuser in &mut self.diffusers {
            wet = diffuser.process(wet);
        }
        input * (1.0 - self.diffusion_mix) + wet * self.diffusion_mix
    }

    fn update_delay_lengths(&mut self) {
        let density_norm = self.density / 100.0;
        let quality_norm = (self.quality - 6.0) / 2.0;
        let density_scale = 1.18 - density_norm * 0.28 - quality_norm * 0.04;
        let room_scale = 0.72 + (self.rshape / 100.0) * 0.58;

        for (ch, base_ms) in FDN_BASE_DELAYS_MS.iter().enumerate() {
            let modulation = 1.0 + (ch as f32 - 3.5) * 0.012 * (self.rshape / 100.0);
            let len = ms_to_samples(
                base_ms * density_scale * room_scale * modulation,
                self.sample_rate,
            )
            .clamp(2, self.max_delay_samples - 1);
            self.delay_lengths[ch] = len;
            if self.write_ptrs[ch] >= len {
                self.write_ptrs[ch] = 0;
            }
        }
    }

    fn update_feedback_gains(&mut self) {
        for ch in 0..FDN_CHANNELS {
            let delay_seconds = self.delay_lengths[ch] as f32 / self.sample_rate;
            let gain = 10.0_f32.powf(-3.0 * delay_seconds / self.decay);
            self.feedback_gains[ch] = clamp(gain, 0.0, 0.997);
        }
    }

    fn active_channels(&self) -> usize {
        if self.quality < 6.5 {
            6
        } else if self.quality < 7.5 {
            7
        } else {
            FDN_CHANNELS
        }
    }
}
