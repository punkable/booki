//! CSS-compatible corner normalization for the native material clip.
pub fn outline(width: i32, height: i32, radii: [i32; 4]) -> Vec<(i32, i32)> {
    let (w, h) = (width.max(1) as f64, height.max(1) as f64);
    let mut r = radii.map(|v| v.max(0) as f64);
    let mut scale = 1.0_f64;
    for (extent, sum) in [
        (w, r[0] + r[1]),
        (w, r[3] + r[2]),
        (h, r[0] + r[3]),
        (h, r[1] + r[2]),
    ] {
        if sum > 0.0 {
            scale = scale.min(extent / sum);
        }
    }
    r.iter_mut().for_each(|v| *v *= scale);
    let corners = [
        (r[0], r[0], r[0], std::f64::consts::PI),
        (w - r[1], r[1], r[1], 1.5 * std::f64::consts::PI),
        (w - r[2], h - r[2], r[2], 0.0),
        (r[3], h - r[3], r[3], 0.5 * std::f64::consts::PI),
    ];
    let mut points = Vec::new();
    for (cx, cy, radius, start) in corners {
        for step in 0..=16 {
            let angle = start + (step as f64 / 16.0) * std::f64::consts::FRAC_PI_2;
            let p = (
                (cx + radius * angle.cos()).round().clamp(0.0, w) as i32,
                (cy + radius * angle.sin()).round().clamp(0.0, h) as i32,
            );
            if points.last() != Some(&p) {
                points.push(p);
            }
        }
    }
    points
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn attached_notch_keeps_its_square_edge() {
        let points = outline(112, 12, [11, 11, 0, 0]);
        assert!(points.contains(&(112, 12)) && points.contains(&(0, 12)));
        assert!(!points.contains(&(0, 0)) && !points.contains(&(112, 0)));
    }
    #[test]
    fn pill_radius_is_normalized_to_the_small_dimension() {
        let points = outline(118, 13, [999; 4]);
        assert!(points.len() > 12);
        assert!(points
            .iter()
            .all(|&(x, y)| (0..=118).contains(&x) && (0..=13).contains(&y)));
        assert!(!points.contains(&(0, 0)));
    }
    #[test]
    fn square_and_dpi_scaled_shapes_preserve_their_bounds() {
        assert_eq!(
            outline(60, 30, [0; 4]),
            vec![(0, 0), (60, 0), (60, 30), (0, 30)]
        );
        for scale in [1, 2, 3] {
            let points = outline(120 * scale, 40 * scale, [20 * scale; 4]);
            assert!(
                points.contains(&(20 * scale, 0)) && points.contains(&(120 * scale, 20 * scale))
            );
        }
    }
}
