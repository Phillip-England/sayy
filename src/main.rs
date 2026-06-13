use std::env;
use std::io::{BufRead, BufReader, Write};
use std::net::{TcpListener, TcpStream};
use std::thread;

const INDEX_HTML: &str = include_str!("../static/index.html");
const APP_CSS: &str = include_str!("../static/app.css");
const APP_JS: &str = include_str!("../static/app.js");

fn main() -> std::io::Result<()> {
    let host = env::var("SAYY_HOST").unwrap_or_else(|_| "127.0.0.1".to_string());
    let port = env::var("SAYY_PORT").unwrap_or_else(|_| "8787".to_string());
    let addr = format!("{host}:{port}");
    let listener = TcpListener::bind(&addr)?;

    println!("sayy listening on http://{addr}");

    for stream in listener.incoming() {
        match stream {
            Ok(stream) => {
                thread::spawn(|| {
                    if let Err(error) = handle_connection(stream) {
                        eprintln!("request failed: {error}");
                    }
                });
            }
            Err(error) => eprintln!("connection failed: {error}"),
        }
    }

    Ok(())
}

fn handle_connection(mut stream: TcpStream) -> std::io::Result<()> {
    let mut reader = BufReader::new(stream.try_clone()?);
    let mut request_line = String::new();
    reader.read_line(&mut request_line)?;

    let mut parts = request_line.split_whitespace();
    let method = parts.next().unwrap_or_default();
    let raw_path = parts.next().unwrap_or("/");
    let path = raw_path.split('?').next().unwrap_or("/");

    let response = if method != "GET" && method != "HEAD" {
        response(
            "405 Method Not Allowed",
            "text/plain; charset=utf-8",
            "method not allowed",
        )
    } else {
        match path {
            "/" | "/index.html" | "/controls" | "/controls/" => {
                response("200 OK", "text/html; charset=utf-8", INDEX_HTML)
            }
            "/app.css" => response("200 OK", "text/css; charset=utf-8", APP_CSS),
            "/app.js" => response("200 OK", "application/javascript; charset=utf-8", APP_JS),
            "/health" => response("200 OK", "text/plain; charset=utf-8", "ok\n"),
            _ => response("404 Not Found", "text/plain; charset=utf-8", "not found\n"),
        }
    };

    if method == "HEAD" {
        let head = response.split("\r\n\r\n").next().unwrap_or_default();
        stream.write_all(format!("{head}\r\n\r\n").as_bytes())?;
    } else {
        stream.write_all(response.as_bytes())?;
    }

    stream.flush()
}

fn response(status: &str, content_type: &str, body: &str) -> String {
    format!(
        "HTTP/1.1 {status}\r\nContent-Type: {content_type}\r\nContent-Length: {}\r\nCache-Control: no-store\r\nX-Content-Type-Options: nosniff\r\nConnection: close\r\n\r\n{body}",
        body.as_bytes().len()
    )
}
