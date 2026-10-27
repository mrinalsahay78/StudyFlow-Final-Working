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
  let response;
  try {
    response = await fetch(API_BASE + path, {
      method,
      headers,
      credentials: "include",
      signal,
      body: body === undefined ? undefined : body instanceof FormData ? body : JSON.stringify(body),
    });
  } catch (err) {
    if (err.name === "AbortError") throw err;
    throw new ApiError(
      "Cannot reach the StudyFlow server. Check that the backend is running.",
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
    throw new ApiError(
      payload.message || `Request failed (${response.status})`,
      response.status,
      payload.code,
      payload.details,
    );
  }
  return payload.data;
}

export const get = (path, opts) => api(path, opts);
export const post = (path, body, opts) => api(path, { ...opts, method: "POST", body });
export const put = (path, body, opts) => api(path, { ...opts, method: "PUT", body });
export const patch = (path, body, opts) => api(path, { ...opts, method: "PATCH", body });
export const del = (path, body, opts) => api(path, { ...opts, method: "DELETE", body });

export function uploadFile(file, subjectId) {
  const form = new FormData();
  form.append("file", file);
  if (subjectId) form.append("subjectId", subjectId);
  return api("/library/files", { method: "POST", body: form });
}

export { API_BASE };
