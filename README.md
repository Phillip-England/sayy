# sayy

sayy is a single-binary Rust web app for creating markdown with voice input and a few keyboard commands. The server only serves static client assets; markdown is created in the browser and is not saved on disk.

## Run

```sh
cargo run
```

Then open `http://127.0.0.1:8787`.

Optional bind settings:

```sh
SAYY_HOST=0.0.0.0 SAYY_PORT=8787 cargo run --release
```

## Controls

- `Enter`: start recording
- `1`: start a `#` heading
- `2`: start a `##` heading
- `3`: start a `###` heading
- `4`: start a `####` heading
- `P`: start a paragraph
- `\` while recording: stop and copy generated markdown to the clipboard
- `Backspace`: copy generated markdown to the clipboard, clear it, and reset the page

The recording page also includes a compact bottom control bar for touch devices with start/copy, heading, paragraph, and copy/clear controls.

Speech recognition requires browser support for the Web Speech API. Chrome is the best target; Safari support depends on the installed version and platform settings.
