// ─── Tauri application entry point ───────────────────────────────────────────
// Database operations are handled on the JS side via @tauri-apps/plugin-sql.
// Custom commands: OAuth loopback listener for Google Drive sync.

use std::io::{BufRead, BufReader, Write};
use std::net::TcpListener;
use std::sync::Mutex;
use tauri::State;

struct OAuthListener(Mutex<Option<TcpListener>>);

/// Bind a loopback listener on a fixed port (19284). Returns the port number.
/// Fixed port allows a single OAuth Web client for both desktop and PWA.
/// JS uses this port to build redirect_uri, then calls oauth_await_code.
const OAUTH_PORT: u16 = 19284;

#[tauri::command]
fn oauth_start(state: State<'_, OAuthListener>) -> Result<u16, String> {
    let listener = TcpListener::bind(("127.0.0.1", OAUTH_PORT)).map_err(|e| e.to_string())?;
    *state.0.lock().map_err(|e| e.to_string())? = Some(listener);
    Ok(OAUTH_PORT)
}

/// Wait for the OAuth redirect on the previously bound listener.
/// Extracts the authorization code from the query string, responds with
/// a success page, and returns the code. Blocks until the redirect arrives.
#[tauri::command]
async fn oauth_await_code(state: State<'_, OAuthListener>) -> Result<String, String> {
    let listener = state.0.lock().map_err(|e| e.to_string())?
        .take()
        .ok_or("No OAuth listener active")?;

    tokio::task::spawn_blocking(move || -> Result<String, String> {
        use std::time::Duration;
        listener.set_nonblocking(false).map_err(|e| e.to_string())?;
        // 5-minute timeout for user to complete auth
        listener.set_ttl(300).ok();
        let _ = std::net::TcpStream::connect_timeout(
            &"0.0.0.0:0".parse().unwrap(),
            Duration::from_secs(0),
        );

        let (mut stream, _) = listener.accept().map_err(|e| e.to_string())?;
        let mut reader = BufReader::new(stream.try_clone().map_err(|e| e.to_string())?);
        let mut request_line = String::new();
        reader.read_line(&mut request_line).map_err(|e| e.to_string())?;

        // Parse code from "GET /?code=AUTH_CODE&scope=... HTTP/1.1"
        let code = request_line
            .split_whitespace()
            .nth(1) // the path
            .and_then(|path| {
                url::form_urlencoded::parse(path.split('?').nth(1).unwrap_or("").as_bytes())
                    .find(|(k, _)| k == "code")
                    .map(|(_, v)| v.to_string())
            })
            .ok_or_else(|| "No authorization code in redirect".to_string())?;

        // Respond with a success page
        let body = "<html><body style='font-family:system-ui;text-align:center;padding:60px'>\
                     <h2>Authorization successful</h2>\
                     <p>You can close this tab and return to Task Orchestrator.</p>\
                     </body></html>";
        let response = format!(
            "HTTP/1.1 200 OK\r\nContent-Type: text/html\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
            body.len(),
            body
        );
        stream.write_all(response.as_bytes()).ok();
        stream.flush().ok();

        Ok(code)
    })
    .await
    .map_err(|e| e.to_string())?
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(OAuthListener(Mutex::new(None)))
        .plugin(tauri_plugin_sql::Builder::default().build())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_http::init())
        .invoke_handler(tauri::generate_handler![oauth_start, oauth_await_code])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
