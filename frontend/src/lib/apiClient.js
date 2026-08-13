import axios from "axios";

export const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
export const API = `${BACKEND_URL}/api`;

const TOKEN_KEY = "im_token";

export const getToken = () => localStorage.getItem(TOKEN_KEY);
export const setToken = (t) => (t ? localStorage.setItem(TOKEN_KEY, t) : localStorage.removeItem(TOKEN_KEY));

export const api = axios.create({ baseURL: API, withCredentials: true });

api.interceptors.request.use((config) => {
  const token = getToken();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

export function apiError(detail, fallback = "Something went wrong. Please try again.") {
  const d = detail?.response?.data?.detail ?? detail;
  if (d == null) return detail?.message || fallback;
  if (typeof d === "string") return d;
  if (Array.isArray(d)) return d.map((e) => (typeof e?.msg === "string" ? e.msg : JSON.stringify(e))).join(" ");
  if (typeof d?.msg === "string") return d.msg;
  return String(d);
}

export const mediaUrl = (mediaId) => `${API}/media/${mediaId}/file?auth=${getToken() || ""}`;

export const formatBytes = (bytes) => {
  if (!bytes) return "0 KB";
  const units = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
};

export const timeAgo = (iso) => {
  if (!iso) return "Never";
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return "Just now";
  if (diff < 3600) return `${Math.floor(diff / 60)} min ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} hr ago`;
  return `${Math.floor(diff / 86400)} d ago`;
};

export const formatDate = (iso) =>
  iso ? new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }) : "—";
