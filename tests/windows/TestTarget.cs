using System;
using System.IO;
using System.Drawing;
using System.Text;
using System.Security.Cryptography;
using System.Runtime.InteropServices;
using System.Windows.Forms;

// An isolated, ordinary edit control for end-to-end testing. It never reads
// other applications or logs the clipboard content. Only clipboard text hashes
// and data-format names are recorded after an explicit baseline click.
public sealed class TestTarget : Form {
    [DllImport("user32.dll")] static extern IntPtr GetForegroundWindow();
    readonly TextBox target = new TextBox();
    readonly Label status = new Label();
    readonly Timer timer = new Timer();
    readonly string directory;
    string baselineHash;
    string[] baselineFormats = new string[0];
    string clipboardHash;
    string[] clipboardFormats = new string[0];

    public TestTarget(string directory) {
        this.directory = directory;
        Directory.CreateDirectory(directory);
        Text = "Math Input 安全测试输入框";
        Name = "MathInputTestTarget";
        ClientSize = new Size(760, 240);
        StartPosition = FormStartPosition.Manual;
        Location = new Point(70, 100);
        Font = new Font("Microsoft YaHei UI", 11);
        var hint = new Label { Text = "专用本地测试框：记录基线后，在下方输入框按 Ctrl + Alt + M", AutoSize = true, Location = new Point(20, 20) };
        target.Name = "FormulaTarget";
        target.AccessibleName = "公式输出测试输入框";
        target.Multiline = true;
        target.AcceptsReturn = true;
        target.Location = new Point(20, 55);
        target.Size = new Size(720, 90);
        target.Font = new Font("Consolas", 16);
        var baseline = new Button { Text = "记录剪贴板基线", Location = new Point(20, 160), Size = new Size(180, 36) };
        status.Location = new Point(220, 165);
        status.Size = new Size(510, 65);
        baseline.Click += delegate {
            try { var data = Clipboard.GetDataObject(); baselineFormats = data == null ? new string[0] : data.GetFormats(false); Array.Sort(baselineFormats, StringComparer.Ordinal); baselineHash = HashText(); status.Text = "基线已记录（只记录格式与文本哈希）"; Save(); target.Focus(); }
            catch (Exception error) { status.Text = error.GetType().Name; }
        };
        target.TextChanged += delegate { Save(); };
        timer.Interval = 250;
        timer.Tick += delegate {
            try {
                clipboardHash = HashText();
                var data = Clipboard.GetDataObject(); clipboardFormats = data == null ? new string[0] : data.GetFormats(false);
                Array.Sort(clipboardFormats, StringComparer.Ordinal);
                if (baselineHash != null) status.Text = baselineHash == clipboardHash ? "剪贴板文本已恢复到基线" : "剪贴板文本与基线不同";
                Save();
            } catch { status.Text = "剪贴板暂不可读"; }
        };
        Controls.AddRange(new Control[] { hint, target, baseline, status });
        Shown += delegate { target.Focus(); timer.Start(); Save(); };
    }
    static string HashText() {
        using (var sha = SHA256.Create()) { return BitConverter.ToString(sha.ComputeHash(Encoding.UTF8.GetBytes(Clipboard.ContainsText() ? Clipboard.GetText() : ""))).Replace("-", ""); }
    }
    void Save() {
        File.WriteAllText(Path.Combine(directory, "fixture-text.txt"), target.Text, new UTF8Encoding(false));
        File.WriteAllLines(Path.Combine(directory, "fixture-clipboard.txt"), new string[] {
            "formats=" + string.Join(",", baselineFormats), "formatsAfter=" + string.Join(",", clipboardFormats),
            "before=" + baselineHash, "after=" + clipboardHash,
            "textRestored=" + (baselineHash != null && baselineHash == clipboardHash),
            "formatsRestored=" + (string.Join(",", baselineFormats) == string.Join(",", clipboardFormats)),
            "foreground=" + (GetForegroundWindow() == Handle), "targetFocused=" + target.Focused
        }, new UTF8Encoding(false));
    }
    [STAThread]
    public static void Main(string[] args) {
        Application.EnableVisualStyles();
        Application.SetCompatibleTextRenderingDefault(false);
        Application.Run(new TestTarget(args.Length > 0 ? args[0] : Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "reports")));
    }
}
