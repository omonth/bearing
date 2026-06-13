import type { Bearing } from "@/types";

const API_BASE = "/api";

async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${url}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...options?.headers,
    },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: "请求失败" }));
    throw new Error(err.error || `HTTP ${res.status}`);
  }
  return res.json();
}

export const getProducts = (category?: string) =>
  request<Bearing[]>(
    `/bearings${category && category !== "全部" ? `?category=${category}` : ""}`
  );

export const getProduct = (id: number) => request<Bearing>(`/bearings/${id}`);

export const getCategories = () => request<string[]>("/categories");

export const getSimilarProducts = (productId: number, limit = 5) =>
  request<Bearing[]>(`/recommendations/similar/${productId}?limit=${limit}`);
