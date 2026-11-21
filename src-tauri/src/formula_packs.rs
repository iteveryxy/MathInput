use serde_json::{json, Map, Value};
use std::{
    collections::HashSet,
    fs::{self, OpenOptions},
    io::{Read, Write},
    path::{Path, PathBuf},
    sync::{
        atomic::{AtomicU64, Ordering},
        Mutex,
    },
    time::{SystemTime, UNIX_EPOCH},
};
use tauri::{AppHandle, State};
use tauri_plugin_dialog::DialogExt;

const FILE_LIMIT: usize = 262_144;
const STATE_LIMIT: usize = 8_388_608;
static SERIAL: AtomicU64 = AtomicU64::new(0);
fn err(path: &str, message: &str) -> String {
    format!("{path}: {message}")
}
fn object<'a>(
    value: &'a Value,
    path: &str,
    keys: &[&str],
) -> Result<&'a Map<String, Value>, String> {
    let object = value.as_object().ok_or_else(|| err(path, "需要对象"))?;
    for key in object.keys() {
        if !keys.contains(&key.as_str()) {
            return Err(err(&format!("{path}.{key}"), "不支持的字段"));
        }
    }
    Ok(object)
}
fn text<'a>(value: &'a Value, path: &str, max: usize, empty: bool) -> Result<&'a str, String> {
    let value = value.as_str().ok_or_else(|| err(path, "需要文本"))?;
    if (!empty && value.trim().is_empty())
        || value.chars().count() > max
        || value
            .chars()
            .any(|ch| ch < ' ' && !['\n', '\r', '\t'].contains(&ch))
    {
        return Err(err(path, "文本为空、过长或含控制字符"));
    }
    Ok(value)
}
fn array<'a>(value: &'a Value, path: &str, max: usize) -> Result<&'a Vec<Value>, String> {
    let value = value.as_array().ok_or_else(|| err(path, "需要数组"))?;
    if value.len() > max {
        return Err(err(path, "数组超过数量上限"));
    }
    Ok(value)
}
fn identifier(value: &str, parameter: bool) -> bool {
    let bytes = value.as_bytes();
    !bytes.is_empty()
        && bytes.len() <= if parameter { 32 } else { 64 }
        && bytes[0].is_ascii_lowercase()
        && bytes.iter().all(|c| {
            c.is_ascii_lowercase()
                || c.is_ascii_digit()
                || *c == if parameter { b'_' } else { b'-' }
        })
}
fn command(value: &str) -> bool {
    !value.is_empty()
        && value.len() <= 40
        && value.as_bytes()[0].is_ascii_lowercase()
        && value
            .bytes()
            .all(|c| c.is_ascii_lowercase() || c.is_ascii_digit())
}
fn latex(value: &str, path: &str) -> Result<Vec<String>, String> {
    text(&Value::String(value.into()), path, 8192, true)?;
    let forbidden = [
        "href",
        "url",
        "htmlclass",
        "htmlid",
        "htmldata",
        "htmlstyle",
        "class",
        "cssid",
        "style",
        "includegraphics",
        "input",
        "include",
        "def",
        "gdef",
        "edef",
        "xdef",
        "newcommand",
        "renewcommand",
        "providecommand",
        "let",
        "catcode",
        "csname",
        "endcsname",
        "require",
        "usepackage",
        "write",
        "openout",
        "read",
        "special",
        "placeholder",
        "prompt",
        "unicode",
        "tooltip",
        "mathtip",
        "texttip",
        "color",
        "textcolor",
        "colorbox",
        "fcolorbox",
        "bbox",
        "enclose",
    ];
    let bytes = value.as_bytes();
    let mut i = 0;
    let mut depth = 0i32;
    let mut slots = Vec::new();
    let mut environments = Vec::new();
    while i < bytes.len() {
        if bytes[i] == b'<'
            && bytes
                .get(i + 1)
                .is_some_and(|c| c.is_ascii_alphabetic() || *c == b'/' || *c == b'!')
            && value[i..].contains('>')
        {
            return Err(err(path, "不允许 HTML 标签"));
        }
        if bytes[i] == b'\\' {
            if bytes
                .get(i + 1)
                .is_some_and(|c| [b'{', b'}', b'\\'].contains(c))
            {
                i += 2;
                continue;
            }
            let start = i + 1;
            let mut end = start;
            while end < bytes.len() && bytes[end].is_ascii_alphabetic() {
                end += 1;
            }
            let token = value[start..end].to_ascii_lowercase();
            if forbidden.contains(&token.as_str()) {
                return Err(err(path, &format!("不允许命令 \\{token}")));
            }
            if ["begin", "end"].contains(&token.as_str()) && bytes.get(end) == Some(&b'{') {
                if let Some(length) = value[end + 1..].find('}') {
                    let name = value[end + 1..end + 1 + length].to_string();
                    if token == "begin" {
                        environments.push(name);
                    } else if environments.pop() != Some(name) {
                        return Err(err(path, "环境不匹配"));
                    }
                }
            }
        }
        if bytes[i] == b'{' {
            depth += 1;
            if depth > 32 {
                return Err(err(path, "LaTeX 嵌套过深"));
            }
            if bytes.get(i + 1) == Some(&b'{') {
                if let Some(length) = value[i + 2..].find("}}") {
                    let id = &value[i + 2..i + 2 + length];
                    if !id.starts_with('{')
                        && id
                            .as_bytes()
                            .first()
                            .is_some_and(|c| c.is_ascii_alphabetic() || *c == b'_')
                    {
                        if !identifier(id, true) {
                            return Err(err(path, "非法参数槽位"));
                        }
                        slots.push(id.to_string());
                    }
                }
            }
        }
        if bytes[i] == b'}' {
            depth -= 1;
            if depth < 0 {
                return Err(err(path, "花括号不匹配"));
            }
        }
        i += 1;
    }
    if depth != 0 || !environments.is_empty() {
        return Err(err(path, "LaTeX 分组或环境未结束"));
    }
    Ok(slots)
}
pub fn validate_pack(pack: &Value, path: &str) -> Result<(), String> {
    object(
        pack,
        path,
        &[
            "schemaVersion",
            "id",
            "name",
            "version",
            "author",
            "description",
            "snippets",
        ],
    )?;
    if pack["schemaVersion"] != 1 {
        return Err(err(path, "仅支持 schemaVersion 1；不兼容版本不能静默迁移"));
    }
    if !identifier(text(&pack["id"], path, 64, false)?, false) {
        return Err(err(path, "非法公式包 ID"));
    }
    let version = text(&pack["version"], path, 24, false)?;
    let parts: Vec<_> = version.split('.').collect();
    if parts.len() != 3
        || parts.iter().any(|part| {
            part.is_empty() || part.len() > 5 || !part.bytes().all(|c| c.is_ascii_digit())
        })
    {
        return Err(err(path, "版本须为 major.minor.patch"));
    }
    text(&pack["name"], path, 80, false)?;
    text(&pack["author"], path, 120, true)?;
    text(&pack["description"], path, 1000, true)?;
    let mut ids = HashSet::new();
    for (i, snippet) in array(&pack["snippets"], path, 128)?.iter().enumerate() {
        let p = format!("{path}.snippets[{i}]");
        object(
            snippet,
            &p,
            &[
                "id",
                "command",
                "aliases",
                "name",
                "description",
                "latex",
                "parameters",
                "wrapTarget",
                "preferSelection",
            ],
        )?;
        let id = text(&snippet["id"], &p, 64, false)?;
        if !identifier(id, false) || !ids.insert(id) {
            return Err(err(&p, "非法或重复公式 ID"));
        }
        if !command(text(&snippet["command"], &p, 40, false)?) {
            return Err(err(&p, "非法命令"));
        }
        let mut aliases = HashSet::new();
        for alias in array(&snippet["aliases"], &p, 24)? {
            let value = text(alias, &p, 40, false)?;
            if !command(value) || !aliases.insert(value) {
                return Err(err(&p, "非法或重复别名"));
            }
        }
        text(&snippet["name"], &p, 80, false)?;
        text(&snippet["description"], &p, 1000, true)?;
        let slots = latex(
            text(&snippet["latex"], &p, 8192, false)?,
            &format!("{p}.latex"),
        )?;
        let mut parameters = HashSet::new();
        for (index, parameter) in array(&snippet["parameters"], &p, 24)?.iter().enumerate() {
            let pp = format!("{p}.parameters[{index}]");
            object(
                parameter,
                &pp,
                &["id", "name", "description", "defaultValue"],
            )?;
            let id = text(&parameter["id"], &pp, 32, false)?;
            if !identifier(id, true) || !parameters.insert(id.to_string()) {
                return Err(err(&pp, "非法或重复参数 ID"));
            }
            text(&parameter["name"], &pp, 80, false)?;
            text(&parameter["description"], &pp, 500, true)?;
            if !latex(text(&parameter["defaultValue"], &pp, 2048, false)?, &pp)?.is_empty() {
                return Err(err(&pp, "默认值不能声明槽位"));
            }
        }
        if slots.iter().any(|slot| !parameters.contains(slot))
            || parameters
                .iter()
                .any(|id| slots.iter().filter(|slot| *slot == id).count() != 1)
        {
            return Err(err(&p, "每个参数必须恰好对应一个槽位"));
        }
        if let Some(target) = snippet.get("wrapTarget") {
            if !parameters.contains(text(target, &p, 32, false)?) {
                return Err(err(&p, "包裹目标不存在"));
            }
        }
        if snippet
            .get("preferSelection")
            .is_some_and(|value| !value.is_boolean())
        {
            return Err(err(&p, "preferSelection 须为布尔值"));
        }
        let mut expanded = snippet["latex"].as_str().unwrap().to_string();
        for parameter in snippet["parameters"].as_array().unwrap() {
            expanded = expanded.replace(
                &format!("{{{{{}}}}}", parameter["id"].as_str().unwrap()),
                parameter["defaultValue"].as_str().unwrap(),
            );
        }
        latex(&expanded, &format!("{p}.latex(defaults)"))?;
    }
    if serde_json::to_vec(pack).map_err(|e| e.to_string())?.len() > FILE_LIMIT {
        return Err(err(path, "公式包文件过大"));
    }
    Ok(())
}
pub fn validate_state(state: &Value) -> Result<(), String> {
    object(
        state,
        "$",
        &["schemaVersion", "revision", "baseEnabled", "packs"],
    )?;
    if state["schemaVersion"] != 1
        || state["revision"]
            .as_u64()
            .is_none_or(|n| n > 9_007_199_254_740_991)
        || !state["baseEnabled"].is_boolean()
    {
        return Err(err("$", "存储版本、修订号或启用状态无效"));
    }
    let mut ids = HashSet::new();
    for (i, entry) in array(&state["packs"], "$.packs", 32)?.iter().enumerate() {
        let path = format!("$.packs[{i}]");
        object(entry, &path, &["enabled", "pack"])?;
        if !entry["enabled"].is_boolean() {
            return Err(err(&path, "启用状态无效"));
        }
        validate_pack(&entry["pack"], &format!("{path}.pack"))?;
        let id = entry["pack"]["id"].as_str().unwrap();
        if id == "basic-math" || !ids.insert(id) {
            return Err(err(&path, "重复或保留的公式包 ID"));
        }
    }
    if serde_json::to_vec(state).map_err(|e| e.to_string())?.len() > STATE_LIMIT {
        return Err(err("$", "公式库过大"));
    }
    Ok(())
}

