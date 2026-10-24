// Prevents an additional console window on Windows in release builds.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    // AI agents call Booki as their status line and hooks: answer and exit
    // before any window or single-instance check exists.
    if booki_dock_lib::agent_cli() {
        return;
    }
    booki_dock_lib::run();
}
