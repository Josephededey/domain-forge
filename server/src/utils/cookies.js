export const SESSION_COOKIE = 'df_session';

const base = (config) => ({
  httpOnly: true,
  sameSite: 'lax',
  secure: config.NODE_ENV === 'production',
  path: '/',
});

export const setSessionCookie = (res, token, config) =>
  res.cookie(SESSION_COOKIE, token, { ...base(config), maxAge: config.SESSION_TTL_HOURS * 3600 * 1000 });

export const clearSessionCookie = (res, config) => res.clearCookie(SESSION_COOKIE, base(config));
