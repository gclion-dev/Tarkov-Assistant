export interface AuthUser {
  id: string;
  email: string;
  nickname: string;
}

export interface AuthSession {
  accessToken: string;
  user: AuthUser;
}
