/** Пользователь, прошедший JWT-аутентификацию (без поля password) */
export interface AuthenticatedUser {
  id: string;
  email: string;
  name: string;
  createdAt: Date;
}

/** Payload JWT-токена */
export interface JwtPayload {
  sub: string;
  email: string;
}

/** Ответ на успешный логин */
export interface LoginResponse {
  accessToken: string;
  user: AuthenticatedUser;
}
