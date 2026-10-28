//! Explicitly invoked native integration test. It does NOT launch/control the
//! MathInput application. Only two freshly spawned, PID-verified fixture
//! processes can receive foreground requests. Paste uses the production module.
#[allow(dead_code)]
#[path = "../src/native.rs"]
mod native;

use serde_json::{json, Value};
use std::{fs, path::{Path, PathBuf}, process::{Child, Command}, thread, time::{Duration, Instant, SystemTime, UNIX_EPOCH}};
use windows_sys::Win32::{Foundation::HWND, UI::WindowsAndMessaging::{GetForegroundWindow, GetWindowThreadProcessId, IsWindow, SetForegroundWindow}};

fn environment() -> Value {
    use windows_sys::Win32::{Foundation::GetLastError, System::{StationsAndDesktops::*, Threading::GetCurrentThreadId}};
    unsafe fn object_name(handle: *mut std::ffi::c_void) -> Value {
        let mut name = [0u16; 256]; let mut needed = 0;
        if handle.is_null() || GetUserObjectInformationW(handle, UOI_NAME, name.as_mut_ptr().cast(), (name.len() * 2) as u32, &mut needed) == 0 {
            return json!({"available":false,"win32Error":GetLastError()});
        }
        let end = name.iter().position(|ch| *ch == 0).unwrap_or(name.len());
        json!({"available":true,"name":String::from_utf16_lossy(&name[..end])})
    }
    unsafe {
        let station = object_name(GetProcessWindowStation());
        let thread_desktop = object_name(GetThreadDesktop(GetCurrentThreadId()));
        let input = OpenInputDesktop(0, 0, DESKTOP_READOBJECTS);
        let input_desktop = object_name(input);
        if !input.is_null() { CloseDesktop(input); }
        json!({"windowStation":station,"threadDesktop":thread_desktop,"inputDesktop":input_desktop,"foregroundPresent":!GetForegroundWindow().is_null(),"mode":"read-only environment probe; no input, clipboard writes or window activation"})
    }
}

fn clipboard_formats() -> Result<Value, String> {
    use windows_sys::Win32::{Foundation::{GetLastError, SetLastError}, System::DataExchange::{OpenClipboard, CloseClipboard, EnumClipboardFormats, GetClipboardFormatNameW}};
    unsafe {
        if OpenClipboard(std::ptr::null_mut()) == 0 { return Err(format!("Cannot open clipboard for metadata probe: {}", GetLastError())); }
        let result = (|| {
            let mut formats = Vec::new();
            let mut format = 0;
            loop {
                SetLastError(0);
                format = EnumClipboardFormats(format);
                if format == 0 {
                    if GetLastError() != 0 { return Err(format!("Clipboard enumeration failed: {}", GetLastError())); }
                    break;
                }
                let mut name = [0u16; 256];
                let length = GetClipboardFormatNameW(format, name.as_mut_ptr(), name.len() as i32);
                formats.push(json!({"id":format,"registeredName":if length > 0 {String::from_utf16_lossy(&name[..length as usize])} else {String::new()},"acceptedByProductionTextPolicy":([1,7,13,16].contains(&format))}));
            }
            Ok(json!({"success":true,"scope":"read-only Win32 format IDs/names; no clipboard data, writes, input or window activation", "formats":formats}))
        })();
        CloseClipboard();
        result
    }
}

struct Fixture { child: Child, directory: PathBuf, serial: u32, interactive: bool }

