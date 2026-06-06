/// Average two aligned frames. Averaging (not summing) means two full-scale
/// signals never exceed ±1.0 — no clipping, no sum-then-clamp distortion.
pub fn mix(sys: &[f32], mic: &[f32]) -> Vec<f32> {
    sys.iter().zip(mic).map(|(s, m)| 0.5 * s + 0.5 * m).collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn averages_and_never_clips() {
        let sys = vec![1.0f32; 16];
        let mic = vec![1.0f32; 16];
        let out = mix(&sys, &mic);
        for s in &out {
            assert!(*s <= 1.0, "sample {s} exceeds +1.0");
            assert!(*s >= -1.0, "sample {s} below -1.0");
            assert!((*s - 1.0).abs() < 1e-6, "expected 1.0, got {s}");
        }
    }

    #[test]
    fn full_negative_scale_no_clip() {
        let sys = vec![-1.0f32; 8];
        let mic = vec![-1.0f32; 8];
        let out = mix(&sys, &mic);
        for s in &out {
            assert!((*s - (-1.0)).abs() < 1e-6);
        }
    }

    #[test]
    fn mixed_polarity() {
        let sys = vec![0.8f32; 4];
        let mic = vec![-0.4f32; 4];
        let out = mix(&sys, &mic);
        // 0.5*0.8 + 0.5*(-0.4) = 0.4 - 0.2 = 0.2
        for s in &out {
            assert!((*s - 0.2).abs() < 1e-6, "got {s}");
        }
    }
}
