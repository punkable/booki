//! CSS-compatible corner normalization for the native material clip.
pub type MaterialShape = (f64, f64, f64, f64, f64, f64, f64, f64);

/// Round the two physical edges, rather than rounding CSS dimensions first.
#[cfg(any(windows, test))]
pub fn physical_bounds(x: f64, y: f64, width: f64, height: f64, dpr: f64) -> (i32, i32, i32, i32) {
    let px = |value: f64| (value * dpr).round() as i32;
    let (left, top) = (px(x), px(y));
    (
        left,
        top,
        px(x + width).saturating_sub(left).max(1),
        px(y + height).saturating_sub(top).max(1),
    )
}

/// Corner radii scaled down like CSS does when they overflow the box.
#[cfg(any(windows, test))]
fn normalized_radii(w: f64, h: f64, radii: [i32; 4]) -> [f64; 4] {
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
    r
}

/// How far (left, top, right, bottom, in physical px) to pull the blur in
/// from a rounded shape's edges so its square corners stay inside the curve.
///
/// Windows ignores the window region for the blur-behind effect, so the blur
/// always fills its whole rectangle. Left at the shape's full size, its square
/// corners showed past the rounded CSS edge as a rectangle inside the bar,
/// clearest on dark glass. A corner of radius r clears the curve once the
/// rectangle is inset by r·(1 − 1/√2) on both of its sides.
#[cfg(any(windows, test))]
pub fn blur_insets(width: i32, height: i32, radii: [i32; 4]) -> [i32; 4] {
    let (w, h) = (width.max(1) as f64, height.max(1) as f64);
    let r = normalized_radii(w, h, radii);
    let k = 1.0 - std::f64::consts::FRAC_1_SQRT_2;
    let inset = |a: f64, b: f64| (a.max(b) * k).ceil() as i32;
    let [mut left, mut top, mut right, mut bottom] = [
        inset(r[0], r[3]),
        inset(r[0], r[1]),
        inset(r[1], r[2]),
        inset(r[3], r[2]),
    ];
    // Never collapse a small shape to nothing.
    if left + right >= width {
        left = 0;
        right = 0;
    }
    if top + bottom >= height {
        top = 0;
        bottom = 0;
    }
    [left, top, right, bottom]
}

#[cfg(any(windows, test))]
pub fn outline(width: i32, height: i32, radii: [i32; 4]) -> Vec<(i32, i32)> {
    let (w, h) = (width.max(1) as f64, height.max(1) as f64);
    let r = normalized_radii(w, h, radii);
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
    fn fractional_dpi_rounds_edges_without_shrinking_or_expanding_the_surface() {
        for dpr in [1.0, 1.25, 1.5, 1.75, 2.0] {
            for x in [0.4, 18.25, -15.75] {
                let (left, top, width, height) = physical_bounds(x, 9.4, 50.4, 23.25, dpr);
                assert_eq!(left + width, ((x + 50.4) * dpr).round() as i32);
                assert_eq!(top + height, ((9.4 + 23.25) * dpr).round() as i32);
            }
        }
        assert_eq!(physical_bounds(0.4, 0.4, 50.4, 20.4, 1.0), (0, 0, 51, 21));
    }
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
    fn blur_stays_inside_rounded_corners() {
        // A 20px bar radius pulls the blur in 6px on every side.
        assert_eq!(blur_insets(400, 64, [20; 4]), [6, 6, 6, 6]);
        // The attached notch keeps its square edge flush.
        assert_eq!(blur_insets(112, 12, [11, 11, 0, 0]), [4, 4, 4, 0]);
        // Square shapes stay whole and tiny ones never collapse.
        assert_eq!(blur_insets(60, 30, [0; 4]), [0; 4]);
        assert_eq!(blur_insets(4, 4, [999; 4]), [1; 4]);
        assert_eq!(blur_insets(1, 1, [999; 4]), [0; 4]);
        // The inset corner point lies inside the corner's circle.
        let [left, top, ..] = blur_insets(300, 80, [24; 4]);
        let (dx, dy) = (24.0 - left as f64, 24.0 - top as f64);
        assert!((dx * dx + dy * dy).sqrt() <= 24.0);
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
