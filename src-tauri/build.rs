fn main() {
    println!("cargo:rerun-if-env-changed=BOOKI_EDITION");
    println!("cargo::rustc-check-cfg=cfg(booki_dev)");
    let dev = std::env::var("BOOKI_EDITION").ok().as_deref() == Some("dev");
    if dev {
        println!("cargo:rustc-cfg=booki_dev");
        println!("cargo:rustc-env=BOOKI_ID=com.booki.dock.dev");
        println!("cargo:rustc-env=BOOKI_DATA=Booki Dev");
        println!("cargo:rustc-env=BOOKI_RUN=Booki Dev");
    } else {
        println!("cargo:rustc-env=BOOKI_ID=com.booki.dock");
        println!("cargo:rustc-env=BOOKI_DATA=Booki");
        println!("cargo:rustc-env=BOOKI_RUN=Booki");
    }
    tauri_build::build()
}