impl Fixture {
    fn spawn(executable: &Path, directory: PathBuf, role: &str, interactive: bool) -> Result<Self, String> {
        fs::create_dir_all(&directory).map_err(|error| error.to_string())?;
        let child = Command::new(executable).arg(&directory).arg(role).arg(std::process::id().to_string()).spawn().map_err(|error| error.to_string())?;
        let fixture = Self { child, directory, serial: 0, interactive };
        fixture.wait(|_| true)?;
        Ok(fixture)
    }
    fn snapshot(&self) -> Result<Value, String> {
        let text = fs::read_to_string(self.directory.join("snapshot.json")).map_err(|error| error.to_string())?;
        let snapshot: Value = serde_json::from_str(&text).map_err(|error| error.to_string())?;
        if snapshot["pid"].as_u64() != Some(self.child.id() as u64) { return Err("Fixture process identity mismatch".into()); }
        if !snapshot["failure"].is_null() { return Err(format!("Fixture failed: {}", snapshot["failure"])); }
        let window = snapshot["window"].as_u64().ok_or("Missing fixture HWND")? as HWND;
        let mut pid = 0;
        unsafe { if IsWindow(window) == 0 { return Err("Fixture window closed".into()); } GetWindowThreadProcessId(window, &mut pid); }
        if pid != self.child.id() { return Err("Fixture HWND does not belong to spawned child".into()); }
        Ok(snapshot)
    }
    fn wait(&self, predicate: impl Fn(&Value) -> bool) -> Result<Value, String> {
        let start = Instant::now();
        while start.elapsed() < Duration::from_secs(8) {
            if let Ok(snapshot) = self.snapshot() { if predicate(&snapshot) { return Ok(snapshot); } }
            thread::sleep(Duration::from_millis(25));
        }
        Err("Fixture did not reach the required observed state in 8 seconds".into())
    }
    fn command(&mut self, command: &str) -> Result<Value, String> {
        self.serial += 1;
        let id = self.serial.to_string();
        let temporary = self.directory.join("command.tmp");
        fs::write(&temporary, format!("{id}\n{command}\n")).map_err(|error| error.to_string())?;
        fs::rename(temporary, self.directory.join("command.txt")).map_err(|error| error.to_string())?;
        self.wait(|snapshot| snapshot["command"].as_str() == Some(id.as_str()))
    }
    fn activate_primary(&mut self) -> Result<Value, String> {
        let snapshot = self.snapshot()?;
        let window = snapshot["window"].as_u64().unwrap() as HWND;
        unsafe {
            // Single bounded request, followed by a real observation. No input
            // is sent if Windows refuses foreground activation.
            if GetForegroundWindow() != window && SetForegroundWindow(window) == 0 {
                if !self.interactive { return Err("Windows refused foreground activation of the test-owned fixture".into()); }
                println!("WAITING: click the Start validation button in the isolated target window (120 second limit)");
                let start = Instant::now();
                let mut observed = false;
                while start.elapsed() < Duration::from_secs(120) {
                    if let Ok(current) = self.snapshot() {
                        if current["foreground"] == true && current["primaryFocused"] == true { observed = true; break; }
                    }
                    thread::sleep(Duration::from_millis(30));
                }
                if !observed { return Err("No user foreground activation observed; no keyboard input was sent".into()); }
            }
        }
        self.command("primary")?;
        self.wait(|snapshot| snapshot["foreground"] == true && snapshot["primaryFocused"] == true)
    }
    fn hwnd(&self) -> Result<usize, String> { Ok(self.snapshot()?["window"].as_u64().unwrap() as usize) }
    fn close(&mut self) -> Result<(), String> {
        self.serial += 1;
        fs::write(self.directory.join("command.txt"), format!("{}\nclose\n", self.serial)).map_err(|error| error.to_string())?;
        let start = Instant::now();
        while start.elapsed() < Duration::from_secs(3) {
            if self.child.try_wait().map_err(|error| error.to_string())?.is_some() { return Ok(()); }
            thread::sleep(Duration::from_millis(25));
        }
        Err("Test-owned fixture did not close".into())
    }
}
impl Drop for Fixture {
    fn drop(&mut self) {
        if matches!(self.child.try_wait(), Ok(None)) {
            let _ = self.close();
            if matches!(self.child.try_wait(), Ok(None)) { let _ = self.child.kill(); let _ = self.child.wait(); }
        }
    }
}

