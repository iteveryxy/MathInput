//! All UI Automation and clipboard work lives on one bounded-request worker.
//! No background-window messages, thread attachment, privilege elevation, or
//! protected text reads are used. A queued Ctrl+V is not proof of delivery.
use serde::Serialize;
use std::{mem::size_of, ptr::null_mut, sync::mpsc, thread, time::{Duration, Instant}};
use windows::Win32::{System::Com::{CoCreateInstance, CoInitializeEx, CoUninitialize, CLSCTX_INPROC_SERVER, COINIT_MULTITHREADED}, UI::Accessibility::{CUIAutomation, IUIAutomation, IUIAutomationElement, UIA_DocumentControlTypeId, UIA_EditControlTypeId}};
use windows_sys::Win32::{
    Foundation::{CloseHandle, GetLastError, SetLastError, FILETIME, GlobalFree, HANDLE, HWND},
    Security::{GetTokenInformation, TokenElevation, TOKEN_ELEVATION, TOKEN_QUERY},
    System::{DataExchange::*, Memory::*, StationsAndDesktops::*, Threading::*},
    UI::{Input::KeyboardAndMouse::*, WindowsAndMessaging::*},
};

type Reply<T> = mpsc::Sender<Result<T, String>>;
enum Job {
    Capture(Reply<()>),
    Preflight(usize, Reply<()>),
    Paste(String, usize, Reply<NativeOutcome>),
    Copy(String, usize, Reply<NativeOutcome>),
    Cancel(Reply<()>),
}
struct Request { job: Job, deadline: Instant }

#[derive(Clone)]
pub struct NativeBridge { sender: mpsc::Sender<Request> }

#[derive(Serialize)]
pub struct NativeOutcome { pub status: &'static str, pub message: String }

impl NativeBridge {
    pub fn new() -> Self {
        let (sender, receiver) = mpsc::channel();
        thread::Builder::new().name("math-input-native".into()).spawn(move || unsafe {
            let initialized = CoInitializeEx(None, COINIT_MULTITHREADED).is_ok();
            let automation: Option<IUIAutomation> = if initialized { CoCreateInstance(&CUIAutomation, None, CLSCTX_INPROC_SERVER).ok() } else { None };
            let mut target: Option<Target> = None;
            while let Ok(Request { job, deadline }) = receiver.recv() {
                if let Err(error) = check_deadline(deadline) {
                    match job {
                        Job::Capture(reply) | Job::Preflight(_, reply) | Job::Cancel(reply) => { let _ = reply.send(Err(error)); }
                        Job::Paste(_, _, reply) | Job::Copy(_, _, reply) => { let _ = reply.send(Err(error)); }
                    }
                    continue;
                }
                match job {
                    Job::Capture(reply) => {
                        target = None;
                        let result = capture(automation.as_ref()).and_then(|target| check_deadline(deadline).map(|_| target));
                        let response = result.as_ref().map(|_| ()).map_err(Clone::clone);
                        if let Ok(value) = result { target = Some(value); }
                        // A timed-out capture must never become a usable future target.
                        if reply.send(response).is_err() { target = None; }
                    }
                    Job::Preflight(owner, reply) => {
                        let result = (|| {
                            target.as_ref().ok_or("没有经全局快捷键捕获的输入目标，请手动复制")?.validate_identity()?;
                            wait_for_release()?;
                            let _clipboard = Clipboard::open(owner)?;
                            snapshot_open()?;
                            Ok(())
                        })();
                        let _ = reply.send(result);
                    }
                    Job::Paste(text, owner, reply) => {
                        let result = target.take().ok_or_else(|| "原输入目标已失效，请手动复制".to_string()).and_then(|target| target.paste(&text, owner, automation.as_ref(), deadline));
                        let _ = reply.send(result);
                    }
                    Job::Copy(text, owner, reply) => {
                        let result = copy_explicit(&text, owner, deadline).map(|_| NativeOutcome { status: "copied", message: "已复制公式，剪贴板现为生成结果".into() });
                        let _ = reply.send(result);
                    }
                    Job::Cancel(reply) => {
                        if let Some(target) = target.take() { let _ = target.restore(); }
                        let _ = reply.send(Ok(()));
                    }
                }
            }
            drop(target);
            drop(automation);
            if initialized { CoUninitialize(); }
        }).expect("Could not start native worker");
        Self { sender }
    }

