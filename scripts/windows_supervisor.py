"""Own one Windows process tree using a kill-on-close Job Object.

Standard library only. Assign the child while suspended, before it can create
descendants. Closing the terminal, killing this supervisor, or losing the
outer launcher's stdin pipe all reap only this session's process tree.
"""
from __future__ import annotations

import ctypes
from ctypes import wintypes
import os
import signal
import subprocess
import sys
import threading


def supervise(argv: list[str]) -> int:
    if sys.platform != "win32":
        raise RuntimeError("This supervisor is Windows-only.")
    if not argv:
        raise ValueError("Missing child command.")
    import msvcrt

    kernel = ctypes.WinDLL("kernel32", use_last_error=True)
    size_t = ctypes.c_size_t

    class BasicLimits(ctypes.Structure):
        _fields_ = [("ProcessTime", ctypes.c_longlong), ("JobTime", ctypes.c_longlong),
                    ("LimitFlags", wintypes.DWORD), ("MinWorkingSet", size_t),
                    ("MaxWorkingSet", size_t), ("ActiveProcesses", wintypes.DWORD),
                    ("Affinity", size_t), ("Priority", wintypes.DWORD), ("Scheduling", wintypes.DWORD)]

    class IoCounters(ctypes.Structure):
        _fields_ = [(name, ctypes.c_ulonglong) for name in
                    ("ReadOps", "WriteOps", "OtherOps", "ReadBytes", "WriteBytes", "OtherBytes")]

    class ExtendedLimits(ctypes.Structure):
        _fields_ = [("Basic", BasicLimits), ("Io", IoCounters), ("ProcessMemory", size_t),
                    ("JobMemory", size_t), ("PeakProcessMemory", size_t), ("PeakJobMemory", size_t)]

    class StartupInfo(ctypes.Structure):
        _fields_ = [("cb", wintypes.DWORD), ("reserved", wintypes.LPWSTR),
                    ("desktop", wintypes.LPWSTR), ("title", wintypes.LPWSTR),
                    *[(name, wintypes.DWORD) for name in ("x", "y", "width", "height", "xChars", "yChars", "fill", "flags")],
                    ("show", wintypes.WORD), ("reservedSize", wintypes.WORD),
                    ("reservedBytes", ctypes.POINTER(wintypes.BYTE)),
                    ("stdin", wintypes.HANDLE), ("stdout", wintypes.HANDLE), ("stderr", wintypes.HANDLE)]

    class ProcessInfo(ctypes.Structure):
        _fields_ = [("process", wintypes.HANDLE), ("thread", wintypes.HANDLE),
                    ("pid", wintypes.DWORD), ("threadId", wintypes.DWORD)]

    kernel.CreateJobObjectW.argtypes = [ctypes.c_void_p, wintypes.LPCWSTR]
    kernel.CreateJobObjectW.restype = wintypes.HANDLE
    kernel.SetInformationJobObject.argtypes = [wintypes.HANDLE, ctypes.c_int, ctypes.c_void_p, wintypes.DWORD]
    kernel.SetInformationJobObject.restype = wintypes.BOOL
    kernel.AssignProcessToJobObject.argtypes = [wintypes.HANDLE, wintypes.HANDLE]
    kernel.AssignProcessToJobObject.restype = wintypes.BOOL
    kernel.CreateProcessW.argtypes = [wintypes.LPCWSTR, wintypes.LPWSTR, ctypes.c_void_p, ctypes.c_void_p,
                                    wintypes.BOOL, wintypes.DWORD, ctypes.c_void_p, wintypes.LPCWSTR,
                                    ctypes.POINTER(StartupInfo), ctypes.POINTER(ProcessInfo)]
    kernel.CreateProcessW.restype = wintypes.BOOL
    kernel.ResumeThread.argtypes = [wintypes.HANDLE]
    kernel.ResumeThread.restype = wintypes.DWORD
    kernel.WaitForSingleObject.argtypes = [wintypes.HANDLE, wintypes.DWORD]
    kernel.WaitForSingleObject.restype = wintypes.DWORD
    kernel.GetExitCodeProcess.argtypes = [wintypes.HANDLE, ctypes.POINTER(wintypes.DWORD)]
    kernel.GetExitCodeProcess.restype = wintypes.BOOL
    kernel.TerminateProcess.argtypes = [wintypes.HANDLE, wintypes.UINT]
    kernel.TerminateProcess.restype = wintypes.BOOL
    kernel.TerminateJobObject.argtypes = [wintypes.HANDLE, wintypes.UINT]
    kernel.TerminateJobObject.restype = wintypes.BOOL
    kernel.GenerateConsoleCtrlEvent.argtypes = [wintypes.DWORD, wintypes.DWORD]
    kernel.GenerateConsoleCtrlEvent.restype = wintypes.BOOL
    kernel.CloseHandle.argtypes = [wintypes.HANDLE]
    kernel.CloseHandle.restype = wintypes.BOOL

    def checked(result):
        if not result:
            raise ctypes.WinError(ctypes.get_last_error())
        return result

    job = checked(kernel.CreateJobObjectW(None, None))
    process = ProcessInfo()
    assigned = False
    stop = threading.Event()
    try:
        limits = ExtendedLimits()
        limits.Basic.LimitFlags = 0x00002000  # JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE
        checked(kernel.SetInformationJobObject(job, 9, ctypes.byref(limits), ctypes.sizeof(limits)))
        startup = StartupInfo()
        startup.cb = ctypes.sizeof(startup)
        startup.flags = 0x00000100 | 0x00000001  # USESTDHANDLES | USESHOWWINDOW
        startup.show = 0  # SW_HIDE: no extra console windows.
        environment = dict(os.environ, GALAXAI_MANAGED_SESSION="1")
        env_block = ctypes.create_unicode_buffer("\0".join(f"{k}={v}" for k, v in sorted(environment.items(), key=lambda item: item[0].upper())) + "\0\0")
        with open(os.devnull, "rb") as null_input:
            handles = [msvcrt.get_osfhandle(stream.fileno()) for stream in (null_input, sys.stdout, sys.stderr)]
            original_inheritance = [os.get_handle_inheritable(handle) for handle in handles]
            try:
                for handle in handles:
                    os.set_handle_inheritable(handle, True)
                startup.stdin, startup.stdout, startup.stderr = handles
                # CREATE_SUSPENDED | CREATE_NEW_PROCESS_GROUP | CREATE_UNICODE_ENVIRONMENT
                checked(kernel.CreateProcessW(argv[0], ctypes.create_unicode_buffer(subprocess.list2cmdline(argv)),
                                              None, None, True, 0x4 | 0x200 | 0x400, env_block, os.getcwd(),
                                              ctypes.byref(startup), ctypes.byref(process)))
            finally:
                for handle, inherited in zip(handles, original_inheritance):
                    os.set_handle_inheritable(handle, inherited)
        checked(kernel.AssignProcessToJobObject(job, process.process))
        assigned = True
        if kernel.ResumeThread(process.thread) == 0xFFFFFFFF:
            raise ctypes.WinError(ctypes.get_last_error())
        kernel.CloseHandle(process.thread)
        process.thread = None

        def parent_disconnected():
            try:
                # Do not hold BufferedReader's lock in a daemon thread during
                # Python finalization when the application exits on its own.
                os.read(sys.stdin.fileno(), 1)
            finally:
                stop.set()

        threading.Thread(target=parent_disconnected, daemon=True).start()
        signal.signal(signal.SIGINT, lambda *_: stop.set())
        signal.signal(signal.SIGTERM, lambda *_: stop.set())
        if hasattr(signal, "SIGBREAK"):
            signal.signal(signal.SIGBREAK, lambda *_: stop.set())
        while kernel.WaitForSingleObject(process.process, 100) == 0x102:  # WAIT_TIMEOUT
            if stop.is_set():
                signalled = kernel.GenerateConsoleCtrlEvent(1, process.pid)  # CTRL_BREAK
                if not signalled or kernel.WaitForSingleObject(process.process, 5000) == 0x102:
                    checked(kernel.TerminateJobObject(job, 0))
                kernel.WaitForSingleObject(process.process, 3000)
                return 0
        exit_code = wintypes.DWORD()
        checked(kernel.GetExitCodeProcess(process.process, ctypes.byref(exit_code)))
        return int(exit_code.value)
    finally:
        if process.process and not assigned:
            kernel.TerminateProcess(process.process, 1)
        if process.thread:
            kernel.CloseHandle(process.thread)
        if process.process:
            kernel.CloseHandle(process.process)
        # The handle is never inherited. Closing it also reaps descendants
        # when the launcher fails during startup or its child exits abruptly.
        kernel.CloseHandle(job)


if __name__ == "__main__":
    try:
        sys.exit(supervise(sys.argv[1:]))
    except Exception as error:
        print(f"[error] Windows session supervisor: {error}", file=sys.stderr, flush=True)
        sys.exit(1)