fn require(condition: bool, message: &str) -> Result<(), String> { if condition { Ok(()) } else { Err(message.into()) } }

fn run(fixtures: &Path, run_dir: &Path, cases: &mut Vec<Value>) -> Result<(), String> {
    let bridge = native::NativeBridge::new();
    let interactive = std::env::args().any(|arg| arg == "--interactive");
    let mut target = Fixture::spawn(fixtures, run_dir.join("target"), "target", interactive)?;
    let initial = target.activate_primary()?;
    require(initial["text"] == "" && initial["secondaryText"] == "", "Fixture must begin with empty test-owned fields")?;
    if std::env::args().any(|arg| arg == "--prepare-test-baseline") {
        // Explicit test-only setup: replace the disposable clipboard only when
        // this flag was requested. Use the exact production explicit-copy path.
        let baseline = "MathInput.NativeBaseline.20261028";
        fs::write(target.directory.join("expected-formula.txt"), baseline).map_err(|error| error.to_string())?;
        let copied = bridge.copy(baseline.into(), target.hwnd()?)?;
        require(copied.status == "copied", "Production explicit-copy baseline setup failed")?;
        let verified = target.wait(|snapshot| snapshot["expectedFormulaHash"].is_string() && snapshot["clipboardHash"] == snapshot["expectedFormulaHash"])?;
        let setup = json!({"success":true,"baseline":baseline,"source":"production NativeBridge::copy; explicit test-only flag","exactTextHashVerifiedByFixture":true,"baselineHash":verified["clipboardHash"],"formats":verified["formats"]});
        fs::write(run_dir.join("baseline-setup.json"), serde_json::to_string_pretty(&setup).unwrap()).map_err(|error| error.to_string())?;
        println!("PASS: explicitly requested fixed test baseline verified by independent receiver");
    }
    let stamp = SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_millis();
    let formula = format!("$\\frac{{x+{stamp}}}{{y}}$");
    fs::write(target.directory.join("expected-formula.txt"), &formula).map_err(|error| error.to_string())?;
    target.wait(|snapshot| snapshot["expectedFormulaHash"].is_string() && snapshot["expectedFormulaHash"] != snapshot["clipboardHash"])?;
    let baseline = target.command("baseline")?;
    require(baseline["clipboardBaselineHash"].is_string(), "Could not capture clipboard hash without modifying it")?;
    let baseline_hash = baseline["clipboardBaselineHash"].clone();
    require(baseline_hash != baseline["expectedFormulaHash"], "Clipboard baseline must differ from the test formula; restoration would otherwise be unproven")?;
    let baseline_formats = baseline["formats"].clone();
    require(baseline_formats.is_array(), "Could not read clipboard format metadata")?;

    // Capture BEFORE spawning the editor stand-in, exactly as production does.
    bridge.capture()?;
    let mut editor = Fixture::spawn(fixtures, run_dir.join("editor"), "editor-stand-in", false)?;
    editor.activate_primary()?;
    let owner = editor.hwnd()?;
    bridge.preflight(owner)?;
    let outcome = bridge.paste(formula.clone(), owner)?;
    println!("Paste outcome: {} ({})", outcome.status, outcome.message);
    require(outcome.status == "sent", "Native bridge did not report an accepted paste request")?;
    let received = target.wait(|snapshot| snapshot["text"].as_str() == Some(formula.as_str()) && snapshot["clipboardHash"] == baseline_hash)?;
    require(received["secondaryText"] == "", "Paste reached the wrong fixture control")?;
    require(received["formats"] == baseline_formats, "Clipboard data formats were not restored")?;
    require(received["foreground"] == true && received["primaryFocused"] == true, "Original foreground/focus not restored")?;
    cases.push(json!({"name":"paste-real-text-and-restore-clipboard", "status":"passed", "received":formula, "baselineDiffersFromFormula":true,"clipboardHashRestored":true,"clipboardFormatsRestored":true,"source":"production NativeBridge::capture/preflight/paste"}));
    println!("PASS: actual target received exact Markdown; clipboard hash and formats restored");

    // Cancel: no text or clipboard mutation, and original focused control returns.
    target.command("reset")?; target.activate_primary()?; bridge.capture()?;
    editor.activate_primary()?; bridge.cancel()?;
    let cancelled = target.wait(|snapshot| snapshot["foreground"] == true && snapshot["primaryFocused"] == true && snapshot["clipboardHash"] == baseline_hash)?;
    require(cancelled["text"] == "" && cancelled["secondaryText"] == "", "Cancel modified the test target")?;
    require(cancelled["formats"] == baseline_formats, "Cancel modified clipboard formats")?;
    cases.push(json!({"name":"cancel-no-input-no-clipboard-change", "status":"passed","textUnchanged":true,"clipboardUnchanged":true,"focusRestored":true}));
    println!("PASS: cancel restored focus without input or clipboard changes");

    // Change focus to a DIFFERENT live control after capturing the first one.
    target.activate_primary()?; bridge.capture()?; editor.activate_primary()?;
    target.command("secondary")?;
    let failure = bridge.paste("$must-not-be-sent$".into(), owner).err().ok_or("Changed focused control was not rejected")?;
    require(failure.contains("焦点") || failure.contains("控件身份"), "Focus rejection returned an unrelated failure")?;
    let rejected = target.wait(|snapshot| snapshot["clipboardHash"] == baseline_hash)?;
    require(rejected["text"] == "" && rejected["secondaryText"] == "", "Unknown focused control received input")?;
    cases.push(json!({"name":"changed-control-refuses-paste", "status":"passed","actualError":failure,"bothControlsUnchanged":true,"clipboardUnchanged":true}));
    println!("PASS: changed focused control rejected, both fields unchanged");

    // Close the exact original target process; HWND/PID checks must fail closed.
    target.activate_primary()?; bridge.capture()?; editor.activate_primary()?;
    target.close()?;
    let failure = bridge.preflight(owner).err().ok_or("Closed target was not rejected")?;
    require(failure.contains("关闭"), "Closed target returned an unrelated failure")?;
    let closed = editor.wait(|snapshot| snapshot["clipboardHash"] == baseline_hash)?;
    require(closed["text"] == "" && closed["secondaryText"] == "", "Closed-target failure sent input to stand-in editor")?;
    cases.push(json!({"name":"closed-target-refuses-paste", "status":"passed","actualError":failure,"clipboardUnchanged":true,"otherWindowUnchanged":true}));
    println!("PASS: closed original target rejected without touching another window");
    Ok(())
}