fn read_state(path: &Path) -> Result<Option<Value>, String> {
    if !path.try_exists().map_err(|e| e.to_string())? {
        return Ok(None);
    }
    if fs::metadata(path).map_err(|e| e.to_string())?.len() > STATE_LIMIT as u64 {
        return Err("公式库文件过大；已保留原文件".into());
    }
    let bytes = bounded_read(path, STATE_LIMIT)?;
    let state: Value = serde_json::from_slice(&bytes)
        .map_err(|e| format!("公式库损坏；已保留原文件及备份：{e}"))?;
    validate_state(&state)?;
    Ok(Some(state))
}
fn bounded_read(path: &Path, limit: usize) -> Result<Vec<u8>, String> {
    let file = fs::File::open(path).map_err(|e| e.to_string())?;
    if !file.metadata().map_err(|e| e.to_string())?.is_file() {
        return Err("只能读取普通文件".into());
    }
    let mut bytes = Vec::new();
    file.take(limit as u64 + 1)
        .read_to_end(&mut bytes)
        .map_err(|e| e.to_string())?;
    if bytes.len() > limit {
        return Err("文件超过大小上限，未读取或导入".into());
    }
    Ok(bytes)
}
pub fn atomic_write(path: &Path, bytes: &[u8]) -> Result<(), String> {
    let parent = path.parent().ok_or("保存目录无效")?;
    fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    let temporary = parent.join(format!(
        ".mathinput-{}-{}.tmp",
        std::process::id(),
        SERIAL.fetch_add(1, Ordering::Relaxed)
    ));
    let result = (|| {
        let mut file = OpenOptions::new()
            .create_new(true)
            .write(true)
            .open(&temporary)
            .map_err(|e| e.to_string())?;
        file.write_all(bytes).map_err(|e| e.to_string())?;
        file.sync_all().map_err(|e| e.to_string())?;
        drop(file);
        fs::rename(&temporary, path).map_err(|e| e.to_string())
    })();
    if result.is_err() {
        let _ = fs::remove_file(&temporary);
    }
    result
}
pub struct PackFile {
    directory: PathBuf,
    lock: Mutex<()>,
}
impl PackFile {
    pub fn new(directory: PathBuf) -> Self {
        Self {
            directory,
            lock: Mutex::new(()),
        }
    }
    fn load(&self) -> Result<Option<Value>, String> {
        let _guard = self.lock.lock().map_err(|e| e.to_string())?;
        read_state(&self.directory.join("formula-packs.json"))
    }
    fn save(&self, mut state: Value, expected: u64) -> Result<Value, String> {
        validate_state(&state)?;
        let _guard = self.lock.lock().map_err(|e| e.to_string())?;
        let path = self.directory.join("formula-packs.json");
        let current = read_state(&path)?;
        if current
            .as_ref()
            .map_or(0, |value| value["revision"].as_u64().unwrap())
            != expected
        {
            return Err("公式库已经变化；请重新载入后再保存".into());
        }
        state["revision"] = json!(expected.checked_add(1).ok_or("修订号超限")?);
        validate_state(&state)?;
        let bytes = serde_json::to_vec(&state).map_err(|e| e.to_string())?;
        if let Some(current) = current {
            atomic_write(
                &self.directory.join("formula-packs.backup.json"),
                &serde_json::to_vec(&current).map_err(|e| e.to_string())?,
            )?;
        }
        atomic_write(&path, &bytes)?;
        Ok(state)
    }
    fn restore(&self) -> Result<Value, String> {
        let _guard = self.lock.lock().map_err(|e| e.to_string())?;
        let mut backup = read_state(&self.directory.join("formula-packs.backup.json"))?
            .ok_or("没有可恢复的公式库备份")?;
        let path = self.directory.join("formula-packs.json");
        if path.try_exists().map_err(|e| e.to_string())? {
            let bytes = bounded_read(&path, STATE_LIMIT)?;
            let name = format!(
                "formula-packs.corrupt-{}-{}.json",
                SystemTime::now()
                    .duration_since(UNIX_EPOCH)
                    .map_err(|e| e.to_string())?
                    .as_nanos(),
                SERIAL.fetch_add(1, Ordering::Relaxed)
            );
            let mut file = OpenOptions::new()
                .create_new(true)
                .write(true)
                .open(self.directory.join(name))
                .map_err(|e| e.to_string())?;
            file.write_all(&bytes).map_err(|e| e.to_string())?;
            file.sync_all().map_err(|e| e.to_string())?;
        }
        backup["revision"] = json!(backup["revision"]
            .as_u64()
            .unwrap()
            .checked_add(1)
            .ok_or("修订号超限")?);
        validate_state(&backup)?;
        atomic_write(
            &path,
            &serde_json::to_vec(&backup).map_err(|e| e.to_string())?,
        )?;
        Ok(backup)
    }
}
#[tauri::command]
pub fn load_formula_packs(packs: State<'_, PackFile>) -> Result<Option<Value>, String> {
    packs.load()
}
#[tauri::command]
pub fn save_formula_packs(
    packs: State<'_, PackFile>,
    state: Value,
    expected_revision: u64,
) -> Result<Value, String> {
    packs.save(state, expected_revision)
}
#[tauri::command]
pub fn restore_formula_pack_backup(packs: State<'_, PackFile>) -> Result<Value, String> {
    packs.restore()
}
#[tauri::command]
pub async fn pick_formula_pack_file(
    app: AppHandle,
    window: tauri::WebviewWindow,
) -> Result<Option<String>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let Some(file) = app
            .dialog()
            .file()
            .set_parent(&window)
            .add_filter("Formula Pack JSON", &["json"])
            .blocking_pick_file()
        else {
            return Ok(None);
        };
        let path = file.into_path().map_err(|e| e.to_string())?;
        if fs::metadata(&path).map_err(|e| e.to_string())?.len() > FILE_LIMIT as u64 {
            return Err("文件超过 256 KiB，未导入".into());
        }
        String::from_utf8(bounded_read(&path, FILE_LIMIT)?)
            .map(Some)
            .map_err(|e| format!("文件须为 UTF-8 JSON：{e}"))
    })
    .await
    .map_err(|e| e.to_string())?
}
#[tauri::command]
pub async fn export_formula_pack_file(
    app: AppHandle,
    window: tauri::WebviewWindow,
    pack: Value,
) -> Result<Option<String>, String> {
    validate_pack(&pack, "$")?;
    tauri::async_runtime::spawn_blocking(move || {
        let name = format!(
            "{}-{}.mathpack.json",
            pack["id"].as_str().unwrap(),
            pack["version"].as_str().unwrap()
        );
        let Some(file) = app
            .dialog()
            .file()
            .set_parent(&window)
            .add_filter("Formula Pack JSON", &["json"])
            .set_file_name(name)
            .blocking_save_file()
        else {
            return Ok(None);
        };
        let path = file.into_path().map_err(|e| e.to_string())?;
        let pretty = serde_json::to_vec_pretty(&pack).map_err(|e| e.to_string())?;
        let bytes = if pretty.len() <= FILE_LIMIT {
            pretty
        } else {
            serde_json::to_vec(&pack).map_err(|e| e.to_string())?
        };
        atomic_write(&path, &bytes)?;
        Ok(Some(path.display().to_string()))
    })
    .await
    .map_err(|e| e.to_string())?
}