    fn request<T>(&self, job: impl FnOnce(Reply<T>) -> Job) -> Result<T, String> {
        let (sender, receiver) = mpsc::channel();
        self.sender.send(Request { job: job(sender), deadline: Instant::now() + Duration::from_millis(2500) }).map_err(|_| "Windows 集成线程不可用".to_string())?;
        receiver.recv_timeout(Duration::from_secs(3)).map_err(|_| "Windows 目标响应超时，已停止自动操作，结果保留供手动复制".to_string())?
    }
    pub fn capture(&self) -> Result<(), String> { self.request(Job::Capture) }
    pub fn preflight(&self, owner: usize) -> Result<(), String> { self.request(|reply| Job::Preflight(owner, reply)) }
    pub fn paste(&self, text: String, owner: usize) -> Result<NativeOutcome, String> { self.request(|reply| Job::Paste(text, owner, reply)) }
    pub fn copy(&self, text: String, owner: usize) -> Result<NativeOutcome, String> { self.request(|reply| Job::Copy(text, owner, reply)) }
    pub fn cancel(&self) -> Result<(), String> { self.request(Job::Cancel) }
}

fn check_deadline(deadline: Instant) -> Result<(), String> {
    if Instant::now() >= deadline { Err("Windows 请求已过期，已停止自动操作，请手动复制".into()) } else { Ok(()) }
}

struct Handle(HANDLE);
impl Drop for Handle { fn drop(&mut self) { unsafe { CloseHandle(self.0); } } }

struct Target { window: HWND, focus: HWND, pid: u32, created: u64, element: IUIAutomationElement }

unsafe fn default_desktop() -> Result<(), String> {
    let desktop = OpenInputDesktop(0, 0, DESKTOP_READOBJECTS);
    if desktop.is_null() { return Err("无法确认当前输入桌面，已停止自动粘贴".into()); }
    let mut name = [0u16; 128]; let mut needed = 0;
    let ok = GetUserObjectInformationW(desktop, UOI_NAME, name.as_mut_ptr().cast(), (name.len() * 2) as u32, &mut needed);
    CloseDesktop(desktop);
    let end = name.iter().position(|c| *c == 0).unwrap_or(name.len());
    if ok == 0 || !String::from_utf16_lossy(&name[..end]).eq_ignore_ascii_case("default") { return Err("当前是受保护的系统桌面，已停止自动粘贴".into()); }
    Ok(())
}

fn blocked_process(name: &str) -> bool {
    ["logonui.exe", "lockapp.exe", "consent.exe", "credentialuibroker.exe", "lsass.exe", "windowsterminal.exe", "openconsole.exe", "cmd.exe", "powershell.exe", "pwsh.exe"].contains(&name.to_ascii_lowercase().as_str())
}

unsafe fn process_identity(pid: u32) -> Result<(u64, bool), String> {
    let raw = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, 0, pid);
    if raw.is_null() { return Err("无权核验目标进程，请使用手动复制".into()); }
    let process = Handle(raw);
    let mut path = [0u16; 1024]; let mut length = path.len() as u32;
    if QueryFullProcessImageNameW(process.0, 0, path.as_mut_ptr(), &mut length) == 0 { return Err("无法确认目标进程身份".into()); }
    let path = String::from_utf16_lossy(&path[..length as usize]);
    if blocked_process(path.rsplit('\\').next().unwrap_or("")) { return Err("此目标属于系统保护窗口或命令终端，请手动复制".into()); }
    let mut created: FILETIME = std::mem::zeroed(); let mut exit = created; let mut kernel = created; let mut user = created;
    if GetProcessTimes(process.0, &mut created, &mut exit, &mut kernel, &mut user) == 0 { return Err("无法确认目标进程生命周期".into()); }
    let mut raw_token = null_mut();
    if OpenProcessToken(process.0, TOKEN_QUERY, &mut raw_token) == 0 { return Err("无法确认目标权限级别".into()); }
    let token = Handle(raw_token); let mut elevation: TOKEN_ELEVATION = std::mem::zeroed(); let mut returned = 0;
    if GetTokenInformation(token.0, TokenElevation, (&mut elevation as *mut TOKEN_ELEVATION).cast(), size_of::<TOKEN_ELEVATION>() as u32, &mut returned) == 0 { return Err("无法确认目标权限级别".into()); }
    Ok((((created.dwHighDateTime as u64) << 32) | created.dwLowDateTime as u64, elevation.TokenIsElevated != 0))
}