fn clipboard_guard(fixtures: &Path, run_dir: &Path) -> Result<Value, String> {
    let bridge = native::NativeBridge::new();
    let interactive = std::env::args().any(|arg| arg == "--interactive");
    let mut target = Fixture::spawn(fixtures, run_dir.join("target"), "target", interactive)?;
    target.activate_primary()?;
    let before = target.command("baseline")?;
    require(before["clipboardHash"].is_string() && before["formats"].is_array(), "Clipboard metadata was unavailable")?;
    bridge.capture()?;
    let mut editor = Fixture::spawn(fixtures, run_dir.join("editor"), "editor-stand-in", false)?;
    editor.activate_primary()?;
    let error = bridge.preflight(editor.hwnd()?).err().ok_or("Mixed-format clipboard was required for this read-only guard test")?;
    require(error.contains("剪贴板含"), "Preflight failed for a reason unrelated to mixed clipboard formats")?;
    // A new acknowledged command forces a fresh observation AFTER preflight.
    let after = target.command("baseline")?;
    let other = editor.command("baseline")?;
    require(after["clipboardHash"] == before["clipboardHash"] && after["formats"] == before["formats"], "Preflight changed clipboard data")?;
    require(after["text"] == "" && after["secondaryText"] == "" && other["text"] == "" && other["secondaryText"] == "", "Guard test modified a fixture field")?;
    Ok(json!({"name":"mixed-clipboard-preflight-preserves-data", "status":"passed", "actualError":error, "clipboardTextHashUnchanged":true, "clipboardFormatsUnchanged":true, "allFieldsUnchanged":true, "clipboardWritesRequested":false, "keyboardInputRequested":false}))
}

