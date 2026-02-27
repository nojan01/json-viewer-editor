fn main() {
  // Tell Cargo to rerun this build script whenever frontend files change
  println!("cargo:rerun-if-changed=../web/index.html");
  tauri_build::build()
}
