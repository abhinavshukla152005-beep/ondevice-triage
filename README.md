# On-Device Triage

A log-triage UI that sends incident text to Gemini Nano inside the browser and only
falls back to the cloud when the device model cannot serve the request.

Built for the **#BuildHybridAI** hackathon track: Firebase AI Logic with hybrid
inference (on-device Gemini Nano in Chrome, cloud Gemini as the fallback).

## How the routing works

`getGenerativeModel(ai, { mode })` takes one of three Firebase AI Logic inference
modes, mapped to the dropdown:

| UI mode | `InferenceMode` | Behaviour |
| --- | --- | --- |
| Hybrid | `PREFER_ON_DEVICE` | Uses the Chrome built-in model when available, otherwise the cloud |
| On-device only | `ONLY_ON_DEVICE` | Throws instead of ever leaving the device |
| Cloud only | `ONLY_IN_CLOUD` | Always the hosted model |

The result panel reports which path actually served the request. That claim is not
a guess: while the request runs, `fetch` is tapped and any call to the Firebase AI
endpoint is counted, so "0 network calls" means the incident text really never left
the machine.

## Prerequisites

- Chrome on desktop with the built-in `LanguageModel` API exposed. Check
  `await LanguageModel.availability()` in the console: `available`,
  `downloadable`, `downloading` or `unavailable`. `downloadable` means the model
  (~2 GB) will download the first time you press **Triage**.

  If `LanguageModel` is `undefined`, the API is not exposed in that build. Chrome
  157 only exposes it with the on-device AI features enabled, e.g.:

  ```sh
  chrome.exe --enable-features=PromptAPIForGeminiNano,OptimizationGuideOnDeviceModel,AIPromptAPI
  ```

  Confirm with `typeof LanguageModel` before blaming the app.
- A Firebase project with **Firebase AI Logic** enabled and a registered web app.

## App Check

Firebase AI Logic enforces App Check, so the app initialises it before creating the
AI instance.

For local development use a registered **debug token**:

1. Firebase console → App Check → Apps → your web app → **Manage debug tokens** →
   **Add debug token**. Use any UUID as the value.
2. Store it in this browser once, then reload:

   ```js
   localStorage.setItem("appcheckDebugToken", "<your-token>");
   ```

   Or pass it in the URL: `http://127.0.0.1:8080/?debugToken=<your-token>`.

A deployed build should replace the placeholder provider in `app.js` with
`ReCaptchaEnterpriseProvider` and a reCAPTCHA site key.

## Configuration

`app.js` holds the `firebaseConfig` object from **Project settings → Your apps**.
Those values are public identifiers, not secrets.

## Running

The page is static, so any static server works:

```bash
python -m http.server 8080
```

Then open `http://127.0.0.1:8080/`.

The model download is only allowed from a real user gesture, so the first on-device
request has to come from an actual click on **Triage** — not from script.

## Files

- `index.html` — layout
- `styles.css` — styling, including the path/egress chips
- `app.js` — Firebase init, App Check, inference modes, fetch tap, result rendering

## Notes

- `GoogleAIBackend` routes through `firebasevertexai.googleapis.com`; App Check
  must be configured or every request returns `401 Firebase App Check token is invalid`.
- The on-device path is only taken when the browser reports the model as available.
  With `PREFER_ON_DEVICE` the SDK silently falls back to the cloud, which is why the
  UI shows the observed network activity next to the reported route.