fn main() {
    let root = PathBuf::from(env!("CARGO_MANIFEST_DIR")).parent().unwrap().to_path_buf();
    if std::env::args().any(|arg| arg == "--clipboard-formats") {
        let report = clipboard_formats().unwrap_or_else(|error| json!({"success":false,"error":error}));
        fs::write(root.join("reports/native-clipboard-formats.json"), serde_json::to_string_pretty(&report).unwrap()).unwrap();
        println!("{}", serde_json::to_string_pretty(&report).unwrap());
        if report["success"] != true { std::process::exit(1); }
        return;
    }
    if std::env::args().any(|arg| arg == "--environment") {
        let report = serde_json::to_string_pretty(&environment()).unwrap();
        fs::create_dir_all(root.join("reports")).unwrap();
        fs::write(root.join("reports/native-environment.json"), &report).unwrap();
        println!("{report}");
        return;
    }
    if std::env::args().any(|arg| arg == "--clipboard-guard") {
        let stamp = SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_millis();
        let run_dir = root.join(".local").join(format!("native-clipboard-guard-{stamp}"));
        fs::create_dir_all(&run_dir).unwrap();
        fs::create_dir_all(root.join("reports")).unwrap();
        let pending = json!({"schema":1,"success":false,"stage":"not-completed","passed":0,"expected":1,"runDirectory":run_dir});
        fs::write(root.join("reports/native-clipboard-guard.json"), serde_json::to_string_pretty(&pending).unwrap()).unwrap();
        let result = clipboard_guard(&root.join(".local/MathInput.NativeFixture.exe"), &run_dir);
        let report = json!({"schema":1,"stage":"completed","scope":"production NativeBridge preflight on isolated Windows fixtures; no paste or packaged Tauri UI", "success":result.is_ok(), "passed":usize::from(result.is_ok()), "expected":1,"case":result.as_ref().ok(),"error":result.as_ref().err(),"runDirectory":run_dir});
        fs::write(root.join("reports/native-clipboard-guard.json"), serde_json::to_string_pretty(&report).unwrap()).unwrap();
        println!("{}", serde_json::to_string_pretty(&report).unwrap());
        if result.is_err() { std::process::exit(1); }
        return;
    }
    let stamp = SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_millis();
    let run_dir = root.join(".local").join(format!("native-acceptance-{stamp}"));
    fs::create_dir_all(&run_dir).unwrap();
    let mut cases = Vec::new();
    let result = run(&root.join(".local/MathInput.NativeFixture.exe"), &run_dir, &mut cases);
    let error = result.as_ref().err().cloned();
    let baseline_setup = fs::read_to_string(run_dir.join("baseline-setup.json")).ok().and_then(|text| serde_json::from_str::<Value>(&text).ok());
    let report = json!({"schema":1,"scope":"isolated real Windows production NativeBridge; NOT packaged Tauri UI or hotkey end-to-end", "passed":cases.len(),"expected":4,"skipped":0,"success":result.is_ok(),"cases":cases,"error":error,"baselineSetup":baseline_setup,"runDirectory":run_dir});
    fs::create_dir_all(root.join("reports")).unwrap();
    fs::write(root.join("reports/native-integration.json"), serde_json::to_string_pretty(&report).unwrap()).unwrap();
    use std::io::Write;
    if let Ok(mut attempts) = fs::OpenOptions::new().create(true).append(true).open(root.join("reports/native-attempts.jsonl")) { let _ = writeln!(attempts, "{}", serde_json::to_string(&report).unwrap()); }
    if let Err(error) = result { eprintln!("FAIL (no bypass or success assumption): {error}"); std::process::exit(1); }
}
