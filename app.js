import { initializeApp } from "https://www.gstatic.com/firebasejs/13.1.0/firebase-app.js";
import { initializeAppCheck } from "https://www.gstatic.com/firebasejs/13.1.0/firebase-app-check.js";
import {
  GoogleAIBackend,
  InferenceMode,
  getAI,
  getGenerativeModel,
} from "https://www.gstatic.com/firebasejs/13.1.0/firebase-ai.js";

const firebaseConfig = {
  apiKey: "AIzaSyBXQcGS4e1I1N4axd8t2_s4BpRYG8tPiFQ",
  authDomain: "default-gemini-project-98b1f.firebaseapp.com",
  projectId: "default-gemini-project-98b1f",
  storageBucket: "default-gemini-project-98b1f.firebasestorage.app",
  messagingSenderId: "163668924289",
  appId: "1:163668924289:web:298d2b76ed83fa8e637a80",
};

const app = initializeApp(firebaseConfig);

// Firebase AI Logic enforces App Check. Locally we run with a debug token that
// is registered in the Firebase console; a deployed build should swap this for
// ReCaptchaEnterpriseProvider with a reCAPTCHA site key.
const debugToken =
  new URLSearchParams(location.search).get("debugToken") ??
  localStorage.getItem("appcheckDebugToken");
if (debugToken) self.FIREBASE_APPCHECK_DEBUG_TOKEN = debugToken;

initializeAppCheck(app, {
  provider: {
    initialize: () => {},
    getToken: async () => {
      throw new Error(
        "No App Check credential. Register a debug token (see README) or configure reCAPTCHA Enterprise.",
      );
    },
  },
  isTokenAutoRefreshEnabled: true,
});

const ai = getAI(app, { backend: new GoogleAIBackend() });

const MODES = {
  hybrid: InferenceMode.PREFER_ON_DEVICE,
  local: InferenceMode.ONLY_ON_DEVICE,
  cloud: InferenceMode.ONLY_IN_CLOUD,
};

const SAMPLE = `2026-11-19T04:12:07Z sensor-gateway watchdog: thread 7 missed deadline by 1800ms
2026-11-19T04:12:08Z io-pkt: rx queue on en0 depth 512 (limit 256)
2026-11-19T04:12:11Z devc-ser8250: interrupt latency spike 41ms
2026-11-19T04:12:12Z slogger2: disk write backlog 74%`;

const prompt = (incident) => `You triage production incidents for embedded systems.

Return only JSON with these keys:
  severity: one of critical, high, medium, low
  component: the subsystem most likely at fault
  likely_cause: one sentence
  next_action: one concrete command or check

Incident:
${incident}`;

const $ = (id) => document.getElementById(id);
const deviceChip = $("device");
const status = $("status");
const result = $("result");

const GOOGLE_API = /generativelanguage\.googleapis\.com|firebasevertexai\.googleapis\.com/;
const realFetch = globalThis.fetch.bind(globalThis);
let cloudRequests = 0;

function tapFetch() {
  cloudRequests = 0;
  globalThis.fetch = (input, init) => {
    const url = typeof input === "string" ? input : (input?.url ?? "");
    if (GOOGLE_API.test(url)) cloudRequests += 1;
    return realFetch(input, init);
  };
}

function restoreFetch() {
  globalThis.fetch = realFetch;
}

async function probeDevice() {
  if (!("LanguageModel" in globalThis)) {
    deviceChip.textContent = "no on-device model in this browser";
    deviceChip.className = "chip cloud";
    return "unavailable";
  }
  try {
    const availability = await LanguageModel.availability();
    deviceChip.textContent = `device model: ${availability}`;
    deviceChip.className = "chip " + (availability === "available" ? "local" : "cloud");
    return availability;
  } catch {
    deviceChip.textContent = "device model: probe failed";
    deviceChip.className = "chip error";
    return "unavailable";
  }
}

function modelFor(mode) {
  return getGenerativeModel(ai, { mode: MODES[mode] });
}

async function triage() {
  const incident = $("incident").value.trim();
  if (!incident) {
    status.textContent = "paste an incident first";
    return;
  }

  const mode = $("mode").value;
  const button = $("run");
  button.disabled = true;
  status.className = "status";
  status.textContent = mode === "cloud" ? "running in cloud…" : "preparing on-device model…";
  result.hidden = true;

  try {
    const model = modelFor(mode);
    // The browser only allows the download from a user gesture, i.e. this click.
    const ready = model.initializeDeviceModel((progress) => {
      const shown = progress <= 1 ? `${Math.round(progress * 100)}%` : `${(progress / 1e6).toFixed(0)} MB`;
      status.textContent = `downloading device model… ${shown}`;
    });

    let elapsed = 0;
    let text = "";
    tapFetch();
    try {
      await ready;
      const started = performance.now();
      const completion = await model.generateContent(prompt(incident));
      elapsed = Math.round(performance.now() - started);
      text = completion.response.text();
    } finally {
      restoreFetch();
    }

    const route =
      mode === "local" ? "on-device" :
      mode === "cloud" ? "cloud" :
      cloudRequests === 0 ? "on-device (hybrid)" : "cloud fallback (hybrid)";
    const onDevice = route.startsWith("on-device");

    const pathChip = $("path");
    pathChip.textContent = `route: ${route}`;
    pathChip.className = "chip " + (onDevice ? "local" : "cloud");

    $("latency").textContent = `${elapsed} ms`;

    const egressChip = $("egress");
    egressChip.textContent =
      cloudRequests === 0
        ? "0 network calls — incident never left the device"
        : `${cloudRequests} network call${cloudRequests === 1 ? "" : "s"} to Google`;
    egressChip.className = "chip " + (cloudRequests === 0 ? "local" : "cloud");

    $("output").textContent = format(text);
    result.hidden = false;
    status.textContent = "";
    probeDevice();
  } catch (error) {
    status.textContent = String(error?.message ?? error);
    status.className = "status error";
  } finally {
    button.disabled = false;
  }
}

function format(text) {
  const trimmed = text.trim().replace(/^```(?:json)?\n?|\n?```$/g, "");
  try {
    return JSON.stringify(JSON.parse(trimmed), null, 2);
  } catch {
    return trimmed;
  }
}

$("run").addEventListener("click", triage);
$("sample").addEventListener("click", () => {
  $("incident").value = SAMPLE;
  $("incident").focus();
});

$("incident").value = SAMPLE;
probeDevice();
