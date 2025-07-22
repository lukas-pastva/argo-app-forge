export const rand = () =>
  crypto.randomUUID?.() ?? Math.random().toString(36).slice(2, 12);
export const genPass   = () => rand();
export const genCookie = () => crypto.randomUUID().replace(/-/g, "");
