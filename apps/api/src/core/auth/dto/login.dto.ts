import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsString, MinLength } from 'class-validator';

/** DTO для входа в систему */
export class LoginDto {
  @ApiProperty({ description: 'Email пользователя', example: 'admin@besales.app' })
  @IsEmail({}, { message: 'Некорректный email' })
  email!: string;

  @ApiProperty({ description: 'Пароль (минимум 6 символов)', minLength: 6 })
  @IsString()
  @MinLength(6, { message: 'Пароль должен содержать минимум 6 символов' })
  password!: string;
}
