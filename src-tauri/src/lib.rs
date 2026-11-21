mod native;
mod formula_packs;

use native::{NativeBridge, NativeOutcome};
use serde::Serialize;
use std::{fs, io::Write, sync::{atomic::{AtomicBool, Ordering}, Mutex}};
use tauri::{menu::{Menu, MenuItem}, tray::TrayIconBuilder, AppHandle, Emitter, Manager, State};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut, ShortcutState};

const DEFAULT_SHORTCUT: &str = "Ctrl+Alt+M";
struct AppState {
    native: NativeBridge,
    shortcut: Mutex<String>,
    registered: Mutex<Option<Shortcut>>,
    error: Mutex<Option<String>>,
    target_ready: AtomicBool,
    opening: AtomicBool,
    last_result: Mutex<Option<String>>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct DesktopStatus { shortcut: String, error: Option<String>, target_ready: bool }

#[tauri::command]
fn desktop_status(state: State<'_, AppState>) -> DesktopStatus {
    DesktopStatus { shortcut: state.shortcut.lock().unwrap().clone(), error: state.error.lock().unwrap().clone(), target_ready: state.target_ready.load(Ordering::SeqCst) }
}

fn config_path(app: &AppHandle) -> Result<std::path::PathBuf, String> {
    let directory = app.path().app_config_dir().map_err(|error| error.to_string())?;
    fs::create_dir_all(&directory).map_err(|error| error.to_string())?;
    Ok(directory.join("shortcut.json"))
}
fn save_shortcut(app: &AppHandle, shortcut: &str) -> Result<(), String> {
    let path = config_path(app)?;
    let temporary = path.with_extension("tmp");
    let mut file = fs::File::create(&temporary).map_err(|error| error.to_string())?;
    file.write_all(serde_json::to_string(shortcut).unwrap().as_bytes()).map_err(|error| error.to_string())?;
    file.sync_all().map_err(|error| error.to_string())?;
    fs::rename(temporary, path).map_err(|error| error.to_string())
}

#[tauri::command]
fn configure_shortcut(app: AppHandle, state: State<'_, AppState>, shortcut: String) -> Result<(), String> {
    if shortcut.len() > 64 { return Err("快捷键过长".into()); }
    let parsed: Shortcut = shortcut.parse().map_err(|_| "快捷键格式不正确")?;
    let mut registered = state.registered.lock().unwrap();
    if registered.as_ref() == Some(&parsed) { return Ok(()); }
    // Register the replacement first; on conflict the old shortcut remains active.
    app.global_shortcut().register(parsed).map_err(|error| format!("快捷键已被占用或无法注册：{error}；原快捷键保持有效"))?;
    if let Err(error) = save_shortcut(&app, &shortcut) {
        let _ = app.global_shortcut().unregister(parsed);
        return Err(format!("设置文件写入失败：{error}；原快捷键保持有效"));
    }
    if let Some(old) = *registered {
        if let Err(error) = app.global_shortcut().unregister(old) {
            let _ = app.global_shortcut().unregister(parsed);
            let _ = save_shortcut(&app, &state.shortcut.lock().unwrap());
            return Err(format!("无法替换旧快捷键：{error}"));
        }
    }
    *registered = Some(parsed);
    *state.shortcut.lock().unwrap() = shortcut;
    *state.error.lock().unwrap() = None;
    Ok(())
}

fn owner(app: &AppHandle) -> Result<usize, String> {
    app.get_webview_window("main").ok_or("编辑窗口不存在")?.hwnd().map(|window| window.0 as usize).map_err(|error| error.to_string())
}

fn validate_output(text: &str) -> Result<(), String> {
    if text.is_empty() || text.len() > 128 * 1024 || text.contains('\0') { return Err("公式为空、过长或含无效字符".into()); }
    Ok(())
}

#[tauri::command]
async fn copy_text(app: AppHandle, state: State<'_, AppState>, text: String) -> Result<NativeOutcome, String> {
    validate_output(&text)?;
    *state.last_result.lock().unwrap() = Some(text.clone());
    let native = state.native.clone(); let owner = owner(&app)?;
    tauri::async_runtime::spawn_blocking(move || native.copy(text, owner)).await.map_err(|error| error.to_string())?
}

#[tauri::command]
async fn submit_text(app: AppHandle, state: State<'_, AppState>, text: String, auto_paste: bool) -> Result<NativeOutcome, String> {
    validate_output(&text)?;
    *state.last_result.lock().unwrap() = Some(text.clone());
    let native = state.native.clone(); let owner = owner(&app)?;
    let window = app.get_webview_window("main").ok_or("编辑窗口不存在")?;
    if !auto_paste {
        let result = tauri::async_runtime::spawn_blocking(move || native.copy(text, owner)).await.map_err(|error| error.to_string())??;
        window.hide().map_err(|error| error.to_string())?;
        let native = state.native.clone();
        let _ = tauri::async_runtime::spawn_blocking(move || native.cancel()).await;
        state.target_ready.store(false, Ordering::SeqCst);
        return Ok(result);
    }
    if !state.target_ready.load(Ordering::SeqCst) {
        return Ok(NativeOutcome { status: "manual", message: state.error.lock().unwrap().clone().unwrap_or_else(|| "请先在普通输入框中使用全局快捷键呼出；当前结果保留，可使用“仅复制”".into()) });
    }
    let preflight_native = native.clone();
    if let Err(error) = tauri::async_runtime::spawn_blocking(move || preflight_native.preflight(owner)).await.map_err(|error| error.to_string())? {
        return Ok(NativeOutcome { status: "manual", message: error });
    }
    window.hide().map_err(|error| error.to_string())?;
    state.target_ready.store(false, Ordering::SeqCst);
    let result = tauri::async_runtime::spawn_blocking(move || native.paste(text, owner)).await.map_err(|error| error.to_string())?;
    match result {
        Ok(result) => Ok(result),
        Err(message) => {
            focus_editor(&window);
            Ok(NativeOutcome { status: "manual", message })
        }
    }
}

#[tauri::command]
async fn cancel_input(app: AppHandle, state: State<'_, AppState>) -> Result<(), String> {
    app.get_webview_window("main").ok_or("编辑窗口不存在")?.hide().map_err(|error| error.to_string())?;
    state.target_ready.store(false, Ordering::SeqCst);
    let native = state.native.clone();
    tauri::async_runtime::spawn_blocking(move || native.cancel()).await.map_err(|error| error.to_string())?
}

fn show_without_target(app: &AppHandle) {
    let state = app.state::<AppState>(); state.target_ready.store(false, Ordering::SeqCst);
    *state.error.lock().unwrap() = None;
    if let Some(window) = app.get_webview_window("main") { focus_editor(&window); }
}

fn tray_menu(app: &AppHandle, english: bool) -> tauri::Result<Menu<tauri::Wry>> {
    let show = MenuItem::with_id(app, "show", if english { "Open Math Input" } else { "打开 Math Input" }, true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", if english { "Exit Math Input" } else { "退出 Math Input" }, true, None::<&str>)?;
    Menu::with_items(app, &[&show, &quit])
}

#[tauri::command]
async fn set_ui_language(app: AppHandle, language: String) -> Result<(), String> {
    let english = language == "en";
    let menu = tray_menu(&app, english).map_err(|error| error.to_string())?;
    if let Some(tray) = app.tray_by_id("editor-tray") {
        tray.set_menu(Some(menu)).map_err(|error| error.to_string())?;
        tray.set_tooltip(Some(if english { "Math Input · Formula editor" } else { "Math Input · 结构化数学输入" })).map_err(|error| error.to_string())?;
    }
    Ok(())
}

fn focus_editor(window: &tauri::WebviewWindow) {
    let _ = window.show();
    let _ = window.set_focus();
    // Window::set_focus does not focus the embedded WebView2 input controller.
    let webview: &tauri::Webview = window.as_ref();
    let _ = webview.set_focus();
    let _ = window.emit("editor-open", ());
}

fn global_shortcut(app: &AppHandle) {
    let state = app.state::<AppState>();
    if state.opening.swap(true, Ordering::SeqCst) { return; }
    let app = app.clone();
    tauri::async_runtime::spawn(async move {
        let state = app.state::<AppState>();
        let Some(window) = app.get_webview_window("main") else { state.opening.store(false, Ordering::SeqCst); return; };
        let native = state.native.clone();
        if window.is_focused().unwrap_or(false) {
            let _ = window.hide(); state.target_ready.store(false, Ordering::SeqCst);
            let _ = tauri::async_runtime::spawn_blocking(move || native.cancel()).await;
        } else {
            let result = tauri::async_runtime::spawn_blocking(move || native.capture()).await;
            let error = match result { Ok(Ok(())) => None, Ok(Err(error)) => Some(error), Err(error) => Some(error.to_string()) };
            state.target_ready.store(error.is_none(), Ordering::SeqCst);
            *state.error.lock().unwrap() = error;
            focus_editor(&window);
        }
        state.opening.store(false, Ordering::SeqCst);
    });
}

pub fn run() {
    tauri::Builder::default()
        .on_page_load(|webview, _| { let _ = webview.set_focus(); })
        .manage(formula_packs::ImportQueue::default())
        .plugin(tauri_plugin_single_instance::init(|app, args, cwd| {
            show_without_target(app);
            formula_packs::queue_import_paths(app, formula_packs::launch_import_paths(
                args.into_iter().skip(1).map(std::path::PathBuf::from), std::path::Path::new(&cwd)));
        }))
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_global_shortcut::Builder::new().with_handler(|app, _, event| {
            if event.state() == ShortcutState::Released { global_shortcut(app); }
        }).build())
        .invoke_handler(tauri::generate_handler![desktop_status, configure_shortcut, copy_text, submit_text, cancel_input, set_ui_language, formula_packs::load_formula_packs, formula_packs::save_formula_packs, formula_packs::restore_formula_pack_backup, formula_packs::pick_formula_pack_files, formula_packs::take_pending_formula_pack_files, formula_packs::export_formula_pack_file])
        .setup(|app| {
            app.manage(formula_packs::PackFile::new(app.path().app_config_dir()?));
            let shortcut = config_path(app.handle()).ok().and_then(|path| fs::read_to_string(path).ok()).and_then(|text| serde_json::from_str::<String>(&text).ok()).filter(|text| text.len() < 64 && text.parse::<Shortcut>().is_ok()).unwrap_or_else(|| DEFAULT_SHORTCUT.into());
            let parsed: Shortcut = shortcut.parse().unwrap();
            let registration = app.global_shortcut().register(parsed);
            app.manage(AppState { native: NativeBridge::new(), shortcut: Mutex::new(shortcut), registered: Mutex::new(registration.as_ref().ok().map(|_| parsed)), error: Mutex::new(registration.err().map(|error| format!("全局快捷键注册失败：{error}。可在设置中更换；托盘仍可打开窗口"))), target_ready: AtomicBool::new(false), opening: AtomicBool::new(false), last_result: Mutex::new(None) });
            let menu = tray_menu(app.handle(), false)?;
            let mut tray = TrayIconBuilder::with_id("editor-tray").tooltip("Math Input · 结构化数学输入").menu(&menu).on_menu_event(|app, event| match event.id().as_ref() { "show" => show_without_target(app), "quit" => app.exit(0), _ => {} });
            if let Some(icon) = app.default_window_icon() { tray = tray.icon(icon.clone()); }
            tray.build(app)?;
            if let Ok(cwd) = std::env::current_dir() {
                formula_packs::queue_import_paths(app.handle(), formula_packs::launch_import_paths(
                    std::env::args_os().skip(1).map(std::path::PathBuf::from), &cwd));
            }
            Ok(())
        })
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::DragDrop(tauri::DragDropEvent::Drop { paths, .. }) = event {
                formula_packs::queue_import_paths(window.app_handle(), paths.clone());
            }
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                api.prevent_close(); let _ = window.hide();
                let state = window.state::<AppState>(); state.target_ready.store(false, Ordering::SeqCst);
                let native = state.native.clone(); tauri::async_runtime::spawn_blocking(move || native.cancel());
            }
        })
        .run(tauri::generate_context!())
        .expect("Math Input could not start");
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn output_validation_rejects_empty_nul_and_unbounded_input() {
        assert!(validate_output("$\\frac{x}{y}$").is_ok()); assert!(validate_output("").is_err()); assert!(validate_output("a\0b").is_err()); assert!(validate_output(&"x".repeat(128 * 1024 + 1)).is_err());
    }
    #[test]
    fn default_shortcut_uses_the_tauri2_plugin_parser() {
        assert!(DEFAULT_SHORTCUT.parse::<Shortcut>().is_ok()); assert!("Ctrl+Alt+Shift+P".parse::<Shortcut>().is_ok()); assert!("invalid shortcut".parse::<Shortcut>().is_err());
    }
}
