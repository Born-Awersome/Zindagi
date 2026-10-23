# Recording from phones and other laptops

The camera belongs to the device opening the page, not to the backend PC. Browsers allow camera/microphone access on http://localhost as a development exception. They block it on ordinary network URLs such as http://192.168.1.10:3001. Every remote device must open a **trusted HTTPS URL**. Allowing permissions or adding CORS headers cannot fix an insecure connection.

## Fastest option for a hackathon: an HTTPS tunnel

This keeps SQLite and the backend on your host PC while Cloudflare provides a trusted HTTPS address. Internet access is required. The URL is publicly reachable while the tunnel runs; share it only with intended participants. Cloudflare transports app traffic, including submitted recordings.

On Windows, install Cloudflare's tunnel client once:

    winget install --id Cloudflare.cloudflared --exact

Reopen PowerShell after installation. In the Zindagi folder, update and build:

    git pull origin main
    npm.cmd install
    npm.cmd run build

For this tunnel option, leave HTTPS_CERT, HTTPS_KEY, and APP_ORIGIN unset in .env. If APP_ORIGIN is already configured, remove it for the temporary tunnel or set it to the exact new HTTPS origin (no trailing slash) and restart the backend. An old localhost origin will reject remote submissions.

Start the backend in the first terminal:

    $env:NODE_ENV="production"
    $env:HOST="127.0.0.1"
    npm.cmd start

In a second terminal:

    cloudflared tunnel --url http://127.0.0.1:3001

If you changed PORT, use that port instead. Copy the printed https://....trycloudflare.com URL. Open **that same HTTPS URL on every device**, including the host, and sign in. Allow both camera and microphone, then record. Keep both terminals running. Do not use the old HTTP IP URL or Vite port 5173. The link changes when the tunnel restarts, but account data stays in SQLite. Quick tunnels are for temporary demos.

If cloudflared reports that quick tunnels cannot run with an existing configuration file, use a configured named tunnel or follow the LAN option below.

## Local Wi-Fi only: native HTTPS

The app also supports HTTPS directly without a tunnel. Use a locally trusted development certificate, for example with [mkcert](https://github.com/FiloSottile/mkcert). Replace 192.168.1.10 below with the host PC's IPv4 address from ipconfig:

    mkcert -install
    mkdir certs
    mkcert -cert-file certs/lan.pem -key-file certs/lan-key.pem localhost 127.0.0.1 ::1 192.168.1.10

Add these settings to .env:

    HTTPS_CERT=certs/lan.pem
    HTTPS_KEY=certs/lan-key.pem
    HOST=0.0.0.0
    PORT=3001

Build with npm.cmd run build, then run npm.cmd start. Allow inbound TCP port 3001 on your Windows **private network**, and open https://192.168.1.10:3001 on other devices on the same Wi-Fi. If HOST was set in PowerShell for the tunnel, reopen PowerShell first; shell variables override .env.

Each client device must trust this development CA:
- Find the CA directory using mkcert -CAROOT. Transfer only **rootCA.pem** to devices you control. **Never share rootCA-key.pem or lan-key.pem**.
- On Windows, install the CA certificate into Trusted Root Certification Authorities for the current user.
- On iPhone/iPad, install the certificate profile, then enable full trust under Settings → General → About → Certificate Trust Settings.
- On Android, install the CA through Settings → Security → Encryption & credentials → Install a certificate → CA certificate (names vary). Browser/managed-device policies may restrict user-installed CAs; use the tunnel option if so.
- Firefox may require importing the CA in its certificate authorities settings.

The browser must accept the certificate without a warning. Clicking past a certificate warning is not a reliable camera fix. If the host IP changes, issue a new certificate including the new address. Certificates and keys are ignored by Git. If APP_ORIGIN is set, use the exact HTTPS origin shared by the clients.

Use npm start with the built site for native HTTPS; the Vite development proxy is configured for an HTTP backend.

## If a trusted HTTPS page still cannot record

Open the URL directly in a current browser, not inside a social/chat app. Allow both camera and microphone in browser site settings and the device's app permissions. Close other apps using the camera. On iOS use an up-to-date Safari first. The app displays separate messages for insecure connections, denied permissions, missing devices, and unsupported recording.

All accounts use the same database on the host. Each device records its own camera, and submission is sent to that same backend.
