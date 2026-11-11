import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

export class LoginRequestDto extends createZodDto(z.object({
  email: z.string().email(), password: z.string().min(1).max(4096),
  expectedRole: z.enum(['colaborador', 'operacoes']),
}).strict()) {}

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
