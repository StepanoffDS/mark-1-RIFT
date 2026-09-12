export type Credentials = {
  accessToken: string;
  refreshToken: string;
};

export enum AuthCookie {
  Access = 'access',
  Refresh = 'refresh',
  Csrf = 'csrf',
}
