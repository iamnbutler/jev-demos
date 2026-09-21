/** Vite's build-time base keeps API/data requests under the demo's hosting prefix. */
export const appPath = (path: string) => import.meta.env.BASE_URL + path.replace(/^\/+/, "");
