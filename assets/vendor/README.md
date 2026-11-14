# QR generator

`qrcode-generator.js` is the unmodified ESM build (`dist/qrcode.mjs`) of
[qrcode-generator 2.0.4](https://www.npmjs.com/package/qrcode-generator), by Kazuhiko
Arase, distributed under the MIT license. Its copyright and license notice are
retained at the top of the file.

Source: https://github.com/kazuhikoarase/qrcode-generator/tree/master/js

The browser loads it only when a visitor requests a manifest QR code. QR data
stays in the browser; no external QR service, runtime CDN, or server request is used.