unsafe fn validate_element(automation: &IUIAutomation, pid: u32) -> Result<IUIAutomationElement, String> {
    let element = automation.GetFocusedElement().map_err(|_| "无法识别原输入控件，请手动复制")?;
    let password = element.CurrentIsPassword().map_err(|_| "无法确认输入框是否受保护")?;
    let kind = element.CurrentControlType().map_err(|_| "无法确认输入控件类型")?;
    let process = element.CurrentProcessId().map_err(|_| "无法确认输入控件进程")?;
    let focused = element.CurrentHasKeyboardFocus().map_err(|_| "无法确认输入焦点")?;
    let enabled = element.CurrentIsEnabled().map_err(|_| "无法确认输入控件状态")?;
    if password.as_bool() { return Err("密码或受保护输入框不允许自动粘贴".into()); }
    if process as u32 != pid || !focused.as_bool() || !enabled.as_bool() || (kind != UIA_EditControlTypeId && kind != UIA_DocumentControlTypeId) { return Err("未确认是可用的普通文本输入框，请手动复制".into()); }
    Ok(element)
}

unsafe fn capture(automation: Option<&IUIAutomation>) -> Result<Target, String> {
    default_desktop()?;
    let automation = automation.ok_or("Windows UI Automation 不可用，请手动复制")?;
    let window = GetForegroundWindow(); let mut pid = 0;
    let tid = GetWindowThreadProcessId(window, &mut pid);
    if window.is_null() || pid == GetCurrentProcessId() { return Err("请在目标输入框中使用全局快捷键呼出 Math Input".into()); }
    let (created, elevated) = process_identity(pid)?;
    if elevated { return Err("目标以管理员权限运行，请手动复制；不会提升本程序权限".into()); }
    let mut gui: GUITHREADINFO = std::mem::zeroed(); gui.cbSize = size_of::<GUITHREADINFO>() as u32;
    if GetGUIThreadInfo(tid, &mut gui) == 0 || gui.hwndFocus.is_null() { return Err("无法记录原输入焦点，请手动复制".into()); }
    let element = validate_element(automation, pid)?;
    if GetForegroundWindow() != window { return Err("捕获期间前台窗口发生变化，已放弃目标".into()); }
    Ok(Target { window, focus: gui.hwndFocus, pid, created, element })
}

