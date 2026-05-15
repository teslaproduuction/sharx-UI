import axios, { type AxiosError } from "axios";
import Qs from "qs";

const api = axios.create({
  withCredentials: true,
});

api.defaults.headers.post["Content-Type"] =
  "application/x-www-form-urlencoded; charset=UTF-8";
api.defaults.headers.common["X-Requested-With"] = "XMLHttpRequest";

api.interceptors.request.use(
  (config) => {
    if (config.data === undefined || config.data === null) {
      return config;
    }
    if (config.data instanceof FormData) {
      if (config.headers) {
        config.headers["Content-Type"] = "multipart/form-data";
      }
    } else if (
      config.headers &&
      config.headers["Content-Type"] === "application/json"
    ) {
      config.data = JSON.stringify(config.data);
    } else {
      config.data = Qs.stringify(config.data, { arrayFormat: "repeat" });
    }
    return config;
  },
  (err) => Promise.reject(err)
);

api.interceptors.response.use(
  (response) => response,
  (error: AxiosError) => {
    if (error.response?.status === 401) {
      // Soft-redirect to root — root index controller renders the login page when
      // session is invalid. Hard reload caused redirect loops on subpath-mounted
      // panels (cookie/path edge cases) — sending the user to the login page once
      // and stopping is safer than reloading the same protected URL.
      if (typeof window !== "undefined") {
        const base = (process.env.NEXT_PUBLIC_BASE_PATH || "").replace(/\/$/, "");
        if (window.location.pathname !== `${base}/` && window.location.pathname !== "/") {
          window.location.href = `${base}/` || "/";
        }
      }
    }
    return Promise.reject(error);
  }
);

export type Msg<T = unknown> = { success: boolean; msg: string; obj: T };

export async function getJson<T = unknown>(url: string) {
  const { data } = await api.get<Msg<T>>(url);
  return data;
}

export async function postJson<T = unknown>(
  url: string,
  body?: unknown,
  contentTypeJson?: boolean
) {
  const { data } = await api.post<Msg<T>>(url, body ?? {}, {
    headers: contentTypeJson
      ? { "Content-Type": "application/json" }
      : undefined,
  });
  return data;
}

export { api };
