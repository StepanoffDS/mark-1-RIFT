import type { Request } from 'express';

export type RequestWithCookies = Request & {
  cookies: Record<string, string | undefined>;
};
