const API_BASE = (import.meta.env.VITE_API_URL || "/api").replace(/\/$/, "");

export class ApiError extends Error {
  constructor(message, status, code, details) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

function readToken() {
  try {
    return localStorage.getItem("sf_token") || "";
  } catch {
    return "";
  }
}

export function setToken(token) {
  try {
    if (token) localStorage.setItem("sf_token", token);
    else localStorage.removeItem("sf_token");
  } catch {
    /* storage disabled */
  }
}

/**
 * Single API entry point. Every response uses the { ok, data } / { ok, message }
 * envelope from the backend, so error handling lives in exactly one place.
 */
export async function api(path, { method = "GET", body, signal, raw = false } = {}) {
  const headers = {};
  const token = readToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined && !(body instanceof FormData)) {
    headers["Content-Type"] = "application/json";
  }
  const isWrite = method && method !== "GET";
  const delays = [0, 450, 1100];
  let lastErr = null;
  let response;
  for (let attempt = 0; attempt < delays.length; attempt += 1) {
    if (delays[attempt]) await new Promise((r) => setTimeout(r, delays[attempt]));
    try {
      response = await fetch(API_BASE + path, {
        method,
        headers,
        credentials: "include",
        signal,
        body: body === undefined ? undefined : body instanceof FormData ? body : JSON.stringify(body),
      });
      lastErr = null;
      break;
    } catch (err) {
      if (err.name === "AbortError") throw err;
      lastErr = err;
      // Never retry writes blindly more than once: a retried POST can create a
      // duplicate record if the first attempt actually reached the server.
      if (isWrite && attempt >= 1) break;
    }
  }
  if (!response) {
    const host = (() => { try { return new URL(API_BASE).host; } catch { return "the configured server"; } })();
    throw new ApiError(
      `Cannot reach the StudyFlow server at ${host} after ${delays.length} attempts. ` +
        "Your data is safe — check your connection or try again in a moment.",
      0,
      "NETWORK",
    );
  }
  if (raw) return response;
  const text = await response.text();
  let payload = {};
  try {
    payload = text ? JSON.parse(text) : {};
  } catch {
    payload = {};
  }
  if (!response.ok || payload.ok === false) {
    const friendly =
      payload.message ||
      (response.status >= 500
        ? `StudyFlow server error (${response.status}). It is likely temporary — please retry.`
        : response.status === 401
          ? "Your session expired. Please log in again."
          : response.status === 403
            ? "You do not have access to this. Please log in again."
            : response.status === 404
              ? "This item no longer exists (it may have been deleted)."
              : response.status === 409
                ? "This conflicts with something already saved. Adjust and retry."
                : `Request failed (${response.status}).`);
    throw new ApiError(friendly, response.status, payload.code, payload.details);
  }
  return payload.data;
}

export const get = (path, opts) => api(path, opts);
export const post = (path, body, opts) => api(path, { ...opts, method: "POST", body });
export const put = (path, body, opts) => api(path, { ...opts, method: "PUT", body });
export const patch = (path, body, opts) => api(path, { ...opts, method: "PUT", body }); // compat: server has no PATCH; PUT is the update verb
export const del = (path, body, opts) => api(path, { ...opts, method: "DELETE", body });

export function uploadFile(file, subjectId) {
  const form = new FormData();
  form.append("file", file);
  if (subjectId) form.append("subjectId", subjectId);
  return api("/library/files", { method: "POST", body: form });
}

export { API_BASE };