impl Target {
    unsafe fn validate_identity(&self) -> Result<(), String> {
        default_desktop()?;
        if IsWindow(self.window) == 0 || IsWindow(self.focus) == 0 { return Err("原窗口或输入控件已关闭，请手动复制".into()); }
        let mut pid = 0; GetWindowThreadProcessId(self.window, &mut pid);
        if pid != self.pid || process_identity(pid)?.0 != self.created { return Err("原窗口身份已变化，请手动复制".into()); }
        Ok(())
    }
    unsafe fn restore(&self) -> Result<(), String> {
        self.validate_identity()?;
        if SetForegroundWindow(self.window) == 0 { return Err("系统未允许恢复原窗口焦点，请手动复制".into()); }
        for _ in 0..8 { if GetForegroundWindow() == self.window { return Ok(()); } thread::sleep(Duration::from_millis(25)); }
        Err("原窗口未获得前台焦点，请手动复制".into())
    }
    unsafe fn verify_focused(&self, automation: &IUIAutomation) -> Result<(), String> {
        self.validate_identity()?;
        if GetForegroundWindow() != self.window { return Err("前台窗口发生变化，已停止粘贴".into()); }
        let mut gui: GUITHREADINFO = std::mem::zeroed(); gui.cbSize = size_of::<GUITHREADINFO>() as u32;
        let tid = GetWindowThreadProcessId(self.window, null_mut());
        if GetGUIThreadInfo(tid, &mut gui) == 0 || gui.hwndFocus != self.focus { return Err("原输入焦点已变化，已停止粘贴".into()); }
        let element = validate_element(automation, self.pid)?;
        if !automation.CompareElements(&self.element, &element).map_err(|_| "无法重新核对输入控件")?.as_bool() { return Err("输入控件身份不一致，已停止粘贴".into()); }
        Ok(())
    }
    unsafe fn paste(&self, text: &str, owner: usize, automation: Option<&IUIAutomation>, deadline: Instant) -> Result<NativeOutcome, String> {
        let automation = automation.ok_or("Windows UI Automation 不可用")?;
        wait_for_release()?;
        check_deadline(deadline)?;
        self.restore()?;
        thread::sleep(Duration::from_millis(100));
        self.verify_focused(automation)?;
        check_deadline(deadline)?;
        let snapshot = {
            let _clipboard = Clipboard::open(owner)?;
            let snapshot = snapshot_open()?;
            let items = text_items(text);
            if let Err(error) = replace_open(&items) { let _ = replace_open(&snapshot); return Err(error); }
            snapshot
        };
        // Closing a text clipboard can synthesize formats and advance its
        // sequence. Stamp AFTER CloseClipboard, then also check ownership so a
        // concurrent writer cannot be mistaken for our temporary clipboard.
        let sequence = GetClipboardSequenceNumber();
        let sent = (|| {
            self.verify_focused(automation)?;
            wait_for_release()?;
            check_deadline(deadline)?;
            // Recheck immediately before foreground input; never PostMessage to a background HWND.
            if GetForegroundWindow() != self.window { return Err("前台窗口发生变化，已停止粘贴".to_string()); }
            if GetClipboardSequenceNumber() != sequence || GetClipboardOwner() != owner as HWND { return Err("剪贴板已变化，已停止粘贴并保留最新内容".to_string()); }
            let inputs = [key(VK_CONTROL, 0), key(0x56, 0), key(0x56, KEYEVENTF_KEYUP), key(VK_CONTROL, KEYEVENTF_KEYUP)];
            if SendInput(inputs.len() as u32, inputs.as_ptr(), size_of::<INPUT>() as i32) != inputs.len() as u32 { return Err("Windows 未接收完整粘贴按键，可能存在权限边界，请手动复制".into()); }
            Ok(())
        })();
        if sent.is_ok() { thread::sleep(Duration::from_millis(650)); }
        // Sequence guard: never restore over a clipboard changed by the user or another app.
        let restored = if GetClipboardSequenceNumber() == sequence && GetClipboardOwner() == owner as HWND {
            Clipboard::open(owner).and_then(|_clipboard| {
                if GetClipboardSequenceNumber() == sequence && GetClipboardOwner() == owner as HWND { replace_open(&snapshot) } else { Ok(()) }
            }).is_ok()
        } else { true };
        sent?;
        Ok(NativeOutcome { status: "sent", message: if restored { "已发送粘贴快捷键；原纯文本剪贴板已恢复（或保留了新的剪贴板内容）。请在目标应用确认结果".into() } else { "已发送粘贴快捷键；剪贴板恢复失败，生成结果仍可手动复制，请确认目标结果".into() } })
    }
}

