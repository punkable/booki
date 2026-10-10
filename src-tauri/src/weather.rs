//! Opt-in city weather. Only fixed Open-Meteo endpoints are contacted.
use serde_json::Value;
use std::io::Read;
fn request(url: &str, query: &[(&str, String)]) -> Result<Value, String> {
    let agent: ureq::Agent = ureq::Agent::config_builder()
        .timeout_global(Some(std::time::Duration::from_secs(10)))
        .build()
        .into();
    let mut req = agent.get(url);
    for (key, value) in query {
        req = req.query(key, value);
    }
    let mut response = req
        .call()
        .map_err(|_| "weather request failed".to_string())?;
    let mut bytes = Vec::new();
    response
        .body_mut()
        .as_reader()
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
fn check_coordinates(latitude: f64, longitude: f64) -> Result<(), String> {
    if !latitude.is_finite()
        || !longitude.is_finite()
        || !(-90.0..=90.0).contains(&latitude)
        || !(-180.0..=180.0).contains(&longitude)
    {
        return Err("invalid coordinates".into());
    }
    Ok(())
}
pub fn current(latitude: f64, longitude: f64) -> Result<Value, String> {
    check_coordinates(latitude, longitude)?;
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
/// Hours shown after the current one, and days shown after today.
const FORECAST_HOURS: usize = 6;
const FORECAST_DAYS: usize = 3;
/// Now, today's range, the next hours and the next days for the weather panel.
/// Times stay in the city's own time zone, as Open-Meteo returns them.
pub fn forecast(latitude: f64, longitude: f64) -> Result<Value, String> {
    check_coordinates(latitude, longitude)?;
    let data = request(
        "https://api.open-meteo.com/v1/forecast",
        &[
            ("latitude", latitude.to_string()),
            ("longitude", longitude.to_string()),
            ("current", "temperature_2m,weather_code,is_day".into()),
            (
                "hourly",
                "temperature_2m,weather_code,precipitation_probability,is_day".into(),
            ),
            (
                "daily",
                "weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max"
                    .into(),
            ),
            ("timezone", "auto".into()),
            ("forecast_days", (FORECAST_DAYS + 1).to_string()),
            ("forecast_hours", (FORECAST_HOURS + 2).to_string()),
        ],
    )?;
    summarize(&data)
}
fn column<'a>(data: &'a Value, block: &str, key: &str) -> &'a [Value] {
    data.get(block)
        .and_then(|block| block.get(key))
        .and_then(Value::as_array)
        .map_or(&[], Vec::as_slice)
}
fn summarize(data: &Value) -> Result<Value, String> {
    let current = data.get("current").ok_or("weather unavailable")?;
    let now_time = current.get("time").and_then(Value::as_str).unwrap_or("");
    let hour_times = column(data, "hourly", "time");
    let hours: Vec<Value> = hour_times
        .iter()
        .enumerate()
        // ISO local times compare correctly as text.
        .filter(|(_, time)| time.as_str().is_some_and(|time| time > now_time))
        .take(FORECAST_HOURS)
        .map(|(i, time)| {
            serde_json::json!({
                "time": time,
                "temperature": column(data, "hourly", "temperature_2m").get(i),
                "code": column(data, "hourly", "weather_code").get(i),
                "precipitation": column(data, "hourly", "precipitation_probability").get(i),
                "isDay": column(data, "hourly", "is_day").get(i),
            })
        })
        .collect();
    let day = |i: usize| {
        serde_json::json!({
            "date": column(data, "daily", "time").get(i),
            "code": column(data, "daily", "weather_code").get(i),
            "max": column(data, "daily", "temperature_2m_max").get(i),
            "min": column(data, "daily", "temperature_2m_min").get(i),
            "precipitation": column(data, "daily", "precipitation_probability_max").get(i),
        })
    };
    let day_count = column(data, "daily", "time").len();
    Ok(serde_json::json!({
        "now": {
            "temperature": current.get("temperature_2m"),
            "code": current.get("weather_code"),
            "isDay": current.get("is_day"),
        },
        "today": if day_count > 0 { day(0) } else { Value::Null },
        "hours": hours,
        "days": (1..day_count).take(FORECAST_DAYS).map(day).collect::<Vec<_>>(),
    }))
}
#[cfg(test)]
mod tests {
    #[test]
    fn rejects_invalid_coordinates_before_network() {
        assert!(super::current(f64::NAN, 0.0).is_err());
        assert!(super::current(91.0, 0.0).is_err());
        assert!(super::current(0.0, -181.0).is_err());
        assert!(super::search(" ").is_err());
        assert!(super::forecast(f64::INFINITY, 0.0).is_err());
    }
    #[test]
    fn summarizes_the_next_hours_and_days() {
        let data = serde_json::json!({
            "current": { "time": "2026-10-10T17:15", "temperature_2m": 21.4, "weather_code": 2, "is_day": 1 },
            "hourly": {
                "time": ["2026-10-10T17:00", "2026-10-10T18:00", "2026-10-10T19:00"],
                "temperature_2m": [21.0, 20.0, 18.5],
                "weather_code": [2, 3, 61],
                "precipitation_probability": [0, 10, 70],
                "is_day": [1, 1, 0]
            },
            "daily": {
                "time": ["2026-10-10", "2026-10-11", "2026-10-12"],
                "weather_code": [2, 61, 0],
                "temperature_2m_max": [24.0, 19.0, 26.0],
                "temperature_2m_min": [12.0, 11.0, 13.0],
                "precipitation_probability_max": [10, 80, 0]
            }
        });
        let summary = super::summarize(&data).unwrap();
        assert_eq!(summary["now"]["temperature"], 21.4);
        assert_eq!(summary["today"]["max"], 24.0);
        let hours = summary["hours"].as_array().unwrap();
        assert_eq!(hours.len(), 2, "the hour already under way is skipped");
        assert_eq!(hours[0]["time"], "2026-10-10T18:00");
        assert_eq!(hours[1]["precipitation"], 70);
        let days = summary["days"].as_array().unwrap();
        assert_eq!(days.len(), 2, "today is reported separately");
        assert_eq!(days[0]["date"], "2026-10-11");
        assert_eq!(days[0]["min"], 11.0);
    }
    #[test]
    fn missing_blocks_do_not_panic() {
        assert!(super::summarize(&serde_json::json!({})).is_err());
        let summary = super::summarize(&serde_json::json!({ "current": {} })).unwrap();
        assert!(summary["today"].is_null());
        assert!(summary["hours"].as_array().unwrap().is_empty());
    }
}
