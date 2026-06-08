const PI2: f32 = std::f32::consts::PI * 2.0;

pub(crate) fn sanitize_sample_rate(sample_rate: f32) -> f32 {
    if sample_rate.is_finite() && sample_rate >= 8_000.0 {
        sample_rate
    } else {
        44_100.0
    }
}

pub(crate) fn clamp(value: f32, min: f32, max: f32) -> f32 {
    value.max(min).min(max)
}

pub(crate) fn ms_to_samples(ms: f32, sample_rate: f32) -> usize {
    ((ms.max(0.0) * sample_rate) / 1000.0).round() as usize
}

pub(crate) fn one_pole_coeff(cutoff_hz: f32, sample_rate: f32) -> f32 {
    let cutoff = clamp(cutoff_hz, 20.0, sample_rate * 0.45);
    1.0 - (-PI2 * cutoff / sample_rate).exp()
}

pub(crate) fn pan_gains(pan: f32) -> (f32, f32) {
    let pan = clamp(pan, -1.0, 1.0);
    (((1.0 - pan) * 0.5).sqrt(), ((1.0 + pan) * 0.5).sqrt())
}
