//! Opt-in city weather. Only fixed Open-Meteo endpoints are contacted.
use serde_json::Value;
use std::io::Read;
fn request(url: &str, query: &[(&str, String)]) -> Result<Value, String> {
    let agent = ureq::AgentBuilder::new()
        .timeout(std::time::Duration::from_secs(10))
        .build();
    let mut req = agent.get(url);
    for (key, value) in query {
        req = req.query(key, value);
    }
    let response = req
        .call()
        .map_err(|_| "weather request failed".to_string())?;
    let mut bytes = Vec::new();
    response
        .into_reader()
        .take(256 * 1024)
        .read_to_end(&mut bytes)
        .map_err(|_| "weather response failed".to_string())?;
    serde_json::from_slice(&bytes).map_err(|_| "invalid weather response".to_string())
}
pub fn search(city: &str) -> Result<Vec<Value>, String> {
    let city = city.trim();
    if city.is_empty() || city.len() > 400 {
        return Err("invalid city".into());
    }
    let data = request(
        "https://geocoding-api.open-meteo.com/v1/search",
        &[("name", city.into()), ("count", "5".into())],
    )?;
    Ok(data
        .get("results")
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default())
}
pub fn current(latitude: f64, longitude: f64) -> Result<Value, String> {
    if !latitude.is_finite()
        || !longitude.is_finite()
        || !(-90.0..=90.0).contains(&latitude)
        || !(-180.0..=180.0).contains(&longitude)
    {
        return Err("invalid coordinates".into());
    }
    request(
        "https://api.open-meteo.com/v1/forecast",
        &[
            ("latitude", latitude.to_string()),
            ("longitude", longitude.to_string()),
            ("current", "temperature_2m,weather_code".into()),
        ],
    )?
    .get("current")
    .cloned()
    .ok_or_else(|| "weather unavailable".into())
}
#[cfg(test)]
mod tests {
    #[test]
    fn rejects_invalid_coordinates_before_network() {
        assert!(super::current(f64::NAN, 0.0).is_err());
        assert!(super::current(91.0, 0.0).is_err());
        assert!(super::current(0.0, -181.0).is_err());
        assert!(super::search(" ").is_err());
    }
}