unsafe fn wait_for_release() -> Result<(), String> {
    let start = Instant::now();
    let keys = [VK_CONTROL, VK_MENU, VK_SHIFT, VK_LWIN, VK_RWIN, VK_RETURN];
    while keys.iter().any(|key| GetAsyncKeyState(*key as i32) < 0) {
        if start.elapsed() > Duration::from_millis(550) { return Err("请松开修饰键后重试，未模拟释放用户按键".into()); }
        thread::sleep(Duration::from_millis(15));
    }
    Ok(())
}
fn key(code: u16, flags: u32) -> INPUT {
    INPUT { r#type: INPUT_KEYBOARD, Anonymous: INPUT_0 { ki: KEYBDINPUT { wVk: code, wScan: 0, dwFlags: flags, time: 0, dwExtraInfo: 0 } } }
}

struct Clipboard;
impl Clipboard {
    unsafe fn open(owner: usize) -> Result<Self, String> {
        for _ in 0..8 {
            if OpenClipboard(owner as HWND) != 0 { return Ok(Self); }
            thread::sleep(Duration::from_millis(15));
        }
        Err("剪贴板正被占用或无法访问，请稍后手动复制".into())
    }
}
impl Drop for Clipboard { fn drop(&mut self) { unsafe { CloseClipboard(); } } }
type ClipboardItems = Vec<(u32, Vec<u8>)>;
fn safe_text_format(format: u32) -> bool { [1, 7, 13, 16].contains(&format) }

unsafe fn snapshot_open() -> Result<ClipboardItems, String> {
    let mut formats = Vec::new(); let mut format = 0;
    loop {
        SetLastError(0);
        format = EnumClipboardFormats(format);
        if format == 0 {
            if GetLastError() != 0 { return Err("无法枚举剪贴板格式，已保留原剪贴板".into()); }
            break;
        }
        if !safe_text_format(format) { return Err("剪贴板含图片、文件或其他格式，已保留原内容。请使用“仅复制”显式复制公式".into()); }
        formats.push(format);
    }
    let mut items = Vec::new();
    for format in formats {
        let handle = GetClipboardData(format);
        if handle.is_null() { return Err("无法完整读取纯文本剪贴板，已停止自动粘贴".into()); }
        let length = GlobalSize(handle);
        if length == 0 || length > 16 * 1024 * 1024 { return Err("剪贴板文本大小异常，已停止自动粘贴".into()); }
        let pointer = GlobalLock(handle);
        if pointer.is_null() { return Err("无法锁定剪贴板数据，已停止自动粘贴".into()); }
        let bytes = std::slice::from_raw_parts(pointer.cast::<u8>(), length).to_vec();
        GlobalUnlock(handle);
        items.push((format, bytes));
    }
    Ok(items)
}

fn text_items(text: &str) -> ClipboardItems {
    vec![(13, text.encode_utf16().chain([0]).flat_map(u16::to_le_bytes).collect())]
}

unsafe fn replace_open(items: &ClipboardItems) -> Result<(), String> {
    // Allocate every format BEFORE emptying the clipboard, so allocation failure
    // leaves the original data intact. Windows owns successfully set handles.
    let mut allocated = Vec::new();
    for (format, bytes) in items {
        let handle = GlobalAlloc(GMEM_MOVEABLE, bytes.len().max(1));
        if handle.is_null() { for (_, handle) in allocated { GlobalFree(handle); } return Err("无法分配剪贴板内存".into()); }
        let pointer = GlobalLock(handle);
        if pointer.is_null() { GlobalFree(handle); for (_, handle) in allocated { GlobalFree(handle); } return Err("无法写入剪贴板内存".into()); }
        std::ptr::copy_nonoverlapping(bytes.as_ptr(), pointer.cast(), bytes.len()); GlobalUnlock(handle);
        allocated.push((*format, handle));
    }
    if EmptyClipboard() == 0 { for (_, handle) in allocated { GlobalFree(handle); } return Err("无法打开剪贴板写入事务".into()); }
    let mut failed = false;
    for (format, handle) in allocated {
        if failed || SetClipboardData(format, handle).is_null() { GlobalFree(handle); failed = true; }
    }
    if failed { return Err("剪贴板写入失败，请保留窗口中的生成结果".into()); }
    Ok(())
}

unsafe fn copy_explicit(text: &str, owner: usize, deadline: Instant) -> Result<(), String> {
    let _clipboard = Clipboard::open(owner)?;
    check_deadline(deadline)?;
    replace_open(&text_items(text))
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn only_plain_text_is_eligible_for_temporary_clipboard_use() {
        for format in [1, 7, 13, 16] { assert!(safe_text_format(format)); }
        for format in [2, 3, 8, 15, 17, 0xc001, 0xc002] { assert!(!safe_text_format(format)); }
    }
    #[test]
    fn no_terminal_or_protected_process_is_an_automatic_paste_target() {
        for name in ["LogonUI.exe", "Consent.exe", "pwsh.exe", "WindowsTerminal.exe"] { assert!(blocked_process(name)); }
        assert!(!blocked_process("notepad.exe"));
    }
    #[test]
    fn clipboard_text_is_null_terminated_utf16() {
        assert_eq!(text_items("公式α")[0].1, [0x6c, 0x51, 0x0f, 0x5f, 0xb1, 0x03, 0x00, 0x00]);
    }
}
