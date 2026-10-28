using System;
using System.IO;
using System.Drawing;
using System.Text;
using System.Security.Cryptography;
using System.Runtime.InteropServices;
using System.Web.Script.Serialization;
using System.Windows.Forms;

// Test-only child process. Its file protocol can operate ONLY its own two
// empty text boxes. No external application controls or clipboard writes.
public sealed class NativeFixture : Form {
    [DllImport("user32.dll")] static extern IntPtr GetForegroundWindow();
    [DllImport("user32.dll")] static extern bool AllowSetForegroundWindow(uint processId);
    readonly TextBox primary = new TextBox();
    readonly TextBox secondary = new TextBox();
    readonly Timer poll = new Timer();
    readonly string directory;
    readonly JavaScriptSerializer serializer = new JavaScriptSerializer();
    readonly uint driverPid;
    readonly DateTime expires = DateTime.UtcNow.AddMinutes(3);
    string lastCommand = "";
    string baselineHash;
    string failure;

    NativeFixture(string directory, string role, uint driverPid) {
        this.directory = directory;
        this.driverPid = driverPid;
        Directory.CreateDirectory(directory);
        Text = "Math Input isolated native test / " + role;
        ClientSize = new Size(640, 265);
        StartPosition = FormStartPosition.Manual;
        Location = role == "target" ? new Point(100, 100) : new Point(780, 180);
        var hint = new Label { AutoSize = true, Location = new Point(18, 15), Text = "仅用于本项目原生桥接测试，结束后自动关闭" };
        primary.Multiline = true; primary.AccessibleName = "Native acceptance primary";
        primary.SetBounds(18, 45, 600, 60);
        secondary.Multiline = true; secondary.AccessibleName = "Native acceptance secondary";
        secondary.SetBounds(18, 125, 600, 60);
        var start = new Button { Text = "开始验证（仅操作专用测试窗口）", Location = new Point(18, 205), Size = new Size(340, 36) };
        start.Click += delegate { primary.Focus(); GrantForegroundToDriver(); Save(); };
        Controls.AddRange(new Control[] { hint, primary, secondary, start });
        Activated += delegate { GrantForegroundToDriver(); };
        primary.TextChanged += delegate { Save(); };
        secondary.TextChanged += delegate { Save(); };
        poll.Interval = 60;
        poll.Tick += delegate {
            try {
                if (DateTime.UtcNow >= expires) { Close(); return; }
                string path = Path.Combine(directory, "command.txt");
                if (File.Exists(path)) {
                    string[] lines = File.ReadAllLines(path);
                    if (lines.Length == 2 && lines[0] != lastCommand) {
                        switch (lines[1]) {
                            case "primary": Activate(); primary.Focus(); break;
                            case "secondary": secondary.Focus(); break;
                            case "reset": primary.Clear(); secondary.Clear(); break;
                            case "baseline": baselineHash = HashText(); break;
                            case "close": Close(); return;
                            default: throw new InvalidOperationException("Unknown fixture command");
                        }
                        lastCommand = lines[0];
                    }
                }
                Save();
            } catch (Exception error) { failure = error.GetType().Name; Save(); }
        };
        Shown += delegate { primary.Focus(); poll.Start(); Save(); };
    }

    void GrantForegroundToDriver() {
        // Documented cooperative hand-off AFTER this test-owned process has
        // foreground rights. It cannot force activation or bypass Windows locks.
        if (GetForegroundWindow() == Handle) AllowSetForegroundWindow(driverPid);
    }

    static string HashString(string text) {
        using (var sha = SHA256.Create()) {
            return BitConverter.ToString(sha.ComputeHash(Encoding.UTF8.GetBytes(text))).Replace("-", "");
        }
    }
    static string HashText() { return HashString(Clipboard.ContainsText() ? Clipboard.GetText() : ""); }

    void Save() {
        if (!IsHandleCreated || IsDisposed) return;
        string hash = null; string[] formats = null;
        try { hash = HashText(); var data = Clipboard.GetDataObject(); formats = data == null ? new string[0] : data.GetFormats(false); Array.Sort(formats, StringComparer.Ordinal); }
        catch { /* A temporarily open clipboard is observed as unavailable. */ }
        var snapshot = new {
            pid = System.Diagnostics.Process.GetCurrentProcess().Id,
            window = Handle.ToInt64(), primaryWindow = primary.Handle.ToInt64(), secondaryWindow = secondary.Handle.ToInt64(),
            foreground = GetForegroundWindow() == Handle,
            primaryFocused = primary.Focused, secondaryFocused = secondary.Focused,
            text = primary.Text, secondaryText = secondary.Text,
            clipboardHash = hash, clipboardBaselineHash = baselineHash, formats = formats,
            expectedFormulaHash = File.Exists(Path.Combine(directory, "expected-formula.txt")) ? HashString(File.ReadAllText(Path.Combine(directory, "expected-formula.txt"), Encoding.UTF8)) : null,
            command = lastCommand, failure = failure
        };
        string temporary = Path.Combine(directory, "snapshot.tmp");
        string path = Path.Combine(directory, "snapshot.json");
        try {
            File.WriteAllText(temporary, serializer.Serialize(snapshot), new UTF8Encoding(false));
            if (File.Exists(path)) File.Replace(temporary, path, null); else File.Move(temporary, path);
        } catch (IOException) { /* Retry on the next tick if the reader held it. */ }
    }

    [STAThread]
    public static void Main(string[] args) {
        if (args.Length != 3) throw new ArgumentException("Expected run directory, role and test-driver PID");
        uint driverPid = uint.Parse(args[2]);
        if (System.Diagnostics.Process.GetProcessById((int)driverPid).ProcessName != "native_acceptance") throw new InvalidOperationException("Only the test-owned driver may receive foreground permission");
        Application.EnableVisualStyles();
        Application.SetCompatibleTextRenderingDefault(false);
        Application.Run(new NativeFixture(Path.GetFullPath(args[0]), args[1], driverPid));
    }
}
