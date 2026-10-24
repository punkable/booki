// Prevents an additional console window on Windows in release builds.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    // Claude Code calls Booki as its status line and hooks: answer and exit
    // before any window or single-instance check exists.
    if booki_dock_lib::claude_cli() {
        return;
    }
    booki_dock_lib::run();
}
