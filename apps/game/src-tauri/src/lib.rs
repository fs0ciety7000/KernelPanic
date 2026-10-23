// The desktop build is a thin shell: the whole game (kernel + desktop) runs in the WebView.
// No native command is exposed to the frontend (see capabilities/default.json).

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .run(tauri::generate_context!())
        .expect("error while running Kernel_Panic");
}