#[cfg(test)]
mod tests {
    use super::*;
    fn test_dir() -> PathBuf {
        let root = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .parent()
            .unwrap()
            .join(".local/rust-pack-tests");
        fs::create_dir_all(&root).unwrap();
        root.join(format!(
            "run-{}-{}",
            std::process::id(),
            SERIAL.fetch_add(1, Ordering::Relaxed)
        ))
    }
    fn cleanup(dir: &Path) {
        let root = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .parent()
            .unwrap()
            .join(".local/rust-pack-tests")
            .canonicalize()
            .unwrap();
        let resolved = dir.canonicalize().unwrap();
        assert_eq!(resolved.parent(), Some(root.as_path()));
        assert!(resolved
            .file_name()
            .unwrap()
            .to_string_lossy()
            .starts_with("run-"));
        fs::remove_dir_all(resolved).unwrap();
    }
    fn sample() -> Value {
        serde_json::from_str(include_str!(
            "../../src/packs/examples/linear-algebra.mathpack.json"
        ))
        .unwrap()
    }
    fn state() -> Value {
        json!({"schemaVersion":1,"revision":0,"baseEnabled":true,"packs":[{"enabled":false,"pack":sample()}]})
    }
    #[test]
    fn bundled_pack_and_state_validate() {
        validate_pack(&sample(), "$").unwrap();
        let mut library = state();
        for source in [
            include_str!("../../src/packs/university/advanced-math.mathpack.json"),
            include_str!("../../src/packs/university/university-linear-algebra.mathpack.json"),
            include_str!("../../src/packs/university/math-notation.mathpack.json"),
        ] {
            let pack: Value = serde_json::from_str(source).unwrap();
            library["packs"]
                .as_array_mut()
                .unwrap()
                .push(json!({"enabled": false, "pack": pack}));
        }
        validate_state(&library).unwrap();
    }
    #[test]
    fn schema_paths_ids_and_scripts_are_rejected() {
        for value in [
            json!("../escape"),
            json!("/absolute"),
            json!("C:\\outside"),
            json!("UPPER"),
        ] {
            let mut p = sample();
            p["id"] = value;
            assert!(validate_pack(&p, "$").is_err());
        }
        for code in [
            "\\href{https://example.com}{x}",
            "<img src=x onerror=alert(1)>",
            "\\input{secret}",
            "\\placeholder[x]{1}",
        ] {
            let mut p = sample();
            p["snippets"][0]["latex"] = json!(code);
            assert!(validate_pack(&p, "$").is_err());
        }
        let mut p = sample();
        p["schemaVersion"] = json!(2);
        assert!(validate_pack(&p, "$").is_err());
        p = sample();
        p["futureField"] = json!(true);
        assert!(validate_pack(&p, "$").is_err());
    }
    #[test]
    fn duplicate_and_missing_slots_rejected() {
        let mut p = sample();
        p["snippets"][0]["parameters"][1]["id"] = json!("a");
        assert!(validate_pack(&p, "$").is_err());
        p = sample();
        p["snippets"][0]["wrapTarget"] = json!("absent");
        assert!(validate_pack(&p, "$").is_err());
    }
    #[test]
    fn persistence_atomic_revision_backup_and_corruption() {
        let dir = test_dir();
        let store = PackFile::new(dir.clone());
        assert!(store.load().unwrap().is_none());
        let saved = store.save(state(), 0).unwrap();
        assert_eq!(saved["revision"], 1);
        assert_eq!(store.load().unwrap().unwrap(), saved);
        assert!(store.save(state(), 0).is_err());
        let second = store.save(saved.clone(), 1).unwrap();
        assert_eq!(second["revision"], 2);
        assert_eq!(
            read_state(&dir.join("formula-packs.backup.json"))
                .unwrap()
                .unwrap(),
            saved
        );
        fs::write(dir.join("formula-packs.json"), "corrupt").unwrap();
        assert!(store.load().is_err());
        assert!(store.save(state(), 2).is_err());
        assert_eq!(
            fs::read_to_string(dir.join("formula-packs.json")).unwrap(),
            "corrupt"
        );
        let restored = store.restore().unwrap();
        assert_eq!(restored["packs"], saved["packs"]);
        assert!(fs::read_dir(&dir).unwrap().any(|entry| entry
            .unwrap()
            .file_name()
            .to_string_lossy()
            .starts_with("formula-packs.corrupt-")));
        cleanup(&dir);
    }
    #[test]
    fn failed_atomic_write_leaves_previous_bytes() {
        let dir = test_dir();
        fs::create_dir_all(&dir).unwrap();
        let target = dir.join("directory");
        fs::create_dir(&target).unwrap();
        fs::write(target.join("keep"), "original").unwrap();
        assert!(atomic_write(&target, b"replacement").is_err());
        assert_eq!(fs::read_to_string(target.join("keep")).unwrap(), "original");
        cleanup(&dir);
    }
    #[test]
    fn malformed_state_never_panics_or_writes() {
        let dir = test_dir();
        let store = PackFile::new(dir.clone());
        for value in [Value::Null, json!(3), json!([]), json!({})] {
            assert!(store.save(value, 0).is_err());
        }
        assert!(!dir.exists());
    }
    #[test]
    fn bounded_reads_and_depth_limits_are_enforced() {
        let dir = test_dir();
        fs::create_dir_all(&dir).unwrap();
        let file = dir.join("large.json");
        fs::write(&file, vec![b' '; 1025]).unwrap();
        assert!(bounded_read(&file, 1024).is_err());
        let mut p = sample();
        p["snippets"][0]["latex"] = json!("{".repeat(33) + "x" + &"}".repeat(33));
        assert!(validate_pack(&p, "$").is_err());
        cleanup(&dir);
    }
}
