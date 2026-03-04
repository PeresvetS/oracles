import { ApiProperty } from '@nestjs/swagger';
import { IsString, MinLength } from 'class-validator';

/** DTO для отправки пользовательского сообщения */
export class SendMessageDto {
  @ApiProperty({ description: 'Текст сообщения' })
  @IsString()
  @MinLength(1, { message: 'Сообщение не может быть пустым' })
  content!: string;
}
