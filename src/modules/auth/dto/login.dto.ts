import { IsEmail, IsIn, IsString, MinLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

export class LoginRequestDto {
  @IsEmail({}, { message: 'E-mail invalido' })
  email!: string;

  @IsString()
  @MinLength(1, { message: 'Senha obrigatoria' })
  password!: string;

  @IsIn(['colaborador', 'operacoes'])
  expectedRole!: 'colaborador' | 'operacoes';
}

export class LoginResponseDto {
  @ApiProperty()
  token!: string;
  @ApiPropertyOptional()
  refreshToken?: string;
  @ApiProperty({ enum: ['colaborador', 'operacoes'] })
  role!: 'colaborador' | 'operacoes';
  @ApiProperty()
  userId!: string;
}

export class RefreshRequestDto extends createZodDto(z.object({
  refreshToken: z.string().min(1).max(4096),
}).strict()) {}
