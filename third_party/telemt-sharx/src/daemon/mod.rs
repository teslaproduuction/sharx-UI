//! Unix daemon support for telemt.
//!
//! Provides classic Unix daemonization (double-fork), PID file management,
//! and privilege dropping for running telemt as a background service.

use std::fs::{self, File, OpenOptions};
use std::io::{self, Read, Write};
use std::os::unix::fs::OpenOptionsExt;
use std::path::{Path, PathBuf};

use nix::errno::Errno;
use nix::fcntl::{Flock, FlockArg};
use nix::unistd::{self, ForkResult, Gid, Pid, Uid, chdir, close, fork, getpid, setsid};
use tracing::{debug, info, warn};

/// Default PID file location.
pub const DEFAULT_PID_FILE: &str = "/var/run/telemt.pid";

/// Daemon configuration options parsed from CLI.
#[derive(Debug, Clone, Default)]
pub struct DaemonOptions {
    /// Run as daemon (fork to background).
    pub daemonize: bool,
    /// Path to PID file.
    pub pid_file: Option<PathBuf>,
    /// User to run as after binding sockets.
    pub user: Option<String>,
    /// Group to run as after binding sockets.
    pub group: Option<String>,
    /// Working directory for the daemon.
    pub working_dir: Option<PathBuf>,
    /// Explicit foreground mode (for systemd Type=simple).
    pub foreground: bool,
}

impl DaemonOptions {
    /// Returns the effective PID file path.
    pub fn pid_file_path(&self) -> &Path {
        self.pid_file
            .as_deref()
            .unwrap_or(Path::new(DEFAULT_PID_FILE))
    }

    /// Returns true if we should actually daemonize.
    /// Foreground flag takes precedence.
    pub fn should_daemonize(&self) -> bool {
        self.daemonize && !self.foreground
    }
}

