import { Body, Controller, Get, HttpCode, HttpStatus, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { AuthService } from '@core/auth/auth.service';
import { LoginDto } from '@core/auth/dto/login.dto';
import type {
  AuthenticatedUser,
  LoginResponse,
} from '@core/auth/interfaces/authenticated-user.interface';
import { CurrentUser } from '@shared/decorators/current-user.decorator';
import { JwtAuthGuard } from '@shared/guards/jwt-auth.guard';

/**
 * Контроллер аутентификации.
 * Предоставляет эндпоинты для входа и получения текущего пользователя.
 */
@ApiTags('Авторизация')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  /**
   * Вход в систему — возвращает JWT-токен и данные пользователя.
   */
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Вход в систему' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Успешный вход, токен выдан' })
  @ApiResponse({ status: HttpStatus.UNAUTHORIZED, description: 'Неверный email или пароль' })
  async login(@Body() dto: LoginDto): Promise<LoginResponse> {
    return this.authService.login(dto.email, dto.password);
  }

  /**
   * Получить данные текущего авторизованного пользователя.
   */
  @Get('me')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT')
  @ApiOperation({ summary: 'Текущий пользователь' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Данные текущего пользователя' })
  @ApiResponse({ status: HttpStatus.UNAUTHORIZED, description: 'Токен невалиден или отсутствует' })
  getMe(@CurrentUser() user: AuthenticatedUser): AuthenticatedUser {
    return user;
  }
}
