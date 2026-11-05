//! Own bounded command descendants even after their parent exits. PTYs do not use this.
use std::os::windows::io::AsRawHandle;
use std::process::{Child, Command};
use windows_sys::Win32::{
    Foundation::{CloseHandle, HANDLE, INVALID_HANDLE_VALUE},
    System::{
        Diagnostics::ToolHelp::{
            CreateToolhelp32Snapshot, Thread32First, Thread32Next, TH32CS_SNAPTHREAD, THREADENTRY32,
        },
        JobObjects::{
            AssignProcessToJobObject, CreateJobObjectW, JobObjectExtendedLimitInformation,
            SetInformationJobObject, JOBOBJECT_EXTENDED_LIMIT_INFORMATION,
            JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE,
        },
        Threading::{
            OpenThread, ResumeThread, CREATE_NO_WINDOW, CREATE_SUSPENDED, THREAD_SUSPEND_RESUME,
        },
    },
};

struct Handle(HANDLE);
impl Drop for Handle {
    fn drop(&mut self) {
        // SAFETY: this wrapper owns a valid handle and closes it exactly once.
        unsafe { CloseHandle(self.0) };
    }
}

pub struct CommandJob(Handle);
impl CommandJob {
    pub fn new() -> Result<Self, String> {
        // SAFETY: no inherited handle or optional name; the structure is initialized below.
        unsafe {
            let job = CreateJobObjectW(std::ptr::null(), std::ptr::null());
            if job.is_null() {
                return Err(std::io::Error::last_os_error().to_string());
            }
            let job = Self(Handle(job));
            let mut limits: JOBOBJECT_EXTENDED_LIMIT_INFORMATION = std::mem::zeroed();
            limits.BasicLimitInformation.LimitFlags = JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE;
            if SetInformationJobObject(
                job.0 .0,
                JobObjectExtendedLimitInformation,
                (&limits as *const JOBOBJECT_EXTENDED_LIMIT_INFORMATION).cast(),
                std::mem::size_of_val(&limits) as u32,
            ) == 0
            {
                return Err(std::io::Error::last_os_error().to_string());
            }
            Ok(job)
        }
    }

    pub fn prepare(command: &mut Command) {
        use std::os::windows::process::CommandExt;
        // Suspend before user code runs: a fast parent cannot escape job ownership
        // by spawning descendants and exiting before AssignProcessToJobObject.
        command.creation_flags(CREATE_NO_WINDOW | CREATE_SUSPENDED);
    }

    pub fn attach_and_resume(&self, child: &Child) -> Result<(), String> {
        // SAFETY: all handles are owned for the duration of these calls. The child
        // is suspended, so it has only its initial thread and cannot spawn children.
        unsafe {
            if AssignProcessToJobObject(self.0 .0, child.as_raw_handle().cast()) == 0 {
                return Err(format!(
                    "Cannot own command process tree: {}",
                    std::io::Error::last_os_error()
                ));
            }
            let snapshot = CreateToolhelp32Snapshot(TH32CS_SNAPTHREAD, 0);
            if snapshot == INVALID_HANDLE_VALUE {
                return Err(std::io::Error::last_os_error().to_string());
            }
            let snapshot = Handle(snapshot);
            let mut entry: THREADENTRY32 = std::mem::zeroed();
            entry.dwSize = std::mem::size_of_val(&entry) as u32;
            let mut found = Thread32First(snapshot.0, &mut entry);
            while found != 0 {
                if entry.th32OwnerProcessID == child.id() {
                    let thread = OpenThread(THREAD_SUSPEND_RESUME, 0, entry.th32ThreadID);
                    if thread.is_null() {
                        return Err(std::io::Error::last_os_error().to_string());
                    }
                    let thread = Handle(thread);
                    if ResumeThread(thread.0) == u32::MAX {
                        return Err(std::io::Error::last_os_error().to_string());
                    }
                    return Ok(());
                }
                found = Thread32Next(snapshot.0, &mut entry);
            }
            Err("Cannot find the suspended command thread".into())
        }
    }
}
