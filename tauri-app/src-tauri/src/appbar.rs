// ─── Windows AppBar docking for the Focus Bar window ─────────────────────────
// Registers a window as a shell appbar (SHAppBarMessage), so it RESERVES a
// strip of the work area at the top edge — maximized windows start below it,
// like the taskbar. On other platforms the commands return an error and the
// frontend falls back to a plain always-on-top overlay.

#[cfg(windows)]
mod win {
    use std::collections::HashMap;
    use std::sync::{Mutex, OnceLock};
    use windows::Win32::Foundation::{HWND, LPARAM, LRESULT, RECT, WPARAM};
    use windows::Win32::Graphics::Gdi::{
        GetMonitorInfoW, MonitorFromWindow, MONITORINFO, MONITOR_DEFAULTTONEAREST,
    };
    use windows::Win32::UI::Shell::{
        DefSubclassProc, RemoveWindowSubclass, SetWindowSubclass, SHAppBarMessage, ABE_TOP,
        ABM_NEW, ABM_QUERYPOS, ABM_REMOVE, ABM_SETPOS, ABN_POSCHANGED, APPBARDATA,
    };
    use windows::Win32::UI::WindowsAndMessaging::{
        SetWindowPos, SWP_NOACTIVATE, SWP_NOZORDER, WM_APP,
    };

    /// Private message the shell uses to notify us (ABN_* in wParam).
    const APPBAR_CALLBACK: u32 = WM_APP + 0x0042;
    const SUBCLASS_ID: usize = 0x544F_4642; // "TOFB"

    /// Registered appbars: raw HWND → reserved height in physical px.
    fn registry() -> &'static Mutex<HashMap<isize, i32>> {
        static REG: OnceLock<Mutex<HashMap<isize, i32>>> = OnceLock::new();
        REG.get_or_init(|| Mutex::new(HashMap::new()))
    }

    /// Negotiate the reserved strip with the shell and move the window into it.
    /// QUERYPOS lets the system adjust for other appbars (e.g. a top-docked
    /// taskbar), then SETPOS commits the reservation.
    unsafe fn negotiate(hwnd: HWND, height: i32) {
        let hmon = MonitorFromWindow(hwnd, MONITOR_DEFAULTTONEAREST);
        let mut mi: MONITORINFO = std::mem::zeroed();
        mi.cbSize = std::mem::size_of::<MONITORINFO>() as u32;
        if !GetMonitorInfoW(hmon, &mut mi).as_bool() {
            return;
        }
        let mut abd: APPBARDATA = std::mem::zeroed();
        abd.cbSize = std::mem::size_of::<APPBARDATA>() as u32;
        abd.hWnd = hwnd;
        abd.uCallbackMessage = APPBAR_CALLBACK;
        abd.uEdge = ABE_TOP;
        abd.rc = RECT {
            left: mi.rcMonitor.left,
            top: mi.rcMonitor.top,
            right: mi.rcMonitor.right,
            bottom: mi.rcMonitor.top + height,
        };
        SHAppBarMessage(ABM_QUERYPOS, &mut abd);
        abd.rc.bottom = abd.rc.top + height;
        SHAppBarMessage(ABM_SETPOS, &mut abd);
        let _ = SetWindowPos(
            hwnd,
            None,
            abd.rc.left,
            abd.rc.top,
            abd.rc.right - abd.rc.left,
            abd.rc.bottom - abd.rc.top,
            SWP_NOZORDER | SWP_NOACTIVATE,
        );
    }

    /// Re-negotiates when the shell reports layout changes (taskbar moved,
    /// display/DPI changed, another appbar appeared).
    unsafe extern "system" fn subclass_proc(
        hwnd: HWND,
        umsg: u32,
        wparam: WPARAM,
        lparam: LPARAM,
        _uid: usize,
        _data: usize,
    ) -> LRESULT {
        if umsg == APPBAR_CALLBACK && wparam.0 as u32 == ABN_POSCHANGED {
            let height = registry()
                .lock()
                .ok()
                .and_then(|m| m.get(&(hwnd.0 as isize)).copied());
            if let Some(h) = height {
                negotiate(hwnd, h);
            }
        }
        DefSubclassProc(hwnd, umsg, wparam, lparam)
    }

    unsafe fn remove_appbar(raw: isize) {
        let existed = registry()
            .lock()
            .map(|mut m| m.remove(&raw).is_some())
            .unwrap_or(false);
        if !existed {
            return;
        }
        let hwnd = HWND(raw as *mut _);
        let mut abd: APPBARDATA = std::mem::zeroed();
        abd.cbSize = std::mem::size_of::<APPBARDATA>() as u32;
        abd.hWnd = hwnd;
        SHAppBarMessage(ABM_REMOVE, &mut abd);
        let _ = RemoveWindowSubclass(hwnd, Some(subclass_proc), SUBCLASS_ID);
    }

    /// Register (once) and reserve `height` px. Must run on the window thread.
    pub unsafe fn dock(raw: isize, height: i32) {
        let hwnd = HWND(raw as *mut _);
        {
            let mut map = registry().lock().unwrap();
            if !map.contains_key(&raw) {
                let mut abd: APPBARDATA = std::mem::zeroed();
                abd.cbSize = std::mem::size_of::<APPBARDATA>() as u32;
                abd.hWnd = hwnd;
                abd.uCallbackMessage = APPBAR_CALLBACK;
                SHAppBarMessage(ABM_NEW, &mut abd);
                let _ = SetWindowSubclass(hwnd, Some(subclass_proc), SUBCLASS_ID, 0);
            }
            map.insert(raw, height);
        }
        negotiate(hwnd, height);
    }

    pub unsafe fn undock(raw: isize) {
        remove_appbar(raw)
    }

    /// Releases every reserved strip. Runs on the main thread
    /// (window events are dispatched there).
    pub fn cleanup_all() {
        let keys: Vec<isize> = registry()
            .lock()
            .map(|m| m.keys().copied().collect())
            .unwrap_or_default();
        for raw in keys {
            unsafe { remove_appbar(raw) }
        }
    }
}

