fn main() {
    tauri_build::build();
    if std::env::var("CARGO_CFG_TARGET_OS").as_deref() == Ok("windows")
        && std::env::var("CARGO_CFG_TARGET_ENV").as_deref() == Ok("msvc")
    {
        // Tauri links its resource into the application binary, not lib test
        // harnesses. Make the SAME resource available to the cfg(test) link
        // below; do not emit a second manifest into production executables.
        let out = std::path::PathBuf::from(std::env::var_os("OUT_DIR").expect("Cargo OUT_DIR"));
        std::fs::copy(out.join("resource.lib"), out.join("vela_test_manifest.lib"))
            .expect("copy Tauri resource for the test harness");
        println!("cargo:rustc-link-search=native={}", out.display());
    }
}
