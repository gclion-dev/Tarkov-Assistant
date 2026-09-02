export interface AuthUser {
  id: string;
  email: string;
  nickname: string;
}

export interface AuthSession {
  accessToken: string;
  user: AuthUser;
}

/** 服务端公开的注册相关配置，登录页据此决定表单字段。 */
export interface AuthConfig {
  inviteRequired: boolean;
}