#[cfg(windows)]
#[tauri::command]
pub fn appbar_dock(app: tauri::AppHandle, label: String, height: u32) -> Result<(), String> {
    use tauri::Manager;
    let window = app
        .get_webview_window(&label)
        .ok_or_else(|| format!("window '{label}' not found"))?;
    let raw = window.hwnd().map_err(|e| e.to_string())?.0 as isize;
    // WndProc subclassing and appbar messages must run on the window's thread.
    window
        .run_on_main_thread(move || unsafe { win::dock(raw, height as i32) })
        .map_err(|e| e.to_string())
}

#[cfg(windows)]
#[tauri::command]
pub fn appbar_undock(app: tauri::AppHandle, label: String) -> Result<(), String> {
    use tauri::Manager;
    let Some(window) = app.get_webview_window(&label) else {
        cleanup_all();
        return Ok(());
    };
    let raw = window.hwnd().map_err(|e| e.to_string())?.0 as isize;
    window
        .run_on_main_thread(move || unsafe { win::undock(raw) })
        .map_err(|e| e.to_string())
}

/// Safety net for window close/destroy — releases every reserved strip.
#[cfg(windows)]
pub fn cleanup_all() {
    win::cleanup_all()
}

#[cfg(not(windows))]
#[tauri::command]
pub fn appbar_dock(_app: tauri::AppHandle, _label: String, _height: u32) -> Result<(), String> {
    Err("AppBar docking is only supported on Windows".into())
}

#[cfg(not(windows))]
#[tauri::command]
pub fn appbar_undock(_app: tauri::AppHandle, _label: String) -> Result<(), String> {
    Err("AppBar docking is only supported on Windows".into())
}

#[cfg(not(windows))]
pub fn cleanup_all() {}