/// Error types for daemon operations.
#[derive(Debug, thiserror::Error)]
pub enum DaemonError {
    #[error("fork failed: {0}")]
    ForkFailed(#[source] nix::Error),

    #[error("setsid failed: {0}")]
    SetsidFailed(#[source] nix::Error),

    #[error("chdir failed: {0}")]
    ChdirFailed(#[source] nix::Error),

    #[error("failed to open /dev/null: {0}")]
    DevNullFailed(#[source] io::Error),

    #[error("failed to redirect stdio: {0}")]
    RedirectFailed(#[source] nix::Error),

    #[error("PID file error: {0}")]
    PidFile(String),

    #[error("another instance is already running (pid {0})")]
    AlreadyRunning(i32),

    #[error("user '{0}' not found")]
    UserNotFound(String),

    #[error("group '{0}' not found")]
    GroupNotFound(String),

    #[error("failed to set uid/gid: {0}")]
    PrivilegeDrop(#[source] nix::Error),

    #[error("io error: {0}")]
    Io(#[from] io::Error),
}

/// Result of a successful daemonize() call.
#[derive(Debug)]
pub enum DaemonizeResult {
    /// We are the parent process and should exit.
    Parent,
    /// We are the daemon child process and should continue.
    Child,
}

/// Performs classic Unix double-fork daemonization.
///
/// This detaches the process from the controlling terminal:
/// 1. First fork - parent exits, child continues
/// 2. setsid() - become session leader
/// 3. Second fork - ensure we can never acquire a controlling terminal
/// 4. chdir("/") - don't hold any directory open
/// 5. Redirect stdin/stdout/stderr to /dev/null
///
/// Returns `DaemonizeResult::Parent` in the original parent (which should exit),
/// or `DaemonizeResult::Child` in the final daemon child.
pub fn daemonize(working_dir: Option<&Path>) -> Result<DaemonizeResult, DaemonError> {
    // First fork
    match unsafe { fork() } {
        Ok(ForkResult::Parent { .. }) => {
            // Parent exits
            return Ok(DaemonizeResult::Parent);
        }
        Ok(ForkResult::Child) => {
            // Child continues
        }
        Err(e) => return Err(DaemonError::ForkFailed(e)),
    }

    // Create new session, become session leader
    setsid().map_err(DaemonError::SetsidFailed)?;

    // Second fork to ensure we can never acquire a controlling terminal
    match unsafe { fork() } {
        Ok(ForkResult::Parent { .. }) => {
            // Intermediate parent exits
            std::process::exit(0);
        }
        Ok(ForkResult::Child) => {
            // Final daemon child continues
        }
        Err(e) => return Err(DaemonError::ForkFailed(e)),
    }

    // Change working directory
    let target_dir = working_dir.unwrap_or(Path::new("/"));
    chdir(target_dir).map_err(DaemonError::ChdirFailed)?;

    // Redirect stdin, stdout, stderr to /dev/null
    redirect_stdio_to_devnull()?;

    Ok(DaemonizeResult::Child)
}

/// Redirects stdin, stdout, and stderr to /dev/null.
fn redirect_stdio_to_devnull() -> Result<(), DaemonError> {
    let devnull = File::options()
        .read(true)
        .write(true)
        .open("/dev/null")
        .map_err(DaemonError::DevNullFailed)?;

    let devnull_fd = std::os::unix::io::AsRawFd::as_raw_fd(&devnull);

    // Use libc::dup2 directly for redirecting standard file descriptors
    // nix 0.31's dup2 requires OwnedFd which doesn't work well with stdio fds
    unsafe {
        // Redirect stdin (fd 0)
        if libc::dup2(devnull_fd, 0) < 0 {
            return Err(DaemonError::RedirectFailed(Errno::last()));
        }
        // Redirect stdout (fd 1)
        if libc::dup2(devnull_fd, 1) < 0 {
            return Err(DaemonError::RedirectFailed(Errno::last()));
        }
        // Redirect stderr (fd 2)
        if libc::dup2(devnull_fd, 2) < 0 {
            return Err(DaemonError::RedirectFailed(Errno::last()));
        }
    }

    // Close original devnull fd if it's not one of the standard fds
    if devnull_fd > 2 {
        let _ = close(devnull_fd);
    }

    Ok(())
}

/// PID file manager with flock-based locking.
pub struct PidFile {
    path: PathBuf,
    file: Option<File>,
    locked: bool,
}

impl PidFile {
    /// Creates a new PID file manager for the given path.
    pub fn new<P: AsRef<Path>>(path: P) -> Self {
        Self {
            path: path.as_ref().to_path_buf(),
            file: None,
            locked: false,
        }
    }

    /// Checks if another instance is already running.
    ///
    /// Returns the PID of the running instance if one exists.
    pub fn check_running(&self) -> Result<Option<i32>, DaemonError> {
        if !self.path.exists() {
            return Ok(None);
        }

        // Try to read existing PID
        let mut contents = String::new();
        File::open(&self.path)
            .and_then(|mut f| f.read_to_string(&mut contents))
            .map_err(|e| {
                DaemonError::PidFile(format!("cannot read {}: {}", self.path.display(), e))
            })?;

        let pid: i32 = contents
            .trim()
            .parse()
            .map_err(|_| DaemonError::PidFile(format!("invalid PID in {}", self.path.display())))?;

        // Check if process is still running
        if is_process_running(pid) {
            Ok(Some(pid))
        } else {
            // Stale PID file
            debug!(pid, path = %self.path.display(), "Removing stale PID file");
            let _ = fs::remove_file(&self.path);
            Ok(None)
        }
    }

    /// Acquires the PID file lock and writes the current PID.
    ///
    /// Fails if another instance is already running.
    pub fn acquire(&mut self) -> Result<(), DaemonError> {
        // Check for running instance first
        if let Some(pid) = self.check_running()? {
            return Err(DaemonError::AlreadyRunning(pid));
        }

        // Ensure parent directory exists
        if let Some(parent) = self.path.parent() {
            if !parent.exists() {
                fs::create_dir_all(parent).map_err(|e| {
                    DaemonError::PidFile(format!(
                        "cannot create directory {}: {}",
                        parent.display(),
                        e
                    ))
                })?;
            }
        }

        // Open/create PID file with exclusive lock
        let file = OpenOptions::new()
            .write(true)
            .create(true)
            .truncate(true)
            .mode(0o644)
            .open(&self.path)
            .map_err(|e| {
                DaemonError::PidFile(format!("cannot open {}: {}", self.path.display(), e))
            })?;

        // Try to acquire exclusive lock (non-blocking)
        let flock = Flock::lock(file, FlockArg::LockExclusiveNonblock).map_err(|(_, errno)| {
            // Check if another instance grabbed the lock
            if let Some(pid) = self.check_running().ok().flatten() {
                DaemonError::AlreadyRunning(pid)
            } else {
                DaemonError::PidFile(format!("cannot lock {}: {}", self.path.display(), errno))
            }
        })?;

        // Write our PID
        let pid = getpid();
        let mut file = flock
            .unlock()
            .map_err(|(_, errno)| DaemonError::PidFile(format!("unlock failed: {}", errno)))?;

        writeln!(file, "{}", pid).map_err(|e| {
            DaemonError::PidFile(format!(
                "cannot write PID to {}: {}",
                self.path.display(),
                e
            ))
        })?;

        // Re-acquire lock and keep it
        let flock = Flock::lock(file, FlockArg::LockExclusiveNonblock).map_err(|(_, errno)| {
            DaemonError::PidFile(format!("cannot re-lock {}: {}", self.path.display(), errno))
        })?;

        self.file = Some(flock.unlock().map_err(|(_, errno)| {
            DaemonError::PidFile(format!("unlock for storage failed: {}", errno))
        })?);
        self.locked = true;

        info!(pid = pid.as_raw(), path = %self.path.display(), "PID file created");
        Ok(())
    }

    /// Releases the PID file lock and removes the file.
    pub fn release(&mut self) -> Result<(), DaemonError> {
        if let Some(file) = self.file.take() {
            drop(file);
        }
        self.locked = false;

        if self.path.exists() {
            fs::remove_file(&self.path).map_err(|e| {
                DaemonError::PidFile(format!("cannot remove {}: {}", self.path.display(), e))
            })?;
            debug!(path = %self.path.display(), "PID file removed");
        }

        Ok(())
    }

    /// Returns the path to this PID file.
    #[allow(dead_code)]
    pub fn path(&self) -> &Path {
        &self.path
    }
}

impl Drop for PidFile {
    fn drop(&mut self) {
        if self.locked {
            if let Err(e) = self.release() {
                warn!(error = %e, "Failed to clean up PID file on drop");
            }
        }
    }
}

/// Checks if a process with the given PID is running.
fn is_process_running(pid: i32) -> bool {
    // kill(pid, 0) checks if process exists without sending a signal
    nix::sys::signal::kill(Pid::from_raw(pid), None).is_ok()
}

// macOS gates nix::unistd::setgroups differently in the current dependency set,
// so call libc directly there while preserving the original nix path elsewhere.
fn set_supplementary_groups(gid: Gid) -> Result<(), nix::Error> {
    #[cfg(target_os = "macos")]
    {
        let groups = [gid.as_raw()];
        let rc = unsafe {
            libc::setgroups(
                i32::try_from(groups.len()).expect("single supplementary group must fit in c_int"),
                groups.as_ptr(),
            )
        };
        if rc == 0 { Ok(()) } else { Err(Errno::last()) }
    }

    #[cfg(not(target_os = "macos"))]
    {
        unistd::setgroups(&[gid])
    }
}

/// Drops privileges to the specified user and group.
///
/// This should be called after binding privileged ports but before entering
/// the main event loop.
pub fn drop_privileges(
    user: Option<&str>,
    group: Option<&str>,
    pid_file: Option<&PidFile>,
) -> Result<(), DaemonError> {
    let target_gid = if let Some(group_name) = group {
        Some(lookup_group(group_name)?)
    } else if let Some(user_name) = user {
        Some(lookup_user_primary_gid(user_name)?)
    } else {
        None
    };

    let target_uid = if let Some(user_name) = user {
        Some(lookup_user(user_name)?)
    } else {
        None
    };

    if (target_uid.is_some() || target_gid.is_some())
        && let Some(file) = pid_file.and_then(|pid| pid.file.as_ref())
    {
        unistd::fchown(file, target_uid, target_gid).map_err(DaemonError::PrivilegeDrop)?;
    }

    if let Some(gid) = target_gid {
        unistd::setgid(gid).map_err(DaemonError::PrivilegeDrop)?;
        set_supplementary_groups(gid).map_err(DaemonError::PrivilegeDrop)?;
        info!(gid = gid.as_raw(), "Dropped group privileges");
    }

    if let Some(uid) = target_uid {
        unistd::setuid(uid).map_err(DaemonError::PrivilegeDrop)?;
        info!(uid = uid.as_raw(), "Dropped user privileges");

        if uid.as_raw() != 0
            && let Some(pid) = pid_file
        {
            let parent = pid.path.parent().unwrap_or(Path::new("."));
            let probe_path = parent.join(format!(
                ".telemt_pid_probe_{}_{}",
                std::process::id(),
                getpid().as_raw()
            ));
            OpenOptions::new()
                .write(true)
                .create_new(true)
                .mode(0o600)
                .open(&probe_path)
                .map_err(|e| {
                    DaemonError::PidFile(format!(
                        "cannot create probe in PID directory {} as uid {} (pid cleanup will fail): {}",
                        parent.display(),
                        uid.as_raw(),
                        e
                    ))
                })?;
            fs::remove_file(&probe_path).map_err(|e| {
                DaemonError::PidFile(format!(
                    "cannot remove probe in PID directory {} as uid {} (pid cleanup will fail): {}",
                    parent.display(),
                    uid.as_raw(),
                    e
                ))
            })?;
        }
    }

    Ok(())
}

/// Looks up a user by name and returns their UID.
fn lookup_user(name: &str) -> Result<Uid, DaemonError> {
    // Use libc getpwnam
    let c_name =
        std::ffi::CString::new(name).map_err(|_| DaemonError::UserNotFound(name.to_string()))?;

    unsafe {
        let pwd = libc::getpwnam(c_name.as_ptr());
        if pwd.is_null() {
            Err(DaemonError::UserNotFound(name.to_string()))
        } else {
            Ok(Uid::from_raw((*pwd).pw_uid))
        }
    }
}

/// Looks up a user's primary GID by username.
fn lookup_user_primary_gid(name: &str) -> Result<Gid, DaemonError> {
    let c_name =
        std::ffi::CString::new(name).map_err(|_| DaemonError::UserNotFound(name.to_string()))?;

    unsafe {
        let pwd = libc::getpwnam(c_name.as_ptr());
        if pwd.is_null() {
            Err(DaemonError::UserNotFound(name.to_string()))
        } else {
            Ok(Gid::from_raw((*pwd).pw_gid))
        }
    }
}

/// Looks up a group by name and returns its GID.
fn lookup_group(name: &str) -> Result<Gid, DaemonError> {
    let c_name =
        std::ffi::CString::new(name).map_err(|_| DaemonError::GroupNotFound(name.to_string()))?;

    unsafe {
        let grp = libc::getgrnam(c_name.as_ptr());
        if grp.is_null() {
            Err(DaemonError::GroupNotFound(name.to_string()))
        } else {
            Ok(Gid::from_raw((*grp).gr_gid))
        }
    }
}

/// Reads PID from a PID file.
#[allow(dead_code)]
pub fn read_pid_file<P: AsRef<Path>>(path: P) -> Result<i32, DaemonError> {
    let path = path.as_ref();
    let mut contents = String::new();
    File::open(path)
        .and_then(|mut f| f.read_to_string(&mut contents))
        .map_err(|e| DaemonError::PidFile(format!("cannot read {}: {}", path.display(), e)))?;

    contents
        .trim()
        .parse()
        .map_err(|_| DaemonError::PidFile(format!("invalid PID in {}", path.display())))
}

/// Sends a signal to the process specified in a PID file.
#[allow(dead_code)]
pub fn signal_pid_file<P: AsRef<Path>>(
    path: P,
    signal: nix::sys::signal::Signal,
) -> Result<(), DaemonError> {
    let pid = read_pid_file(&path)?;

    if !is_process_running(pid) {
        return Err(DaemonError::PidFile(format!(
            "process {} from {} is not running",
            pid,
            path.as_ref().display()
        )));
    }

    nix::sys::signal::kill(Pid::from_raw(pid), signal)
        .map_err(|e| DaemonError::PidFile(format!("cannot signal process {}: {}", pid, e)))?;

    Ok(())
}

/// Returns the status of the daemon based on PID file.
#[allow(dead_code)]
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum DaemonStatus {
    /// Daemon is running with the given PID.
    Running(i32),
    /// PID file exists but process is not running.
    Stale(i32),
    /// No PID file exists.
    NotRunning,
}

/// Checks the daemon status from a PID file.
#[allow(dead_code)]
pub fn check_status<P: AsRef<Path>>(path: P) -> DaemonStatus {
    let path = path.as_ref();

    if !path.exists() {
        return DaemonStatus::NotRunning;
    }

    match read_pid_file(path) {
        Ok(pid) => {
            if is_process_running(pid) {
                DaemonStatus::Running(pid)
            } else {
                DaemonStatus::Stale(pid)
            }
        }
        Err(_) => DaemonStatus::NotRunning,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_daemon_options_default() {
        let opts = DaemonOptions::default();
        assert!(!opts.daemonize);
        assert!(!opts.should_daemonize());
        assert_eq!(opts.pid_file_path(), Path::new(DEFAULT_PID_FILE));
    }

    #[test]
    fn test_daemon_options_foreground_overrides() {
        let opts = DaemonOptions {
            daemonize: true,
            foreground: true,
            ..Default::default()
        };
        assert!(!opts.should_daemonize());
    }

    #[test]
    fn test_check_status_not_running() {
        let path = "/tmp/telemt_test_nonexistent.pid";
        assert_eq!(check_status(path), DaemonStatus::NotRunning);
    }

    #[test]
    fn test_pid_file_basic() {
        let path = "/tmp/telemt_test_pidfile.pid";
        let _ = fs::remove_file(path);

        let mut pf = PidFile::new(path);
        assert!(pf.check_running().unwrap().is_none());

        pf.acquire().unwrap();
        assert!(Path::new(path).exists());

        // Read it back
        let pid = read_pid_file(path).unwrap();
        assert_eq!(pid, std::process::id() as i32);

        pf.release().unwrap();
        assert!(!Path::new(path).exists());
    }
}
