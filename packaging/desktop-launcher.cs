using System;
using System.Diagnostics;
using System.IO;
using System.Net;
using System.Net.Sockets;
using System.Reflection;
using System.Runtime.InteropServices;
using System.Threading;
using System.Windows.Forms;

[assembly: AssemblyTitle("MotionFlow")]
[assembly: AssemblyDescription("MotionFlow desktop launcher")]
[assembly: AssemblyProduct("MotionFlow")]
[assembly: AssemblyVersion("1.0.0.0")]

internal static class MotionFlowLauncher
{
    private const uint JobObjectLimitKillOnJobClose = 0x00002000;
    private const int JobObjectExtendedLimitInformationClass = 9;

    [StructLayout(LayoutKind.Sequential)]
    private struct JobObjectBasicLimitInformation
    {
        public long PerProcessUserTimeLimit;
        public long PerJobUserTimeLimit;
        public uint LimitFlags;
        public UIntPtr MinimumWorkingSetSize;
        public UIntPtr MaximumWorkingSetSize;
        public uint ActiveProcessLimit;
        public UIntPtr Affinity;
        public uint PriorityClass;
        public uint SchedulingClass;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct IoCounters
    {
        public ulong ReadOperationCount;
        public ulong WriteOperationCount;
        public ulong OtherOperationCount;
        public ulong ReadTransferCount;
        public ulong WriteTransferCount;
        public ulong OtherTransferCount;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct JobObjectExtendedLimitInformation
    {
        public JobObjectBasicLimitInformation BasicLimitInformation;
        public IoCounters IoInfo;
        public UIntPtr ProcessMemoryLimit;
        public UIntPtr JobMemoryLimit;
        public UIntPtr PeakProcessMemoryUsed;
        public UIntPtr PeakJobMemoryUsed;
    }

    [DllImport("kernel32.dll", CharSet = CharSet.Unicode)]
    private static extern IntPtr CreateJobObject(IntPtr jobAttributes, string name);

    [DllImport("kernel32.dll")]
    private static extern bool SetInformationJobObject(IntPtr job, int informationClass, ref JobObjectExtendedLimitInformation information, uint length);

    [DllImport("kernel32.dll")]
    private static extern bool AssignProcessToJobObject(IntPtr job, IntPtr process);

    [DllImport("kernel32.dll")]
    private static extern bool CloseHandle(IntPtr handle);

    [STAThread]
    private static int Main()
    {
        bool ownsMutex;
        using (var mutex = new Mutex(true, "Local\\MotionFlowDesktopApplication", out ownsMutex))
        {
            if (!ownsMutex)
            {
                MessageBox.Show("MotionFlow is already running.", "MotionFlow", MessageBoxButtons.OK, MessageBoxIcon.Information);
                return 0;
            }

            var baseDirectory = AppDomain.CurrentDomain.BaseDirectory;
            var internalDirectory = Path.Combine(baseDirectory, "_internal");
            var nodePath = Path.Combine(internalDirectory, "runtime", "node.exe");
            var tsxPath = Path.Combine(internalDirectory, "node_modules", "tsx", "dist", "cli.mjs");
            if (!File.Exists(nodePath) || !File.Exists(tsxPath))
            {
                MessageBox.Show("The _internal runtime is incomplete. Please extract the complete ZIP archive first.", "MotionFlow", MessageBoxButtons.OK, MessageBoxIcon.Error);
                return 1;
            }

            var edgePath = FindEdge();
            if (edgePath == null)
            {
                MessageBox.Show("Microsoft Edge is required to open the MotionFlow application window.", "MotionFlow", MessageBoxButtons.OK, MessageBoxIcon.Error);
                return 1;
            }

            var port = FindAvailablePort();
            var job = CreateKillOnCloseJob();
            Process web = null;
            Process worker = null;
            try
            {
                web = StartNode(nodePath, tsxPath, "server.ts --production", internalDirectory, baseDirectory, port);
                worker = StartNode(nodePath, tsxPath, "src/worker.ts", internalDirectory, baseDirectory, port);
                if (job != IntPtr.Zero)
                {
                    AssignProcessToJobObject(job, web.Handle);
                    AssignProcessToJobObject(job, worker.Handle);
                }

                var url = "http://127.0.0.1:" + port;
                if (!WaitUntilReady(url, web, 120))
                {
                    MessageBox.Show("MotionFlow failed to start. Please check whether security software blocked the application.", "MotionFlow", MessageBoxButtons.OK, MessageBoxIcon.Error);
                    return 1;
                }

                var profileDirectory = Path.Combine(baseDirectory, "data", "desktop-profile");
                Directory.CreateDirectory(profileDirectory);
                var edge = Process.Start(new ProcessStartInfo
                {
                    FileName = edgePath,
                    Arguments = "--app=\"" + url + "\" --window-size=1440,900 --no-first-run --disable-extensions --disable-background-mode --user-data-dir=\"" + profileDirectory + "\"",
                    UseShellExecute = false,
                    WorkingDirectory = baseDirectory
                });
                if (edge == null) throw new InvalidOperationException("Unable to open the application window.");
                WaitForApplicationWindowToClose(edge);
                return 0;
            }
            catch (Exception error)
            {
                MessageBox.Show(error.Message, "MotionFlow", MessageBoxButtons.OK, MessageBoxIcon.Error);
                return 1;
            }
            finally
            {
                if (job != IntPtr.Zero) CloseHandle(job);
                StopProcess(web);
                StopProcess(worker);
            }
        }
    }

    private static Process StartNode(string nodePath, string tsxPath, string command, string internalDirectory, string baseDirectory, int port)
    {
        var info = new ProcessStartInfo
        {
            FileName = nodePath,
            Arguments = Quote(tsxPath) + " " + command,
            WorkingDirectory = internalDirectory,
            UseShellExecute = false,
            CreateNoWindow = true,
            WindowStyle = ProcessWindowStyle.Hidden
        };
        info.EnvironmentVariables["NODE_ENV"] = "production";
        info.EnvironmentVariables["PORT"] = port.ToString();
        info.EnvironmentVariables["MOTION_HOSTNAME"] = "127.0.0.1";
        info.EnvironmentVariables["MOTION_DOWNLOAD_MODE"] = "mp4";
        info.EnvironmentVariables["MOTION_DATA_DIR"] = Path.Combine(baseDirectory, "data");
        info.EnvironmentVariables["MOTION_MUSIC_DIR"] = Path.Combine(internalDirectory, "assets", "music");
        var process = Process.Start(info);
        if (process == null) throw new InvalidOperationException("Unable to start the MotionFlow runtime.");
        return process;
    }

    private static string FindEdge()
    {
        var candidates = new[]
        {
            Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFilesX86), "Microsoft", "Edge", "Application", "msedge.exe"),
            Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles), "Microsoft", "Edge", "Application", "msedge.exe"),
            Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "Microsoft", "Edge", "Application", "msedge.exe")
        };
        foreach (var candidate in candidates) if (File.Exists(candidate)) return candidate;
        return null;
    }

    private static int FindAvailablePort()
    {
        var listener = new TcpListener(IPAddress.Loopback, 0);
        listener.Start();
        var port = ((IPEndPoint)listener.LocalEndpoint).Port;
        listener.Stop();
        return port;
    }

    private static bool WaitUntilReady(string url, Process web, int attempts)
    {
        for (var index = 0; index < attempts; index++)
        {
            if (web.HasExited) return false;
            try
            {
                var request = (HttpWebRequest)WebRequest.Create(url + "/api/runtime-config");
                request.Timeout = 1000;
                request.ReadWriteTimeout = 1000;
                using (var response = (HttpWebResponse)request.GetResponse())
                {
                    if (response.StatusCode == HttpStatusCode.OK) return true;
                }
            }
            catch (WebException) { }
            Thread.Sleep(500);
        }
        return false;
    }

    private static void WaitForApplicationWindowToClose(Process edge)
    {
        var windowWasVisible = false;
        while (!edge.HasExited)
        {
            edge.Refresh();
            if (edge.MainWindowHandle != IntPtr.Zero) windowWasVisible = true;
            else if (windowWasVisible) return;
            Thread.Sleep(250);
        }
    }

    private static IntPtr CreateKillOnCloseJob()
    {
        var job = CreateJobObject(IntPtr.Zero, null);
        if (job == IntPtr.Zero) return IntPtr.Zero;
        var information = new JobObjectExtendedLimitInformation();
        information.BasicLimitInformation.LimitFlags = JobObjectLimitKillOnJobClose;
        if (!SetInformationJobObject(job, JobObjectExtendedLimitInformationClass, ref information, (uint)Marshal.SizeOf(information)))
        {
            CloseHandle(job);
            return IntPtr.Zero;
        }
        return job;
    }

    private static string Quote(string value)
    {
        return "\"" + value.Replace("\"", "\\\"") + "\"";
    }

    private static void StopProcess(Process process)
    {
        if (process == null) return;
        try { if (!process.HasExited) process.Kill(); }
        catch { }
        process.Dispose();
    }
}
