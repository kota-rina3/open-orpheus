use napi::{Env, Result, bindgen_prelude::Buffer};
use napi_derive::napi;
use objc2::{class, msg_send, runtime::AnyObject, sel};
use objc2_foundation::NSPoint;

unsafe fn create_drag_event(window: *mut AnyObject) -> *mut AnyObject {
    let local: NSPoint = unsafe { msg_send![window, mouseLocationOutsideOfEventStream] };
    let now: f64 = unsafe { msg_send![class!(NSDate), timeIntervalSinceReferenceDate] };
    let window_number: isize = unsafe { msg_send![window, windowNumber] };
    unsafe {
        msg_send![class!(NSEvent),
            mouseEventWithType: 1usize,
            location: local,
            modifierFlags: 0usize,
            timestamp: now,
            windowNumber: window_number,
            context: std::ptr::null_mut::<AnyObject>(),
            eventNumber: 0isize,
            clickCount: 1isize,
            pressure: 1.0f32,
        ]
    }
}

#[napi]
pub fn drag_window(env: Env, hwnd: Buffer) -> Result<()> {
    if hwnd.len() < std::mem::size_of::<usize>() {
        return env.throw("Invalid buffer size for native handle");
    }

    let mut bytes = [0u8; std::mem::size_of::<usize>()];
    bytes.copy_from_slice(&hwnd[..std::mem::size_of::<usize>()]);
    let view = usize::from_ne_bytes(bytes) as *mut AnyObject;
    if view.is_null() {
        return env.throw("Null native pointer");
    }

    let window: *mut AnyObject = unsafe { msg_send![view, window] };
    if window.is_null() {
        return env.throw("Could not resolve NSWindow from NSView handle");
    }

    let can_drag: bool =
        unsafe { msg_send![window, respondsToSelector: sel!(performWindowDragWithEvent:)] };
    if !can_drag {
        return env.throw("performWindowDragWithEvent is unavailable on this system");
    }

    unsafe {
        let event = create_drag_event(window);
        let _: () = msg_send![window, performWindowDragWithEvent: event];
    }

    Ok(())
}
