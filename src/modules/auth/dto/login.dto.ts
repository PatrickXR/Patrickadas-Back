import { IsEmail, IsIn, IsString, MinLength } from 'class-validator';

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
  token!: string;
  role!: 'colaborador' | 'operacoes';
  userId!: string;
}
