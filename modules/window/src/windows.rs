use napi::{Env, Result, bindgen_prelude::Buffer};
use napi_derive::napi;

#[napi]
pub fn drag_window(env: Env, hwnd: Buffer) -> Result<()> {
    use windows::Win32::{
        Foundation::{HWND, LPARAM, WPARAM},
        UI::WindowsAndMessaging::{HTCAPTION, SC_MOVE, WM_SYSCOMMAND},
        UI::{Input::KeyboardAndMouse::ReleaseCapture, WindowsAndMessaging::SendMessageW},
    };
    if hwnd.len() != std::mem::size_of::<isize>() {
        return env.throw("Invalid buffer size for window handle");
    }
    let hwnd = isize::from_ne_bytes(hwnd.as_ref().try_into().unwrap());
    let hwnd = HWND(hwnd as _);
    unsafe {
        ReleaseCapture().unwrap();
        SendMessageW(
            hwnd,
            WM_SYSCOMMAND,
            Some(WPARAM((SC_MOVE | HTCAPTION) as _)),
            Some(LPARAM(0)),
        );
    }
    Ok(())
}
